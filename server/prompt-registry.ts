import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicJson, dataDir, readJson } from "./storage";

export type PromptModelPolicy = {
  defaultModel: string;
  modelFamily: string;
  allowOverride: boolean;
};

export type PromptTemplateManifestEntry = {
  templateKey: string;
  templateVersion: string;
  title: string;
  stage: string;
  sourceFile: string;
  contentSha256: string;
  modelPolicy: PromptModelPolicy;
  inputModes: string[];
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  active: boolean;
  legacy?: boolean;
  source?: "builtin" | "local-global";
  parentVersion?: string;
  createdAt?: string;
};

export type PromptTemplate = PromptTemplateManifestEntry & {
  systemPrompt: string;
};

type PromptRegistryManifest = {
  schemaVersion: number;
  templates: PromptTemplateManifestEntry[];
};

type StoredGlobalPromptVersion = Omit<PromptTemplateManifestEntry, "sourceFile" | "active" | "legacy" | "source"> & {
  systemPrompt: string;
  source: "local-global";
  parentVersion: string;
  createdAt: string;
};

type WritablePromptRegistry = {
  schemaVersion: 1;
  activeVersions: Record<string, string>;
  versions: StoredGlobalPromptVersion[];
};

const referenceDirectory = path.join(resolveSkillRoot(), "references");
const manifestPath = path.join(referenceDirectory, "prompt-registry.json");
const writableRegistryDirectory = path.dirname(process.env.CROCO_PROMPT_REGISTRY_PATH || path.join(dataDir, "prompt-registry", "registry.json"));
const writableRegistryPath = process.env.CROCO_PROMPT_REGISTRY_PATH || path.join(writableRegistryDirectory, "registry.json");
let manifestPromise: Promise<PromptRegistryManifest> | undefined;
let registryMutationQueue = Promise.resolve();

export async function listPromptTemplates(options: { includeLegacy?: boolean; includeInactive?: boolean } = {}) {
  const templates = await combinedPromptTemplates();
  return templates
    .filter((template) => (options.includeLegacy || !template.legacy) && (options.includeInactive || template.active))
    .map((template) => ({ ...template }));
}

export async function getPromptTemplate(templateKey: string, templateVersion?: string): Promise<PromptTemplate> {
  assertTemplateKey(templateKey);
  const state = await readWritableRegistry();
  const templates = await combinedPromptTemplates(state);
  const candidates = templates.filter((template) => template.templateKey === templateKey && (!templateVersion || template.templateVersion === templateVersion));
  const entry = candidates.find((template) => template.active) || candidates[0];
  if (!entry) throw new PromptTemplateNotFoundError(templateKey, templateVersion);

  if (entry.source === "local-global") {
    const stored = state.versions.find((version) => version.templateKey === entry.templateKey && version.templateVersion === entry.templateVersion);
    if (!stored) throw new PromptTemplateNotFoundError(templateKey, templateVersion);
    if (sha256(Buffer.from(stored.systemPrompt, "utf8")) !== stored.contentSha256) throw new Error(`Prompt 模板完整性校验失败：${entry.templateKey}@${entry.templateVersion}`);
    return { ...entry, systemPrompt: stored.systemPrompt };
  }

  const sourcePath = safeSourcePath(entry.sourceFile);
  const source = await readFile(sourcePath);
  const actualSha256 = sha256(source);
  if (actualSha256 !== entry.contentSha256) {
    throw new Error(`Prompt 模板完整性校验失败：${entry.templateKey}@${entry.templateVersion}`);
  }
  return { ...entry, systemPrompt: source.toString("utf8") };
}

