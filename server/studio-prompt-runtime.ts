import { randomUUID } from "node:crypto";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { publishProjectUpdated } from "./canvas-events";
import { runCanvasConfigNodes } from "./canvas-node-runtime";
import { getPromptTemplate } from "./prompt-registry";
import { getStudioBackedProject, mutateStudioProject } from "./studio-commands";
import { STUDIO_PROMPT_TEMPLATE_MAP } from "./studio-schemas";
import type { StudioGenerationExecution } from "./studio-types";
import { readProject } from "./storage";
import { models } from "./providers";
import type { TextThinkingMode } from "./providers";
import { stableStudioNodeId } from "./studio-canvas-mapping";
import { avoidStudioNodeOverlaps } from "./studio-node-placement";

export type StudioPromptOperation = keyof typeof STUDIO_PROMPT_TEMPLATE_MAP;

export type StudioGenerationRequest = {
  projectId: string;
  frameId?: string;
  operation: StudioPromptOperation;
  templateKey?: string;
  draftPrompt: string;
  feedback?: string;
  prevCn?: string;
  targetDurationSeconds?: number;
  orderedResourceIds?: string[];
  resourceRoles?: Array<{ resourceId: string; role: string }>;
  requestedModel?: string;
  thinking?: TextThinkingMode;
  configNodeId: string;
  originClientId: string;
};

export type StudioGenerationResult = {
  text: string;
  execution: StudioGenerationExecution;
};

export type StudioPromptExecutionRequest = Omit<StudioGenerationRequest, "configNodeId">;

export async function executeStudioPromptForProject(input: StudioPromptExecutionRequest): Promise<StudioGenerationResult> {
  return executeStudioPrompt({
    ...input,
    configNodeId: studioPromptConfigNodeId(input.projectId, input.operation, input.frameId),
  });
}

export async function executeStudioPrompt(input: StudioGenerationRequest): Promise<StudioGenerationResult> {
  const backed = await getStudioBackedProject(input.projectId);
  const resolved = await resolveStudioPrompt(backed.studio, input.operation, input.templateKey, input.requestedModel);
  let project = await readProject(input.projectId) as any;
  const resources = resolveResourceNodes(project.nodes, input.orderedResourceIds || [], input.resourceRoles || []);
  let visualContextNodeId: string | undefined;
  try {
    visualContextNodeId = resources.length ? await executeVisualContext(input, project, resources) : undefined;
  } catch (error) {
    await mutateStudioProject(input.projectId, (state) => state, { originClientId: input.originClientId }).catch(() => undefined);
    throw error;
  }
  if (visualContextNodeId) project = await readProject(input.projectId) as any;
  const config = project.nodes.find((node: any) => node.id === input.configNodeId && node.type === "config");
  if (!config) throw new Error(`Studio Prompt Config 不存在：${input.configNodeId}`);

  const systemPromptNodeId = randomUUID();
  const contextNodeId = randomUUID();
  const context = generationContext(input, resources.map((resource) => ({ resourceId: resource.resourceId, role: resource.role })));
  const composerContent = [
    `@[node:${contextNodeId}]`,
    ...(visualContextNodeId ? [`视觉上下文: @[node:${visualContextNodeId}]`] : []),
  ].join("\n");
  const x = Number(config.position?.x || 0);
  const y = Number(config.position?.y || 0);
  const operations: CanvasOperation[] = [
    {
      op: "add_node",
      node: {
        id: systemPromptNodeId,
        type: "text",
        title: `${resolved.title} · ${resolved.templateVersion}`,
        position: { x: x - 840, y },
        width: 380,
        height: 300,
        metadata: {
          artifactType: "system-prompt-execution-snapshot",
          promptRole: "system",
          content: resolved.systemPrompt,
          templateKey: resolved.templateKey,
          templateVersion: resolved.templateVersion,
          systemPromptSha256: resolved.systemPromptSha256,
          immutableSnapshot: true,
          status: "success",
        },
      },
    },
    {
      op: "add_node",
      node: {
        id: contextNodeId,
        type: "text",
        title: `${input.operation} · 本次输入`,
        position: { x: x - 420, y },
        width: 380,
        height: 300,
        metadata: {
          artifactType: "studio-generation-input-snapshot",
          content: JSON.stringify(context, null, 2),
          immutableSnapshot: true,
          operation: input.operation,
          status: "success",
        },
      },
    },
    {
      op: "update_node",
      nodeId: input.configNodeId,
      patch: {
        metadata: {
          generationMode: "text",
          model: resolved.model,
          requestedModel: input.requestedModel || "",
          thinking: input.thinking || "",
          composerContent,
          count: 1,
          templateKey: resolved.templateKey,
          templateVersion: resolved.templateVersion,
          systemPromptSha256: resolved.systemPromptSha256,
          ...(resolved.outputSchema ? {
            outputSchema: resolved.outputSchema,
            outputSchemaName: "art_direction_options",
          } : {}),
          studioPromptOperation: input.operation,
          status: "idle",
        },
      },
    },
    { op: "connect", from: systemPromptNodeId, to: input.configNodeId },
    { op: "connect", from: contextNodeId, to: input.configNodeId },
    ...(visualContextNodeId ? [{ op: "connect", from: visualContextNodeId, to: input.configNodeId } as CanvasOperation] : []),
  ];
  const created = await applyCanvasOperations(input.projectId, avoidStudioNodeOverlaps(project.nodes, operations), Number(project.version), { allowStudioManagedWrites: true });
  publishProjectUpdated(created.project, input.originClientId);

  const runResult = await runCanvasConfigNodes({ projectId: input.projectId, configNodeIds: [input.configNodeId], concurrency: 1, originClientId: input.originClientId });
  const run = runResult.results[0];
  if (!run || run.status === "error") {
    await mutateStudioProject(input.projectId, (state) => state, { originClientId: input.originClientId }).catch(() => undefined);
    throw new Error(run?.error || "Studio Prompt 执行失败");
  }
  const current = await readProject(input.projectId) as any;
  const output = current.nodes.find((node: any) => node.id === run.outputNodeIds[0]);
  const text = String(output?.metadata?.content || "");
  if (!text.trim()) throw new Error("Studio Prompt 没有返回内容");
  const snapshot = objectValue(output?.metadata?.inputSnapshot);
  const execution: StudioGenerationExecution = {
    id: randomUUID(),
    operation: input.operation,
    templateKey: resolved.templateKey,
    templateVersion: resolved.templateVersion,
    systemPromptSha256: resolved.systemPromptSha256,
    systemPromptNodeIds: stringArray(snapshot.systemPromptNodeIds),
    model: resolved.model,
    ...(input.thinking ? { thinking: input.thinking } : {}),
    sourceNodeIds: stringArray(snapshot.sourceNodeIds),
    imageResourceIds: resources.filter((resource) => resource.type === "image").map((resource) => resource.resourceId),
    videoResourceIds: resources.filter((resource) => resource.type === "video").map((resource) => resource.resourceId),
    audioResourceIds: resources.filter((resource) => resource.type === "audio").map((resource) => resource.resourceId),
    outputNodeIds: run.outputNodeIds,
    createdAt: new Date().toISOString(),
  };
  await mutateStudioProject(input.projectId, (state) => ({ ...state, generationExecutions: [...state.generationExecutions, execution].slice(-500) }), { originClientId: input.originClientId });
  return { text, execution };
}

