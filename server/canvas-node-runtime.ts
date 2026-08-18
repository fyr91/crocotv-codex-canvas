import { createHash, randomUUID } from "node:crypto";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { publishProjectUpdated } from "./canvas-events";
import { normalizeH3InputMode, prepareH3Prompt, type H3PromptPreparation } from "./h3-prompt";
import { generateImage, generateMusic, generateText, generateVideo, models, type H3GenerationProgress, type TextThinkingMode } from "./providers";
import { generateSpeech, type SpeechGenerationProgress } from "./speech";
import { readProject } from "./storage";
import type { StoredResource } from "./types";

type CanvasNode = {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
};
type CanvasConnection = { id: string; fromNodeId: string; toNodeId: string; fromPort?: string; toPort?: string };
type CanvasProject = Record<string, unknown> & { nodes: CanvasNode[]; connections: CanvasConnection[]; version: number };
type GenerationMode = "text" | "image" | "video" | "audio" | "music";
type ResolvedInput = { prompt: string; systemPrompt: string; systemPromptNodeIds: string[]; imageIds: string[]; videoIds: string[]; audioIds: string[]; sourceNodeIds: string[] };

export type CanvasNodeRunResult = {
  configNodeId: string;
  outputNodeIds: string[];
  toneNodeId?: string;
  status: "success" | "error";
  error?: string;
};

type CanvasRunOperationOrigin = "canvas" | "mcp";

export type CanvasNodeRuntimeDependencies = {
  prepareH3Prompt?: typeof prepareH3Prompt;
};

export async function queueCanvasConfigNodes(input: {
  projectId: string;
  configNodeIds: string[];
  operationId: string;
  originClientId?: string;
  targetOutputNodeIds?: Record<string, string[]>;
  operationOrigin?: CanvasRunOperationOrigin;
}) {
  const nodeIds = normalizedConfigNodeIds(input.configNodeIds);
  const project = asProject(await readProject(input.projectId));
  validateConfigNodeIds(project, nodeIds);
  const targetIds = Object.values(input.targetOutputNodeIds || {}).flat();
  validateTargetOutputIds(project, nodeIds, targetIds);
  const result = await mutateAndPublish(input.projectId, [...nodeIds.map((nodeId): CanvasOperation => ({
    op: "update_node",
    nodeId,
    patch: {
      metadata: {
        status: "loading",
        generationState: "queued",
        generationStage: "queued",
        generationProgress: 0,
        generationJobId: null,
        remoteOperationActive: true,
        remoteOperationId: input.operationId,
        remoteOperationOrigin: input.operationOrigin || "mcp",
        remoteOperationLabel: input.operationOrigin === "canvas" ? "等待生成" : "MCP · 排队中",
        errorDetails: "",
      },
    },
  })), ...targetIds.map((nodeId): CanvasOperation => ({ op: "update_node", nodeId, patch: { metadata: { status: "loading", generationState: "queued", generationStage: "queued", generationProgress: 0, generationJobId: null, remoteOperationActive: true, remoteOperationId: input.operationId, remoteOperationOrigin: input.operationOrigin || "mcp", remoteOperationLabel: input.operationOrigin === "canvas" ? "等待重新生成" : "MCP · 等待原位重跑", errorDetails: "" } } }))], input.originClientId || "canvas-node-runtime");
  return { nodeIds, projectVersion: result.project.version };
}

export async function runCanvasConfigNodes(input: {
  projectId: string;
  configNodeIds: string[];
  concurrency?: number;
  originClientId?: string;
  remoteOperation?: boolean;
  operationId?: string;
  signal?: AbortSignal;
  targetOutputNodeIds?: Record<string, string[]>;
  operationOrigin?: CanvasRunOperationOrigin;
  dependencies?: CanvasNodeRuntimeDependencies;
}) {
  const nodeIds = normalizedConfigNodeIds(input.configNodeIds);
  const initial = asProject(await readProject(input.projectId));
  validateConfigNodeIds(initial, nodeIds, input.operationId);
  const requestedConcurrency = Number(input.concurrency);
  const concurrency = Math.max(1, Math.min(nodeIds.length, Number.isInteger(requestedConcurrency) && requestedConcurrency > 0 ? requestedConcurrency : nodeIds.length));
  const results = await runWithConcurrency(nodeIds, concurrency, async (configNodeId) => {
    try {
      input.signal?.throwIfAborted();
      return await runConfigNode(input.projectId, configNodeId, input.originClientId || "canvas-node-runtime", Boolean(input.remoteOperation), input.operationId, input.signal, input.targetOutputNodeIds?.[configNodeId], input.operationOrigin, input.dependencies);
    } catch (error) {
      const message = errorMessage(error);
      const cancelled = Boolean(input.signal?.aborted);
      await mutateAndPublish(input.projectId, [{
        op: "update_node",
        nodeId: configNodeId,
        patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: cancelled ? (input.operationOrigin === "mcp" ? "MCP 运行已取消" : "生成已取消") : "生成失败", errorDetails: message } },
      }], input.originClientId || "canvas-node-runtime").catch(() => undefined);
      return { configNodeId, outputNodeIds: [], status: "error" as const, error: message };
    }
  });
  const finalProject = asProject(await readProject(input.projectId));
  return { projectId: input.projectId, concurrency, results, projectVersion: finalProject.version };
}

function normalizedConfigNodeIds(values: string[]) {
  const nodeIds = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!nodeIds.length) throw new Error("至少需要一个生成模组节点 ID");
  if (nodeIds.length > 20) throw new Error("一次最多运行 20 个生成模组节点");
  return nodeIds;
}