export async function createGlobalPromptVersion(input: { templateKey: string; baseVersion?: string; systemPrompt: string; defaultModel?: string; activate?: boolean }) {
  assertTemplateKey(input.templateKey);
  if (typeof input.systemPrompt !== "string" || !input.systemPrompt.trim() || input.systemPrompt.length > 250_000) throw new Error("Prompt 正文无效");
  return withRegistryMutation(async () => {
    const state = await readWritableRegistry();
    const base = await getPromptTemplate(input.templateKey, input.baseVersion);
    if (input.defaultModel && !base.modelPolicy.allowOverride && input.defaultModel !== base.modelPolicy.defaultModel) throw new Error("该 Prompt 的模型策略不允许覆盖");
    const templates = await combinedPromptTemplates(state);
    const templateVersion = nextPatchVersion(base.templateVersion, templates.filter((item) => item.templateKey === input.templateKey).map((item) => item.templateVersion));
    const createdAt = new Date().toISOString();
    const version: StoredGlobalPromptVersion = {
      templateKey: base.templateKey,
      templateVersion,
      title: base.title,
      stage: base.stage,
      contentSha256: sha256(Buffer.from(input.systemPrompt, "utf8")),
      modelPolicy: { ...base.modelPolicy, ...(input.defaultModel ? { defaultModel: input.defaultModel } : {}) },
      inputModes: [...base.inputModes],
      inputSchema: structuredClone(base.inputSchema),
      ...(base.outputSchema ? { outputSchema: structuredClone(base.outputSchema) } : {}),
      systemPrompt: input.systemPrompt,
      source: "local-global",
      parentVersion: base.templateVersion,
      createdAt,
    };
    state.versions.push(version);
    if (input.activate) state.activeVersions[input.templateKey] = templateVersion;
    await writeWritableRegistry(state);
    return { ...(await getPromptTemplate(input.templateKey, templateVersion)), active: input.activate === true };
  });
}

export async function activateGlobalPromptVersion(templateKey: string, templateVersion: string) {
  assertTemplateKey(templateKey);
  return withRegistryMutation(async () => {
    const state = await readWritableRegistry();
    const exists = (await combinedPromptTemplates(state)).some((item) => item.templateKey === templateKey && item.templateVersion === templateVersion);
    if (!exists) throw new PromptTemplateNotFoundError(templateKey, templateVersion);
    state.activeVersions[templateKey] = templateVersion;
    await writeWritableRegistry(state);
    return getPromptTemplate(templateKey, templateVersion);
  });
}

export async function loadPromptRegistryManifest(): Promise<PromptRegistryManifest> {
  manifestPromise ||= readAndValidateManifest();
  return manifestPromise;
}

export function resetPromptRegistryCacheForTests() {
  manifestPromise = undefined;
}

export class PromptTemplateNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(templateKey: string, templateVersion?: string) {
    super(`Prompt 模板不存在：${templateKey}${templateVersion ? `@${templateVersion}` : ""}`);
  }
}

async function readAndValidateManifest(): Promise<PromptRegistryManifest> {
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as Partial<PromptRegistryManifest>;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.templates)) throw new Error("Prompt Registry manifest 格式无效");
  const seen = new Set<string>();
  const templates = raw.templates.map((value, index) => validateEntry(value, index, seen));
  return { schemaVersion: 1, templates };
}

async function combinedPromptTemplates(inputState?: WritablePromptRegistry): Promise<PromptTemplateManifestEntry[]> {
  const state = inputState || await readWritableRegistry();
  const manifest = await loadPromptRegistryManifest();
  const activeByKey = new Map<string, string>();
  for (const template of manifest.templates) if (template.active && !activeByKey.has(template.templateKey)) activeByKey.set(template.templateKey, template.templateVersion);
  for (const [templateKey, version] of Object.entries(state.activeVersions)) activeByKey.set(templateKey, version);
  const builtins = manifest.templates.map((template) => ({ ...template, source: "builtin" as const, active: activeByKey.get(template.templateKey) === template.templateVersion }));
  const local = state.versions.map((template) => ({
    ...template,
    sourceFile: "local-registry",
    active: activeByKey.get(template.templateKey) === template.templateVersion,
    legacy: false,
  }));
  return [...builtins, ...local];
}

async function readWritableRegistry(): Promise<WritablePromptRegistry> {
  await mkdir(writableRegistryDirectory, { recursive: true });
  const raw = await readJson<Partial<WritablePromptRegistry>>(writableRegistryPath, { schemaVersion: 1, activeVersions: {}, versions: [] });
  return {
    schemaVersion: 1,
    activeVersions: raw.activeVersions && typeof raw.activeVersions === "object" && !Array.isArray(raw.activeVersions) ? Object.fromEntries(Object.entries(raw.activeVersions).filter(([key, value]) => /^croco\./.test(key) && typeof value === "string")) : {},
    versions: Array.isArray(raw.versions) ? raw.versions.filter((version): version is StoredGlobalPromptVersion => Boolean(version && typeof version === "object" && version.source === "local-global" && typeof version.systemPrompt === "string")) : [],
  };
}