async function resolveStudioPrompt(state: Awaited<ReturnType<typeof getStudioBackedProject>>["studio"], operation: StudioPromptOperation, explicitTemplateKey: string | undefined, requestedModel: string | undefined) {
  const binding = state.promptBindings[operation] || { templateKey: STUDIO_PROMPT_TEMPLATE_MAP[operation], source: "builtin" as const };
  const templateKey = explicitTemplateKey || binding.templateKey;
  const builtin = await getPromptTemplate(templateKey, binding.source === "global-pinned" && binding.templateKey === templateKey ? binding.templateVersion : undefined);
  const projectVersion = (binding.source === "project" || binding.source === "legacy-studio-migration") && binding.templateKey === templateKey
    ? state.projectPromptVersions.find((version) => version.templateKey === binding.templateKey && version.templateVersion === binding.templateVersion)
    : undefined;
  const prompt = projectVersion || builtin;
  const projectRequestedModel = normalizeLegacyTextModel(String(requestedModel || state.modelSettings[`${operation}_model`] || state.modelSettings.polish_model || state.modelSettings.llm_model || state.modelSettings.text_model || ""));
  return {
    title: builtin.title,
    templateKey,
    templateVersion: prompt.templateVersion,
    systemPrompt: prompt.systemPrompt,
    systemPromptSha256: "systemPromptSha256" in prompt ? prompt.systemPromptSha256 : prompt.contentSha256,
    model: builtin.modelPolicy.allowOverride && textModels().includes(projectRequestedModel) ? projectRequestedModel : builtin.modelPolicy.defaultModel,
    ...(operation === "style_analysis" && builtin.outputSchema ? { outputSchema: structuredClone(builtin.outputSchema) } : {}),
  };
}

