import { createHash } from "node:crypto";
import { getPromptTemplate, listPromptTemplates } from "./prompt-registry";
import { getStudioBackedProject, mutateStudioProject } from "./studio-commands";
import { STUDIO_PROMPT_TEMPLATE_MAP } from "./studio-schemas";
import type { StudioProjectPromptVersion, StudioPromptBinding } from "./studio-types";
import type { StudioPromptOperation } from "./studio-prompt-runtime";

export async function getStudioPromptStrategy(projectId: string) {
  const project = await getStudioBackedProject(projectId);
  const globalVersions = await listPromptTemplates({ includeInactive: true, includeLegacy: false });
  const operations = await Promise.all((Object.entries(STUDIO_PROMPT_TEMPLATE_MAP) as Array<[StudioPromptOperation, string]>).map(async ([operation, templateKey]) => {
    const binding = project.studio.promptBindings[operation] || { templateKey, source: "builtin" as const };
    const effective = await resolveEffectivePrompt(project.studio.projectPromptVersions, binding, templateKey);
    return {
      operation,
      templateKey,
      binding,
      effective: {
        templateVersion: effective.templateVersion,
        systemPromptSha256: effective.systemPromptSha256,
        source: binding.source,
        model: effective.model,
      },
      globalVersions: globalVersions.filter((version) => version.templateKey === templateKey),
      projectVersions: project.studio.projectPromptVersions.filter((version) => version.templateKey === templateKey),
    };
  }));
  return { projectId, projectVersion: project.version, operations };
}

export async function createStudioProjectPromptVersion(projectId: string, operation: StudioPromptOperation, input: { baseVersion?: string; systemPrompt: string; activate?: boolean; expectedVersion?: number }, originClientId: string) {
  assertOperation(operation);
  if (typeof input.systemPrompt !== "string" || !input.systemPrompt.trim() || input.systemPrompt.length > 250_000) throw new Error("Prompt 正文无效");
  const current = await getStudioBackedProject(projectId);
  const templateKey = STUDIO_PROMPT_TEMPLATE_MAP[operation];
  const currentProjectBase = input.baseVersion ? current.studio.projectPromptVersions.find((version) => version.templateKey === templateKey && version.templateVersion === input.baseVersion) : undefined;
  const globalBase = currentProjectBase ? undefined : await getPromptTemplate(templateKey, input.baseVersion);
  await mutateStudioProject(projectId, (state) => {
    const projectBase = input.baseVersion ? state.projectPromptVersions.find((version) => version.templateKey === templateKey && version.templateVersion === input.baseVersion) : undefined;
    const baseVersion = projectBase?.templateVersion || globalBase?.templateVersion;
    if (!baseVersion) throw new Error("项目 Prompt 基础版本不存在");
    const existing = state.projectPromptVersions.filter((version) => version.templateKey === templateKey);
    const templateVersion = nextProjectVersion(baseVersion, existing.map((version) => version.templateVersion));
    const version: StudioProjectPromptVersion = {
      templateKey,
      templateVersion,
      systemPrompt: input.systemPrompt,
      systemPromptSha256: createHash("sha256").update(input.systemPrompt, "utf8").digest("hex"),
      source: "project",
      parentVersion: baseVersion,
      createdAt: new Date().toISOString(),
    };
    return {
      ...state,
      promptConfig: { ...state.promptConfig, [operation]: "" },
      projectPromptVersions: [...state.projectPromptVersions, version],
      promptBindings: input.activate === false ? state.promptBindings : { ...state.promptBindings, [operation]: { templateKey, templateVersion, source: "project" } },
    };
  }, { expectedVersion: input.expectedVersion, originClientId });
  return getStudioPromptStrategy(projectId);
}

export async function setStudioPromptBinding(projectId: string, operation: StudioPromptOperation, input: { mode: "follow_global" | "pin_global" | "project"; templateVersion?: string; expectedVersion?: number }, originClientId: string) {
  assertOperation(operation);
  const templateKey = STUDIO_PROMPT_TEMPLATE_MAP[operation];
  let binding: StudioPromptBinding;
  if (input.mode === "follow_global") {
    binding = { templateKey, source: "builtin" };
  } else if (input.mode === "pin_global") {
    if (!input.templateVersion) throw new Error("锁定全局版本时必须提供 templateVersion");
    await getPromptTemplate(templateKey, input.templateVersion);
    binding = { templateKey, templateVersion: input.templateVersion, source: "global-pinned" };
  } else {
    if (!input.templateVersion) throw new Error("项目 Prompt 版本不存在");
    binding = { templateKey, templateVersion: input.templateVersion, source: "project" };
  }
  await mutateStudioProject(projectId, (state) => {
    if (binding.source === "project" && !state.projectPromptVersions.some((version) => version.templateKey === templateKey && version.templateVersion === binding.templateVersion)) throw new Error("项目 Prompt 版本不存在");
    return {
      ...state,
      promptConfig: { ...state.promptConfig, [operation]: "" },
      promptBindings: { ...state.promptBindings, [operation]: binding },
    };
  }, { expectedVersion: input.expectedVersion, originClientId });
  return getStudioPromptStrategy(projectId);
}

async function resolveEffectivePrompt(projectVersions: StudioProjectPromptVersion[], binding: StudioPromptBinding, fallbackTemplateKey: string) {
  if ((binding.source === "project" || binding.source === "legacy-studio-migration") && binding.templateVersion) {
    const version = projectVersions.find((candidate) => candidate.templateKey === binding.templateKey && candidate.templateVersion === binding.templateVersion);
    if (version) {
      const policy = await getPromptTemplate(fallbackTemplateKey);
      return { templateVersion: version.templateVersion, systemPromptSha256: version.systemPromptSha256, model: policy.modelPolicy.defaultModel };
    }
  }
  const global = await getPromptTemplate(binding.templateKey || fallbackTemplateKey, binding.source === "global-pinned" ? binding.templateVersion : undefined);
  return { templateVersion: global.templateVersion, systemPromptSha256: global.contentSha256, model: global.modelPolicy.defaultModel };
}

function assertOperation(value: string): asserts value is StudioPromptOperation {
  if (!(value in STUDIO_PROMPT_TEMPLATE_MAP)) throw new Error(`不支持的 Studio Prompt 操作：${value}`);
}

function nextProjectVersion(baseVersion: string, existing: string[]) {
  const prefix = baseVersion.replace(/-project\.\d+$/, "");
  let sequence = 1;
  const used = new Set(existing);
  while (used.has(`${prefix}-project.${sequence}`)) sequence += 1;
  return `${prefix}-project.${sequence}`;
}