function validateConfigNodeIds(project: CanvasProject, nodeIds: string[], operationId?: string) {
  for (const nodeId of nodeIds) {
    const node = project.nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error(`节点不存在：${nodeId}`);
    if (node.type !== "config") throw new Error(`节点 ${nodeId} 不是生成模组`);
    if (node.metadata?.remoteOperationActive && String(node.metadata?.remoteOperationId || "") !== String(operationId || "")) throw new Error(`节点 ${nodeId} 正由另一个 MCP 操作锁定`);
  }
}

function validateTargetOutputIds(project: CanvasProject, configNodeIds: string[], outputNodeIds: string[]) {
  for (const nodeId of outputNodeIds) {
    const node = project.nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error(`结果节点不存在：${nodeId}`);
    if (!configNodeIds.includes(String(node.metadata?.sourceConfigNodeId || ""))) throw new Error(`结果节点 ${nodeId} 不属于本次生成模组`);
  }
}

async function runConfigNode(projectId: string, configNodeId: string, originClientId: string, remoteOperation: boolean, operationId?: string, signal?: AbortSignal, targetOutputNodeIds?: string[], operationOrigin?: CanvasRunOperationOrigin, dependencies: CanvasNodeRuntimeDependencies = {}): Promise<CanvasNodeRunResult> {
  const project = asProject(await readProject(projectId));
  const config = requiredConfig(project, configNodeId);
  const mode = generationMode(config);
  let inputs = resolveInputs(project, config, mode);
  const model = normalizeModel(String(config.metadata?.model || ""));
  validateModel(mode, model);
  const isMcpOperation = remoteOperation && operationOrigin !== "canvas";
  const managedOperationOrigin = remoteOperation ? (isMcpOperation ? "mcp" : "canvas") : null;
  let h3InputMode: ReturnType<typeof normalizeH3InputMode> | undefined;
  if (mode === "video" && model === "minimax-h3") {
    if (inputs.videoIds.length) throw new Error("MiniMax H3 暂不支持视频参考或视频编辑；请改用图片、音频参考");
    h3InputMode = normalizeH3InputMode(config.metadata?.videoInputMode || config.metadata?.generation_mode);
    if (h3InputMode === "firstFrame" && inputs.imageIds.length < 1) throw new Error("首帧生视频需要连接一张首帧图片");
    if (h3InputMode === "firstLastFrame" && inputs.imageIds.length !== 2) throw new Error("首尾帧生视频需要按首帧、尾帧顺序连接两张图片");
  } else if (mode === "video" && model === "ltx-2.5") {
    if (inputs.videoIds.length || inputs.audioIds.length) throw new Error("LTX 2.5 当前只接受文字和一张图片参考");
    if (inputs.imageIds.length > 1) throw new Error("LTX 2.5 每次只接受一张首帧或 Ingredients 参考图");
    const inputMode = ltxInputMode(config.metadata?.videoInputMode, inputs.imageIds.length > 0);
    if (inputMode === "firstFrame" && inputs.imageIds.length !== 1) throw new Error("LTX 2.5 首帧生视频需要在提示词中引用一张首帧图片");
    if (inputMode === "multimodal" && inputs.imageIds.length !== 1) throw new Error("LTX 2.5 Ingredients 需要在提示词中引用一张参考图");
  }
  const count = targetOutputNodeIds?.length || generationCount(config, mode, model);
  const outputType = mode === "audio" ? "audio" : mode;
  const outputIds = targetOutputNodeIds?.length ? [...new Set(targetOutputNodeIds)] : Array.from({ length: count }, () => randomUUID());
  let inputSnapshot = resolvedInputSnapshot(inputs);
  for (const outputId of outputIds) {
    const existing = project.nodes.find((node) => node.id === outputId);
    if (existing && (existing.type !== outputType || String(existing.metadata?.sourceConfigNodeId || "") !== config.id)) throw new Error(`节点 ${outputId} 不能由生成模组 ${config.id} 原位重跑`);
  }
  const toneNodeId = mode === "audio" ? randomUUID() : undefined;
  let title = outputTitle(mode, config, inputs.prompt);
  const shotLayout = shotLayoutMetadata(config);
  const initialOperations: CanvasOperation[] = [{
    op: "update_node",
    nodeId: config.id,
    patch: { metadata: { status: "loading", generationState: "running", generationStage: "preparing", generationProgress: 0, generationJobId: null, remoteOperationActive: remoteOperation, remoteOperationId: remoteOperation ? operationId : null, remoteOperationOrigin: managedOperationOrigin, remoteOperationLabel: isMcpOperation ? "MCP 正在执行生成模组" : "正在执行生成模组", errorDetails: "", resolvedPrompt: inputs.prompt, inputSnapshot } },
  }];

  if (toneNodeId) {
    initialOperations.push({
      op: "add_node",
      node: {
        id: toneNodeId,
        type: "text",
        title: `语气优化 · ${title}`,
        position: outputPosition(project, config, 0, 380, 300),
        width: 380,
        height: 300,
        metadata: {
          artifactType: "speech-tone-plan",
          targetNodeId: outputIds[0],
          model: speechToneModel(),
          prompt: inputs.prompt,
          content: "等待 DeepSeek 生成情景化语气分段…",
          status: "loading",
          generationState: "running",
          remoteOperationActive: remoteOperation,
          remoteOperationId: remoteOperation ? operationId : null,
          remoteOperationOrigin: managedOperationOrigin,
          remoteOperationLabel: isMcpOperation ? "MCP · DeepSeek 正在优化语气" : "DeepSeek 正在优化语气",
          ...shotLayout.child(1),
        },
      },
    });
    initialOperations.push({ op: "connect", from: config.id, to: toneNodeId });
  }
  outputIds.forEach((outputId, index) => {
    const size = outputSize(outputType);
    const node = {
        id: outputId,
        type: outputType,
        title: count > 1 ? `${title} ${index + 1}` : title,
        position: outputPosition(project, config, index + (toneNodeId ? 1 : 0), size.width, size.height),
        width: size.width,
        height: size.height,
        metadata: {
          prompt: inputs.prompt,
          promptDraft: String(config.metadata?.composerContent ?? config.metadata?.prompt ?? ""),
          model: String(config.metadata?.model || model),
          status: "loading",
          generationState: providerUsesQueue(mode) ? "queued" : "running",
          generationStage: providerUsesQueue(mode) ? "submitting" : "preparing",
          generationProgress: 0,
          generationJobId: null,
          remoteOperationActive: remoteOperation,
          remoteOperationId: remoteOperation ? operationId : null,
          remoteOperationOrigin: managedOperationOrigin,
          remoteOperationLabel: providerUsesQueue(mode) ? providerSubmittingLabel(mode, model) : providerLabel(mode, model),
          sourceConfigNodeId: config.id,
          inputSnapshot,
          ...shotLayout.child(toneNodeId ? 2 + index : 1 + index),
          ...(mode === "video" ? { seconds: String(videoDuration(config, model)), vquality: String(config.metadata?.vquality || "preview"), videoInputMode: videoInputMode(config, model, inputs) } : {}),
          ...(mode === "audio" ? { audioVoice: String(config.metadata?.audioVoice || "") } : {}),
        },
      };
    initialOperations.push(project.nodes.some((item) => item.id === outputId)
      ? { op: "update_node", nodeId: outputId, patch: { title: node.title, metadata: node.metadata } }
      : { op: "add_node", node });
    initialOperations.push({ op: "connect", from: toneNodeId || config.id, to: outputId });
    if (mode === "video") {
      inputs.sourceNodeIds.forEach((sourceNodeId) => initialOperations.push({
        op: "connect",
        from: sourceNodeId,
        to: outputId,
      }));
    }
  });
  if (shotLayout.factoryRunId) initialOperations.push({ op: "layout_shot_columns", factoryRunId: shotLayout.factoryRunId, preserveManualLayout: true });
  await mutateAndPublish(projectId, initialOperations, originClientId);

  try {
    if (mode === "video" && model === "minimax-h3") {
      signal?.throwIfAborted();
      const h3Prompt = await (dependencies.prepareH3Prompt || prepareH3Prompt)({
        draftPrompt: inputs.prompt,
        durationSeconds: videoDuration(config, model),
        inputMode: h3InputMode,
        imageResourceIds: inputs.imageIds,
        audioResourceIds: inputs.audioIds,
        resourceRoles: h3ResourceRoles(config.metadata?.resourceRoles),
        optimize: promptOptimizationEnabled(config.metadata?.videoPromptEnhance) && promptOptimizationEnabled(config.metadata?.prompt_extend),
      });
      signal?.throwIfAborted();
      inputs = { ...inputs, prompt: h3Prompt.prompt };
      inputSnapshot = resolvedInputSnapshot(inputs);
      title = outputTitle(mode, config, inputs.prompt);
      const promptMetadata = {
        prompt: inputs.prompt,
        inputSnapshot,
        promptOptimization: promptPreparationMetadata(h3Prompt),
      };
      await mutateAndPublish(projectId, [
        { op: "update_node", nodeId: config.id, patch: { metadata: { ...promptMetadata, resolvedPrompt: inputs.prompt, promptDraft: h3Prompt.draftPrompt } } },
        ...outputIds.map((nodeId, index): CanvasOperation => ({
          op: "update_node",
          nodeId,
          patch: { title: count > 1 ? `${title} ${index + 1}` : title, metadata: promptMetadata },
        })),
      ], originClientId);
    }
    if (mode === "text") {
      const settled = await Promise.allSettled(outputIds.map(() => generateText(inputs.prompt, model, textResourceIdsForModel(model, inputs), [], inputs.systemPrompt, {
        thinking: textThinkingMode(config),
        outputSchema: textOutputSchema(config),
        outputSchemaName: textOutputSchemaName(config),
        responseApi: textResponseApi(config),
      })));
      signal?.throwIfAborted();
      const failure = await finishTextOutputs(projectId, config.id, outputIds, settled, originClientId);
      if (failure) return { configNodeId, outputNodeIds: outputIds, status: "error", error: failure };
    } else if (mode === "image") {
      const settled = await Promise.allSettled(outputIds.map(() => generateImage({
        prompt: inputs.prompt,
        model,
        width: imageDimension(config, 0),
        height: imageDimension(config, 1),
        seed: optionalNonnegativeInteger(config.metadata?.imageSeed ?? config.metadata?.seed, "图片 Seed"),
        referenceResourceIds: inputs.imageIds,
        signal,
      })));
      signal?.throwIfAborted();
      const failure = await finishResourceOutputs(projectId, config.id, outputIds, settled, originClientId);
      if (failure) return { configNodeId, outputNodeIds: outputIds, status: "error", error: failure };
    } else if (mode === "video") {
      const resources = await generateVideo({
        model,
        prompt: inputs.prompt,
        duration: videoDuration(config, model),
        quality: String(config.metadata?.vquality || "preview"),
        size: String(config.metadata?.size || ""),
        count,
        inputMode: videoInputMode(config, model, inputs),
        optimizePrompt: promptOptimizationEnabled(config.metadata?.videoPromptEnhance) && promptOptimizationEnabled(config.metadata?.prompt_extend),
        imageResourceIds: inputs.imageIds,
        videoResourceIds: inputs.videoIds,
        audioResourceIds: inputs.audioIds,
        referenceStrength: optionalBoundedNumber(config.metadata?.videoReferenceStrength ?? config.metadata?.referenceStrength, 0.1, 1.5, "LTX 参考强度"),
        seed: optionalNonnegativeInteger(config.metadata?.videoSeed ?? config.metadata?.seed, "视频 Seed"),
        signal,
        onProgress: (progress) => signal?.aborted ? undefined : publishVideoProgress(projectId, config.id, outputIds, progress, originClientId, remoteOperation, operationId),
      });
      signal?.throwIfAborted();
      const settled = outputIds.map((_, index) => resources[index]
        ? ({ status: "fulfilled", value: resources[index] } as PromiseFulfilledResult<StoredResource>)
        : ({ status: "rejected", reason: new Error(`${model} 未返回该视频结果`) } as PromiseRejectedResult));
      const failure = await finishResourceOutputs(projectId, config.id, outputIds, settled, originClientId);
      if (failure) return { configNodeId, outputNodeIds: outputIds, status: "error", error: failure };
    } else if (mode === "audio") {
      const voiceId = String(config.metadata?.audioVoice || "").trim();
      if (!voiceId) throw new Error("语音生成模组必须选择 pull characters 中的 Voice");
      const resource = await generateSpeech({ content: inputs.prompt, voiceId, direction: String(config.metadata?.audioInstructions || "") }, async (progress) => {
        if (signal?.aborted) return;
        if (toneNodeId) await publishSpeechProgress(projectId, toneNodeId, outputIds[0], progress, originClientId, remoteOperation);
      });
      signal?.throwIfAborted();
      const failure = await finishResourceOutputs(projectId, config.id, outputIds, [{ status: "fulfilled", value: resource }], originClientId);
      if (failure) return { configNodeId, outputNodeIds: outputIds, ...(toneNodeId ? { toneNodeId } : {}), status: "error", error: failure };
    } else {
      const resources = await generateMusic({
        prompt: String(config.metadata?.musicLyrics || inputs.prompt),
        model,
        signal,
        onProgress: (progress) => signal?.aborted ? undefined : publishMusicProgress(projectId, config.id, outputIds, progress, originClientId, remoteOperation, operationId),
        params: {
          customMode: true,
          instrumental: Boolean(config.metadata?.musicInstrumental),
          style: [String(config.metadata?.musicDescription || ""), ...(Array.isArray(config.metadata?.musicStyles) ? config.metadata.musicStyles : [])].filter(Boolean).join(", "),
          title: String(config.metadata?.musicTitle || title),
          negativeTags: String(config.metadata?.musicNegativeTags || ""),
          vocalGender: config.metadata?.musicVocalGender,
          styleWeight: config.metadata?.musicStyleWeight,
          weirdnessConstraint: config.metadata?.musicWeirdnessConstraint,
          maxDuration: config.metadata?.musicMaxDuration,
          seed: config.metadata?.musicSeed,
          tiledDecode: config.metadata?.musicTiledDecode,
          outputFormat: config.metadata?.musicOutputFormat,
        },
      });
      signal?.throwIfAborted();
      const settled = outputIds.map((_, index) => resources[index]
        ? ({ status: "fulfilled", value: resources[index] } as PromiseFulfilledResult<StoredResource>)
        : ({ status: "rejected", reason: new Error(`${model} 未返回该音乐结果`) } as PromiseRejectedResult));
      const failure = await finishResourceOutputs(projectId, config.id, outputIds, settled, originClientId);
      if (failure) return { configNodeId, outputNodeIds: outputIds, status: "error", error: failure };
    }
    return { configNodeId, outputNodeIds: outputIds, ...(toneNodeId ? { toneNodeId } : {}), status: "success" };
  } catch (error) {
    const message = errorMessage(error);
    const cancelled = Boolean(signal?.aborted);
    const terminalLabel = cancelled ? (isMcpOperation ? "MCP 运行已取消" : "生成已取消") : "生成失败";
    await mutateAndPublish(projectId, [
      { op: "update_node", nodeId: config.id, patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: terminalLabel, errorDetails: message } } },
      ...outputIds.map((nodeId): CanvasOperation => ({ op: "update_node", nodeId, patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: terminalLabel, errorDetails: message } } })),
      ...(toneNodeId ? [{ op: "update_node", nodeId: toneNodeId, patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: cancelled ? terminalLabel : "语气优化失败", errorDetails: message } } } as CanvasOperation] : []),
    ], originClientId).catch(() => undefined);
    return { configNodeId, outputNodeIds: outputIds, ...(toneNodeId ? { toneNodeId } : {}), status: "error", error: message };
  }
}