function generationContext(input: StudioGenerationRequest, resources: Array<{ resourceId: string; role: string }>) {
  return {
    operation: input.operation,
    projectId: input.projectId,
    ...(input.frameId ? { frameId: input.frameId } : {}),
    draftPrompt: input.draftPrompt,
    ...(input.feedback ? { feedback: input.feedback } : {}),
    ...(input.prevCn ? { previousChinese: input.prevCn } : {}),
    ...(input.targetDurationSeconds ? { targetDurationSeconds: input.targetDurationSeconds } : {}),
    resources,
  };
}

function resolveResourceNodes(nodes: any[], orderedResourceIds: string[], resourceRoles: Array<{ resourceId: string; role: string }>) {
  const roles = new Map(resourceRoles.map((item) => [item.resourceId, String(item.role || "reference").slice(0, 80)]));
  return [...new Set(orderedResourceIds)].slice(0, 16).map((resourceId, index) => {
    const node = nodes.find((candidate) => String(candidate.metadata?.storageKey || "") === resourceId && ["image", "video", "audio"].includes(candidate.type));
    if (!node) throw new Error(`Studio 参考资源尚未映射到 Canvas：${resourceId}`);
    return { resourceId, nodeId: String(node.id), type: String(node.type) as "image" | "video" | "audio", role: roles.get(resourceId) || `reference-${index + 1}` };
  });
}

async function executeVisualContext(input: StudioGenerationRequest, project: any, resources: Array<{ resourceId: string; nodeId: string; type: "image" | "video" | "audio"; role: string }>) {
  const configNodeId = stableStudioNodeId(input.projectId, "frame", input.frameId || input.projectId, "visual-context-config");
  const config = project.nodes.find((node: any) => node.id === configNodeId && node.type === "config");
  if (!config) throw new Error(`Studio 视觉上下文 Config 不存在：${configNodeId}`);
  const inputNodeId = randomUUID();
  const composerContent = [
    `@[node:${inputNodeId}]`,
    ...resources.map((resource, index) => `${index + 1}. ${resource.role}: @[node:${resource.nodeId}]`),
  ].join("\n");
  const operations: CanvasOperation[] = [
    {
      op: "add_node",
      node: {
        id: inputNodeId,
        type: "text",
        title: `${input.operation} · 视觉输入`,
        position: { x: Number(config.position?.x || 0) - 420, y: Number(config.position?.y || 0) },
        width: 380,
        height: 300,
        metadata: {
          artifactType: "studio-visual-input-snapshot",
          content: JSON.stringify({ instruction: "仅提取参考素材中可观察、可验证的视觉信息，不扩写剧情或猜测不可见事实。", resources: resources.map(({ resourceId, role, type }) => ({ resourceId, role, type })) }, null, 2),
          immutableSnapshot: true,
          status: "success",
        },
      },
    },
    { op: "update_node", nodeId: configNodeId, patch: { metadata: { generationMode: "text", model: "glm-5v-turbo", composerContent, count: 1, status: "idle" } } },
    { op: "connect", from: inputNodeId, to: configNodeId },
    ...resources.map((resource): CanvasOperation => ({ op: "connect", from: resource.nodeId, to: configNodeId })),
  ];
  const created = await applyCanvasOperations(input.projectId, avoidStudioNodeOverlaps(project.nodes, operations), Number(project.version), { allowStudioManagedWrites: true });
  publishProjectUpdated(created.project, input.originClientId);
  const result = await runCanvasConfigNodes({ projectId: input.projectId, configNodeIds: [configNodeId], concurrency: 1, originClientId: input.originClientId });
  const run = result.results[0];
  if (!run || run.status === "error") throw new Error(run?.error || "Studio 视觉上下文提取失败");
  return run.outputNodeIds[0];
}

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 100) : []; }
function textModels() { return [...models.codingPlanLlm, ...models.volcengineLlm, ...models.bigmodelLlm, ...models.runwareLlm]; }
function normalizeLegacyTextModel(value: string) {
  const aliases: Record<string, string> = { "doubao-seed-2-1-turbo-260628": "doubao-seed-2.1-turbo", "deepseek-v4-flash-ga-260731": "deepseek-v4-flash", "deepseek-v4-flash-260425": "deepseek-v4-flash", "deepseek-v4-pro-260425": "deepseek-v4-pro", "glm-5.2": "glm-5.3" };
  return aliases[value] || value;
}

function studioPromptConfigNodeId(projectId: string, operation: StudioPromptOperation, frameId?: string) {
  if (operation === "entity_extraction") return stableStudioNodeId(projectId, "script", projectId, "entity-analysis-config");
  if (operation === "style_analysis") return stableStudioNodeId(projectId, "art-direction", projectId, "analysis-config");
  if (operation === "storyboard_extraction") return stableStudioNodeId(projectId, "frame", projectId, "analysis-config");
  return stableStudioNodeId(projectId, "frame", frameId || projectId, "prompt-revision-config");
}