async function writeWritableRegistry(state: WritablePromptRegistry) {
  await mkdir(writableRegistryDirectory, { recursive: true });
  await atomicJson(writableRegistryPath, state);
}

function withRegistryMutation<T>(task: () => Promise<T>) {
  const result = registryMutationQueue.then(task, task);
  registryMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function nextPatchVersion(baseVersion: string, existing: string[]) {
  const match = baseVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Prompt 模板版本无效：${baseVersion}`);
  const used = new Set(existing);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  let patch = Number(match[3]) + 1;
  while (used.has(`${major}.${minor}.${patch}`)) patch += 1;
  return `${major}.${minor}.${patch}`;
}

function validateEntry(value: unknown, index: number, seen: Set<string>): PromptTemplateManifestEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Prompt Registry 第 ${index + 1} 项无效`);
  const entry = value as Record<string, unknown>;
  const templateKey = boundedString(entry.templateKey, "templateKey", 100);
  const templateVersion = boundedString(entry.templateVersion, "templateVersion", 32);
  assertTemplateKey(templateKey);
  if (!/^\d+\.\d+\.\d+$/.test(templateVersion)) throw new Error(`Prompt 模板版本无效：${templateKey}`);
  const identity = `${templateKey}@${templateVersion}`;
  if (seen.has(identity)) throw new Error(`Prompt 模板版本重复：${identity}`);
  seen.add(identity);
  const modelPolicy = entry.modelPolicy as Record<string, unknown> | undefined;
  if (!modelPolicy || typeof modelPolicy !== "object" || Array.isArray(modelPolicy)) throw new Error(`Prompt 模型策略无效：${identity}`);
  const inputModes = Array.isArray(entry.inputModes) ? entry.inputModes.map((mode) => boundedString(mode, "inputMode", 32)) : [];
  if (!inputModes.length || inputModes.length > 8) throw new Error(`Prompt 输入模式无效：${identity}`);
  const contentSha256 = boundedString(entry.contentSha256, "contentSha256", 64);
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) throw new Error(`Prompt SHA-256 无效：${identity}`);
  safeSourcePath(boundedString(entry.sourceFile, "sourceFile", 180));
  return {
    templateKey,
    templateVersion,
    title: boundedString(entry.title, "title", 100),
    stage: boundedString(entry.stage, "stage", 32),
    sourceFile: boundedString(entry.sourceFile, "sourceFile", 180),
    contentSha256,
    modelPolicy: {
      defaultModel: boundedString(modelPolicy.defaultModel, "defaultModel", 100),
      modelFamily: boundedString(modelPolicy.modelFamily, "modelFamily", 32),
      allowOverride: Boolean(modelPolicy.allowOverride),
    },
    inputModes,
    inputSchema: plainObject(entry.inputSchema, "inputSchema"),
    ...(entry.outputSchema === undefined ? {} : { outputSchema: plainObject(entry.outputSchema, "outputSchema") }),
    active: entry.active === true,
    ...(entry.legacy === true ? { legacy: true } : {}),
  };
}

function resolveSkillRoot() {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.CROCO_VIDEO_FACTORY_SKILL_ROOT,
    path.resolve(moduleDirectory, "../plugins/croco-video-factory/skills/croco-video-factory"),
    path.resolve(process.cwd(), "plugins/croco-video-factory/skills/croco-video-factory"),
  ].filter((value): value is string => Boolean(value));
  return candidates[0];
}

function safeSourcePath(sourceFile: string) {
  if (!/^[^/\\]+\.(?:md|txt)$/.test(sourceFile)) throw new Error(`Prompt 源文件路径无效：${sourceFile}`);
  const resolved = path.resolve(referenceDirectory, sourceFile);
  if (path.dirname(resolved) !== referenceDirectory) throw new Error(`Prompt 源文件越界：${sourceFile}`);
  return resolved;
}

function assertTemplateKey(value: string) {
  if (!/^croco\.[a-z0-9][a-z0-9.-]{2,98}$/.test(value)) throw new Error(`Prompt templateKey 无效：${value}`);
}

function boundedString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value || value.length > maxLength) throw new Error(`Prompt Registry ${field} 无效`);
  return value;
}

function plainObject(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Prompt Registry ${field} 无效`);
  return value as Record<string, unknown>;
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