function resolveInputs(project: CanvasProject, config: CanvasNode, mode: GenerationMode): ResolvedInput {
  const incomingIds = project.connections.filter((connection) => connection.toNodeId === config.id).map((connection) => connection.fromNodeId);
  const incoming = incomingIds.map((id) => project.nodes.find((node) => node.id === id)).filter((node): node is CanvasNode => Boolean(node));
  const systemNodes = incoming.filter((node) => node.type === "text" && node.metadata?.promptRole === "system");
  const systemPromptNodeIds = systemNodes.map((node) => node.id);
  const systemPrompt = systemNodes.map(systemNodeText).filter(Boolean).join("\n\n");
  const userIncoming = incoming.filter((node) => !systemPromptNodeIds.includes(node.id));
  const rawComposer = String(config.metadata?.composerContent || "").trim();
  const rawPrompt = rawComposer || String(config.metadata?.prompt || config.metadata?.musicDescription || "").trim();
  if (!rawPrompt) throw new Error(`生成模组 ${config.id} 的提示词为空`);
  if (!rawComposer) {
    const texts = userIncoming.map(nodeText).filter(Boolean);
    const media = mediaIds(userIncoming);
    return { prompt: [rawPrompt, ...texts].filter(Boolean).join("\n\n"), systemPrompt, systemPromptNodeIds, ...media, sourceNodeIds: [...new Set(userIncoming.map((node) => node.id))] };
  }
  const byId = new Map(userIncoming.map((node) => [node.id, node]));
  const selected = new Map<string, { node: CanvasNode; label: string }>();
  const sourceNodeIds: string[] = [];
  const counts = { image: 0, video: 0, audio: 0 };
  let lastIndex = 0;
  let prompt = "";
  for (const match of rawComposer.matchAll(/@\[node:([^\]]+)\]/g)) {
    if (match.index == null) continue;
    prompt += rawComposer.slice(lastIndex, match.index);
    const nodeId = match[1];
    if (systemPromptNodeIds.includes(nodeId)) throw new Error(`System Prompt 节点 ${nodeId} 只需连接到生成模组，不能插入 user prompt`);
    const node = byId.get(nodeId);
    if (!node) throw new Error(`引用节点 ${nodeId} 未连接到生成模组 ${config.id}`);
    if (!sourceNodeIds.includes(nodeId)) sourceNodeIds.push(nodeId);
    const text = nodeText(node);
    if (node.type === "text") {
      if (!text) throw new Error(`文本节点 ${nodeId} 没有内容`);
      prompt += text;
    } else {
      const kind = mediaKind(node);
      const storageKey = String(node.metadata?.storageKey || "").trim();
      if (!kind || !storageKey) throw new Error(`素材节点 ${nodeId} 尚未保存到本地资源库`);
      let entry = selected.get(nodeId);
      if (!entry) {
        const index = counts[kind]++;
        entry = { node, label: mode === "video"
          ? kind === "image" ? `<Picture ${index + 1}>` : kind === "video" ? `<Video ${index + 1}>` : `<Audio ${index + 1}>`
          : kind === "image" ? `图片${index + 1}` : kind === "video" ? `视频${index + 1}` : `音频${index + 1}` };
        selected.set(nodeId, entry);
      }
      prompt += entry.label;
    }
    lastIndex = match.index + match[0].length;
  }
  prompt += rawComposer.slice(lastIndex);
  const media = mediaIds([...selected.values()].map((entry) => entry.node));
  return { prompt: prompt.trim(), systemPrompt, systemPromptNodeIds, ...media, sourceNodeIds };
}

