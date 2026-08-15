import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
};

export type PromptTemplate = PromptTemplateManifestEntry & {
  systemPrompt: string;
};

type PromptRegistryManifest = {
  schemaVersion: number;
  templates: PromptTemplateManifestEntry[];
};

const referenceDirectory = path.join(resolveSkillRoot(), "references");
const manifestPath = path.join(referenceDirectory, "prompt-registry.json");
let manifestPromise: Promise<PromptRegistryManifest> | undefined;

export async function listPromptTemplates(options: { includeLegacy?: boolean; includeInactive?: boolean } = {}) {
  const manifest = await loadPromptRegistryManifest();
  return manifest.templates
    .filter((template) => (options.includeLegacy || !template.legacy) && (options.includeInactive || template.active))
    .map((template) => ({ ...template }));
}

export async function getPromptTemplate(templateKey: string, templateVersion?: string): Promise<PromptTemplate> {
  assertTemplateKey(templateKey);
  const manifest = await loadPromptRegistryManifest();
  const candidates = manifest.templates.filter((template) => template.templateKey === templateKey && (!templateVersion || template.templateVersion === templateVersion));
  const entry = candidates.find((template) => template.active) || candidates[0];
  if (!entry) throw new PromptTemplateNotFoundError(templateKey, templateVersion);

  const sourcePath = safeSourcePath(entry.sourceFile);
  const source = await readFile(sourcePath);
  const actualSha256 = sha256(source);
  if (actualSha256 !== entry.contentSha256) {
    throw new Error(`Prompt 模板完整性校验失败：${entry.templateKey}@${entry.templateVersion}`);
  }
  return { ...entry, systemPrompt: source.toString("utf8") };
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