function resolvedInputSnapshot(inputs: ResolvedInput) {
  return {
    schemaVersion: 1,
    promptSha256: sha256Text(inputs.prompt),
    systemPromptSha256: sha256Text(inputs.systemPrompt),
    systemPromptNodeIds: inputs.systemPromptNodeIds,
    sourceNodeIds: inputs.sourceNodeIds,
    imageResourceIds: inputs.imageIds,
    videoResourceIds: inputs.videoIds,
    audioResourceIds: inputs.audioIds,
  };
}

function h3ResourceRoles(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function promptPreparationMetadata(prepared: H3PromptPreparation) {
  return {
    enabled: prepared.skippedReason !== "disabled",
    optimized: prepared.optimized,
    skippedReason: prepared.skippedReason || null,
    templateKey: prepared.templateKey || null,
    templateVersion: prepared.templateVersion || null,
    systemPromptSha256: prepared.systemPromptSha256 || null,
    model: prepared.model || null,
    inputMode: prepared.inputMode,
    resourceRoles: prepared.resourceRoles,
  };
}

function promptOptimizationEnabled(value: unknown) {
  return value !== false && String(value ?? "true").toLowerCase() !== "false";
}

function sha256Text(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }

function mediaIds(nodes: CanvasNode[]) {
  const imageIds: string[] = [], videoIds: string[] = [], audioIds: string[] = [];
  for (const node of nodes) {
    const storageKey = String(node.metadata?.storageKey || "").trim();
    if (!storageKey) continue;
    const kind = mediaKind(node);
    if (kind === "image") imageIds.push(storageKey);
    if (kind === "video") videoIds.push(storageKey);
    if (kind === "audio") audioIds.push(storageKey);
  }
  return { imageIds, videoIds, audioIds };
}

async function finishTextOutputs(projectId: string, configNodeId: string, outputIds: string[], settled: PromiseSettledResult<string>[], originClientId: string) {
  const operations = settled.map((result, index): CanvasOperation => result.status === "fulfilled"
    ? { op: "update_node", nodeId: outputIds[index], patch: { metadata: { content: result.value, status: "success", generationState: "ready", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: "生成完成", errorDetails: "" } } }
    : { op: "update_node", nodeId: outputIds[index], patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: "生成失败", errorDetails: errorMessage(result.reason) } } });
  const failure = settled.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
  operations.push({ op: "update_node", nodeId: configNodeId, patch: { metadata: { status: failure ? "error" : "success", generationState: failure ? "failed" : "ready", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: failure ? "部分结果生成失败" : "生成完成", errorDetails: failure ? errorMessage(failure.reason) : "" } } });
  await mutateAndPublish(projectId, operations, originClientId);
  return failure ? errorMessage(failure.reason) : undefined;
}

async function finishResourceOutputs(projectId: string, configNodeId: string, outputIds: string[], settled: PromiseSettledResult<StoredResource>[], originClientId: string) {
  const operations = settled.map((result, index): CanvasOperation => result.status === "fulfilled"
    ? { op: "update_node", nodeId: outputIds[index], patch: { title: result.value.name.replace(/\.[^.]+$/, ""), metadata: resourceMetadata(result.value) } }
    : { op: "update_node", nodeId: outputIds[index], patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: "生成失败", errorDetails: errorMessage(result.reason) } } });
  const failure = settled.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
  operations.push({ op: "update_node", nodeId: configNodeId, patch: { metadata: { status: failure ? "error" : "success", generationState: failure ? "failed" : "ready", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: failure ? "部分结果生成失败" : "生成完成", errorDetails: failure ? errorMessage(failure.reason) : "" } } });
  await mutateAndPublish(projectId, operations, originClientId);
  return failure ? errorMessage(failure.reason) : undefined;
}

async function publishSpeechProgress(projectId: string, toneNodeId: string, audioNodeId: string, progress: SpeechGenerationProgress, originClientId: string, remoteOperation: boolean) {
  const operations: CanvasOperation[] = [];
  if (progress.stage === "tone") operations.push({ op: "update_node", nodeId: toneNodeId, patch: { metadata: { model: progress.toneModel, status: "loading", remoteOperationActive: remoteOperation, remoteOperationLabel: progress.label } } });
  if (progress.stage === "tone-ready") operations.push(
    { op: "update_node", nodeId: toneNodeId, patch: { metadata: { model: progress.toneModel, content: JSON.stringify({ segments: progress.segments || [] }, null, 2), status: "success", generationState: "ready", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: progress.label } } },
    { op: "update_node", nodeId: audioNodeId, patch: { metadata: { remoteOperationActive: remoteOperation, remoteOperationLabel: "Seed-TTS 正在准备语音" } } },
  );
  if (progress.stage === "synthesis" || progress.stage === "saving") operations.push({ op: "update_node", nodeId: audioNodeId, patch: { metadata: { remoteOperationActive: remoteOperation, remoteOperationLabel: progress.label, speechStage: progress.stage, speechSegmentCurrent: progress.current, speechSegmentTotal: progress.total } } });
  if (progress.stage === "error") operations.push({ op: "update_node", nodeId: progress.failedStage === "tone" ? toneNodeId : audioNodeId, patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: progress.label, errorDetails: progress.error || progress.label } } });
  if (operations.length) await mutateAndPublish(projectId, operations, originClientId);
}

async function publishVideoProgress(projectId: string, configNodeId: string, outputIds: string[], progress: H3GenerationProgress, originClientId: string, remoteOperation: boolean, operationId?: string) {
  const outputNodeId = outputIds[progress.outputIndex];
  if (!outputNodeId) return;
  const generationState = progress.stage === "queued" || progress.stage === "submitted" ? "queued" : "running";
  const metadata = {
    generationJobId: progress.jobId,
    generationStage: progress.stage,
    generationState,
    ...(progress.progress != null ? { generationProgress: progress.progress } : {}),
    remoteOperationActive: remoteOperation,
    remoteOperationId: remoteOperation ? operationId : null,
    remoteOperationLabel: progress.label,
  };
  await mutateAndPublish(projectId, [
    { op: "update_node", nodeId: configNodeId, patch: { metadata } },
    { op: "update_node", nodeId: outputNodeId, patch: { metadata } },
  ], originClientId);
}

async function publishMusicProgress(projectId: string, configNodeId: string, outputIds: string[], progress: H3GenerationProgress, originClientId: string, remoteOperation: boolean, operationId?: string) {
  const outputNodeId = outputIds[progress.outputIndex];
  if (!outputNodeId) return;
  const generationState = progress.stage === "queued" || progress.stage === "submitted" ? "queued" : "running";
  const metadata = {
    generationJobId: progress.jobId,
    generationStage: progress.stage,
    generationState,
    ...(progress.progress != null ? { generationProgress: progress.progress } : {}),
    remoteOperationActive: remoteOperation,
    remoteOperationId: remoteOperation ? operationId : null,
    remoteOperationLabel: progress.label,
  };
  await mutateAndPublish(projectId, [
    { op: "update_node", nodeId: configNodeId, patch: { metadata } },
    { op: "update_node", nodeId: outputNodeId, patch: { metadata } },
  ], originClientId);
}

async function mutateAndPublish(projectId: string, operations: CanvasOperation[], originClientId: string) {
  // This runtime is the canonical internal execution path for both free Canvas
  // nodes and Studio-projected nodes. Studio semantic writes remain blocked at
  // the public command layer; only runtime status/result updates are allowed.
  const connections = operations.filter((operation): operation is Extract<CanvasOperation, { op: "connect" }> => operation.op === "connect");
  const current = connections.length ? asProject(await readProject(projectId)) : undefined;
  const nextOperations = current?.studio ? withRuntimeStudioBindings(current, operations) : operations;
  const result = await applyCanvasOperations(projectId, nextOperations, undefined, { allowStudioManagedWrites: true });
  publishProjectUpdated(result.project, originClientId);
  return result;
}

function withRuntimeStudioBindings(project: CanvasProject, operations: CanvasOperation[]) {
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  for (const operation of operations) {
    if (operation.op === "add_node" && operation.node.id) nodes.set(operation.node.id, operation.node as CanvasNode);
  }
  const bindings: Extract<CanvasOperation, { op: "add_studio_canvas_bindings" }>["bindings"] = [];
  for (const operation of operations) {
    if (operation.op !== "connect") continue;
    const from = nodes.get(operation.from);
    const to = nodes.get(operation.to);
    if (from?.metadata?.studioManaged !== true && to?.metadata?.studioManaged !== true) continue;
    bindings.push({ fromNodeId: operation.from, toNodeId: operation.to, ...(operation.fromPort ? { fromPort: operation.fromPort } : {}), ...(operation.toPort ? { toPort: operation.toPort } : {}) });
  }
  return bindings.length ? [...operations, { op: "add_studio_canvas_bindings", bindings } as CanvasOperation] : operations;
}

function resourceMetadata(resource: StoredResource) {
  return { content: resource.url, storageKey: resource.id, mimeType: resource.mimeType, bytes: resource.size, status: "success", generationState: "ready", generationStage: "completed", generationProgress: 100, remoteOperationActive: false, remoteOperationId: null, remoteOperationOrigin: null, remoteOperationLabel: "生成完成", errorDetails: "", ...(resource.metadata || {}) };
}
function requiredConfig(project: CanvasProject, nodeId: string) { const node = project.nodes.find((item) => item.id === nodeId); if (!node) throw new Error(`节点不存在：${nodeId}`); if (node.type !== "config") throw new Error(`节点 ${nodeId} 不是生成模组`); return node; }
function generationMode(node: CanvasNode): GenerationMode { const value = String(node.metadata?.generationMode || "image"); if (!["text", "image", "video", "audio", "music"].includes(value)) throw new Error(`不支持的生成模式：${value}`); return value as GenerationMode; }
function nodeText(node: CanvasNode) { return node.type === "text" ? String(node.metadata?.content || node.metadata?.prompt || "").trim() : ""; }
function systemNodeText(node: CanvasNode) { return node.type === "text" ? String(node.metadata?.content || node.metadata?.prompt || "") : ""; }
function mediaKind(node: CanvasNode): "image" | "video" | "audio" | undefined { if (node.type === "image") return "image"; if (node.type === "video") return "video"; if (node.type === "audio" || node.type === "music") return "audio"; return undefined; }
function normalizeModel(value: string) { const decoded = value.includes("::") ? value.slice(value.indexOf("::") + 2) : value; const aliases: Record<string, string> = { "volc-doubao-turbo": "doubao-seed-2.1-turbo", "doubao-seed-2-1-turbo-260628": "doubao-seed-2.1-turbo", "volc-deepseek-flash": "deepseek-v4-flash", "deepseek-v4-flash-ga-260731": "deepseek-v4-flash", "deepseek-v4-flash-260425": "deepseek-v4-flash", "volc-deepseek-pro": "deepseek-v4-pro", "deepseek-v4-pro-260425": "deepseek-v4-pro", "bigmodel-glm-52": "glm-5.3", "glm-5.2": "glm-5.3", "bigmodel-glm-5v": "glm-5v-turbo", "runware-gemini-pro": models.runwareLlm[0], "runware-gemini-flash": models.runwareLlm[1], "runware-gemini-flash-lite": models.runwareLlm[2], "runware-lite": models.image[0], "runware-nano": models.image[1], "runware-gpt-image-02": models.image[2], "ernie-image-turbo": "ernie-image-turbo", "minimax-h3": "minimax-h3", "minimax-h3-r2v": "minimax-h3", "ltx-2.5": "ltx-2.5", "minimax-music-3": "minimax-music-3", "volc-speech": "volcengine:seed-tts-2.0-expressive", "suno-music": models.music[0] }; return aliases[decoded] || decoded; }
function speechToneModel() { const configured = process.env.TTS_TONE_MODEL || "deepseek-v4-flash-ga-260731"; return configured === "deepseek-v4-flash-260425" ? "deepseek-v4-flash-ga-260731" : configured; }
function validateModel(mode: GenerationMode, model: string) { if (!model) throw new Error("生成模组必须指定模型"); if (mode === "text" && ![...models.codingPlanLlm, ...models.volcengineLlm, ...models.bigmodelLlm, ...models.runwareLlm].includes(model)) throw new Error(`模型 ${model} 不是可用的文字模型`); if (mode === "image" && !models.image.includes(model)) throw new Error(`模型 ${model} 不是可用的图片模型`); if (mode === "video" && !models.video.includes(model)) throw new Error(`模型 ${model} 不是可用的视频模型`); if (mode === "music" && !models.music.includes(model)) throw new Error(`模型 ${model} 不是可用的音乐模型`); }
function textResourceIdsForModel(model: string, inputs: ResolvedInput) { if (models.runwareLlm.includes(model)) return [...inputs.imageIds, ...inputs.videoIds, ...inputs.audioIds]; if (model === "glm-5v-turbo") return [...inputs.imageIds, ...inputs.videoIds]; if (model === "doubao-seed-2.1-turbo") return inputs.imageIds; return []; }
function optionalNonnegativeInteger(value: unknown, label: string) { if (value == null || value === "") return undefined; const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} 必须为非负整数`); return number; }
function optionalBoundedNumber(value: unknown, minimum: number, maximum: number, label: string) { if (value == null || value === "") return undefined; const number = Number(value); if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label} 必须在 ${minimum}–${maximum} 之间`); return number; }
function generationCount(node: CanvasNode, mode: GenerationMode, model: string) { if (mode === "audio") return 1; if (mode === "music") return model === "minimax-music-3" ? 1 : 2; const value = Number(mode === "video" ? node.metadata?.videoCount : node.metadata?.count); return Math.max(1, Math.min(3, Number.isFinite(value) ? Math.floor(value) : 1)); }
function textThinkingMode(node: CanvasNode): TextThinkingMode | undefined { const value = String(node.metadata?.thinking || ""); return value === "enabled" || value === "disabled" || value === "auto" ? value : undefined; }
function textOutputSchema(node: CanvasNode): Record<string, unknown> | undefined { const value = node.metadata?.outputSchema; return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function textOutputSchemaName(node: CanvasNode): string | undefined { const value = String(node.metadata?.outputSchemaName || "").trim(); return value || undefined; }
function textResponseApi(node: CanvasNode): "ark-responses" | undefined { return node.metadata?.responseApi === "ark-responses" ? "ark-responses" : undefined; }
function videoDuration(node: CanvasNode, model: string) { return Math.max(3, Math.min(model === "ltx-2.5" ? 20 : 15, Math.floor(Number(node.metadata?.seconds) || 6))); }
function videoInputMode(node: CanvasNode, model: string, inputs: ResolvedInput) { if (model === "minimax-h3") return normalizeH3InputMode(node.metadata?.videoInputMode || node.metadata?.generation_mode); return ltxInputMode(node.metadata?.videoInputMode, inputs.imageIds.length > 0); }
export function ltxInputMode(value: unknown, hasImage: boolean) { const mode = String(value || ""); if (mode === "text" || mode === "firstFrame" || mode === "multimodal") return mode; return hasImage ? "multimodal" : "text"; }
function imageDimension(node: CanvasNode, index: 0 | 1) { const match = String(node.metadata?.size || "").match(/^(\d+)x(\d+)$/); return match ? Number(match[index + 1]) : 1024; }
function outputSize(type: string) { if (type === "image") return { width: 360, height: 320 }; if (type === "video") return { width: 400, height: 300 }; if (type === "audio") return { width: 360, height: 180 }; if (type === "music") return { width: 380, height: 220 }; return { width: 320, height: 240 }; }
function outputPosition(project: CanvasProject, config: CanvasNode, index: number, width: number, height: number) { const existing = project.connections.filter((connection) => connection.fromNodeId === config.id).length; return { x: config.position.x + config.width + 96, y: config.position.y + (existing + index) * (height + 36) }; }
function outputTitle(mode: GenerationMode, config: CanvasNode, prompt: string) { const configured = String(config.title || "").trim().replace(/生成模组/g, "结果"); const fallback: Record<GenerationMode, string> = { text: "Generated Text", image: "Generated Image", video: "Generated Video", audio: "Generated Audio", music: "Generated Music" }; return configured && configured !== "结果" ? configured.slice(0, 64) : prompt.replace(/\s+/g, " ").slice(0, 32) || fallback[mode]; }
function providerLabel(mode: GenerationMode, model: string) { if (mode === "audio") return "等待 DeepSeek 语气优化"; if (mode === "video") return model === "ltx-2.5" ? "LTX 2.5 生成中" : "MiniMax H3 生成中"; if (mode === "music") return model === "minimax-music-3" ? "MiniMax Music 3 生成中" : "Suno 生成中"; return `${model} 请求中`; }
function providerUsesQueue(mode: GenerationMode) { return mode === "image" || mode === "video" || mode === "music"; }
function providerSubmittingLabel(mode: GenerationMode, model: string) { return providerLabel(mode, model).replace(/生成中$|请求中$/, "正在提交"); }
function shotLayoutMetadata(config: CanvasNode) {
  const factoryRunId = String(config.metadata?.factoryRunId || "");
  const groupId = String(config.metadata?.groupId || "");
  const shotId = String(config.metadata?.shotId || "");
  const layoutOrder = Number(config.metadata?.layoutOrder || 0);
  const layoutSection = String(config.metadata?.layoutSection || generationMode(config));
  return {
    factoryRunId,
    child: (offset: number) => factoryRunId && groupId && shotId ? { factoryRunId, groupId, shotId, layoutManaged: true, layoutSection, layoutOrder: layoutOrder + offset / 100 } : {},
  };
}
function asProject(value: unknown): CanvasProject { const project = value as CanvasProject; if (!Array.isArray(project?.nodes) || !Array.isArray(project?.connections)) throw new Error("画布数据结构无效"); return project; }
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "节点生成失败";
  return message
    .replace(/https?:\/\/\S+/gi, "[临时素材 URL 已脱敏]")
    .replace(/(?:token|apikey|authorization)\s*[:=]?\s*[^\s,;]+/gi, "$1: ***")
    .slice(0, 500);
}
async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) { const results = new Array<R>(items.length); let next = 0; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const index = next++; results[index] = await worker(items[index]); } })); return results; }
