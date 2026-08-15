import { createHash } from "node:crypto";
import type { CanvasOperation } from "./canvas-commands";
import { models } from "./providers";
import { avoidStudioNodeOverlaps } from "./studio-node-placement";
import { STUDIO_MAPPING_VERSION, type StudioCanvasBinding, type StudioMappingEntityType, type StudioNamedEntity, type StudioProjectState, type StudioStoryboardFrame, type StudioVideoTask } from "./studio-types";

type ExistingNode = { id: string; type: string; title?: string; position?: { x: number; y: number }; width?: number; height?: number; metadata?: Record<string, unknown> };
type ExistingConnection = { id: string; fromNodeId: string; toNodeId: string; fromPort?: string; toPort?: string };
type DesiredNode = { id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number; metadata: Record<string, unknown> };

export function stableStudioNodeId(projectId: string, entityType: StudioMappingEntityType, entityId: string, role: string) {
  const digest = createHash("sha256").update([projectId, entityType, entityId, role].join("\0")).digest("hex").slice(0, 32);
  return `studio_${digest}`;
}

export function studioMappingOperations(input: {
  projectId: string;
  state: StudioProjectState;
  nodes: ExistingNode[];
  connections?: ExistingConnection[];
}): CanvasOperation[] {
  const desired = projectGraph(input.projectId, input.state);
  for (const override of input.state.canvasNodeOverrides) {
    const target = desired.nodes.find((node) => node.id === override.nodeId);
    if (!target) continue;
    if (override.title) target.title = override.title;
    target.metadata = { ...target.metadata, ...override.metadata };
  }
  const existingById = new Map(input.nodes.map((node) => [node.id, node]));
  const availableNodeIds = new Set([...input.nodes.map((node) => node.id), ...desired.nodes.map((node) => node.id)]);
  for (const binding of input.state.canvasBindings) {
    if (availableNodeIds.has(binding.fromNodeId) && availableNodeIds.has(binding.toNodeId)) desired.edges.push({ fromNodeId: binding.fromNodeId, toNodeId: binding.toNodeId, fromPort: binding.fromPort, toPort: binding.toPort });
  }
  const desiredIds = new Set(desired.nodes.map((node) => node.id));
  const operations: CanvasOperation[] = [];
  const replacedIds = new Set(desired.nodes.filter((node) => existingById.has(node.id) && existingById.get(node.id)!.type !== node.type).map((node) => node.id));
  const deletedIds = new Set(input.nodes.filter((node) => node.metadata?.studioManaged === true && !desiredIds.has(node.id)).map((node) => node.id));
  const currentConnections = (input.connections || []).filter((connection) => {
    const from = existingById.get(connection.fromNodeId);
    const to = existingById.get(connection.toNodeId);
    return from?.metadata?.studioManaged === true || to?.metadata?.studioManaged === true;
  });
  const desiredEdges = [...new Map(desired.edges.map((edge) => [edgeKey(edge), edge])).values()];
  const desiredKeys = new Set(desiredEdges.map(edgeKey));
  const disconnectedKeys = new Set<string>();
  for (const connection of currentConnections) {
    const key = edgeKey(connection);
    if (!desiredKeys.has(key) || deletedIds.has(connection.fromNodeId) || deletedIds.has(connection.toNodeId) || replacedIds.has(connection.fromNodeId) || replacedIds.has(connection.toNodeId)) {
      operations.push({ op: "disconnect", connectionId: connection.id });
      disconnectedKeys.add(key);
    }
  }
  for (const nodeId of deletedIds) operations.push({ op: "delete_node", nodeId });
  for (const node of desired.nodes) {
    const existing = existingById.get(node.id);
    if (!existing) operations.push({ op: "add_node", node });
    else if (existing.type !== node.type) {
      operations.push({ op: "delete_node", nodeId: node.id }, { op: "add_node", node });
    } else {
      operations.push({ op: "update_node", nodeId: node.id, patch: { title: node.title, metadata: node.metadata } });
    }
  }

  const currentKeys = new Set(currentConnections.map(edgeKey));
  for (const edge of desiredEdges) {
    if (!currentKeys.has(edgeKey(edge)) || disconnectedKeys.has(edgeKey(edge))) operations.push({
      op: "connect",
      from: edge.fromNodeId,
      to: edge.toNodeId,
      fromPort: edge.fromPort || "workflow-output",
      toPort: edge.toPort || "workflow-input",
    });
  }
  return avoidStudioNodeOverlaps(input.nodes, operations);
}

// Kept as the narrow compatibility name used by the first integration slice.
export function studioScriptMappingOperations(input: { projectId: string; state: StudioProjectState; nodes: ExistingNode[]; connections?: ExistingConnection[] }) {
  return studioMappingOperations(input);
}

function projectGraph(projectId: string, state: StudioProjectState) {
  const nodes: DesiredNode[] = [];
  const edges: Array<Pick<StudioCanvasBinding, "fromNodeId" | "toNodeId" | "fromPort" | "toPort">> = [];
  const groups = {
    script: group(projectId, "script", "script", "Studio · Script", 160, 160, 760, 920),
    art: group(projectId, "art-direction", "art-direction", "Studio · Art Direction", 1040, 160, 760, 960),
    cast: group(projectId, "character", "cast", "Studio · Cast & Assets", 1920, 160, 760, Math.max(920, 240 + (state.characters.length + state.scenes.length + state.props.length) * 760)),
    storyboard: group(projectId, "frame", "storyboard", "Studio · Storyboard", 2800, 160, 2600, Math.max(1800, 700 + state.frames.length * 1700)),
    assembly: group(projectId, "assembly", "assembly", "Studio · Assembly", 5440, 160, 760, 920),
  };
  nodes.push(...Object.values(groups));

  const scriptId = stableStudioNodeId(projectId, "script", projectId, "source-text");
  nodes.push(node(projectId, "script", projectId, "source-text", "text", "原始剧本", 208, 280, 664, 320, {
    groupId: groups.script.id, artifactType: "studio-script", stage: "script", content: state.originalText,
    status: state.originalText.trim() ? "success" : "idle", layoutSection: "source", layoutOrder: 1,
  }));
  const entityAnalysisId = stableStudioNodeId(projectId, "script", projectId, "entity-analysis-config");
  nodes.push(node(projectId, "script", projectId, "entity-analysis-config", "config", "剧本实体分析", 208, 640, 664, 390, {
    groupId: groups.script.id, artifactType: "studio-entity-analysis-config", stage: "script", generationMode: "text", model: "google:gemini@3.1-pro",
    composerContent: entityExtractionPrompt(state), count: 1, status: "idle", layoutSection: "analysis", layoutOrder: 2,
  }));
  edges.push({ fromNodeId: scriptId, toNodeId: entityAnalysisId });

  const artId = stableStudioNodeId(projectId, "art-direction", projectId, "direction");
  const artContent = state.artDirection ? JSON.stringify(state.artDirection, null, 2) : state.stylePrompt || state.stylePreset || "尚未设置艺术指导";
  nodes.push(node(projectId, "art-direction", projectId, "direction", "text", "艺术指导", 1088, 280, 664, 360, {
    groupId: groups.art.id, artifactType: "studio-art-direction", stage: "art-direction", content: artContent,
    selectedStyleId: state.artDirection?.selected_style_id || state.stylePreset || "", status: state.artDirection || state.stylePreset ? "success" : "idle", layoutSection: "direction", layoutOrder: 1,
  }));
  edges.push({ fromNodeId: scriptId, toNodeId: artId });
  const artAnalysisId = stableStudioNodeId(projectId, "art-direction", projectId, "analysis-config");
  nodes.push(node(projectId, "art-direction", projectId, "analysis-config", "config", "艺术风格分析", 1088, 680, 664, 390, {
    groupId: groups.art.id, artifactType: "studio-art-analysis-config", stage: "art-direction", generationMode: "text", model: "google:gemini@3.1-pro",
    composerContent: artDirectionPrompt(state), count: 1, status: "idle", layoutSection: "analysis", layoutOrder: 2,
  }));
  edges.push({ fromNodeId: scriptId, toNodeId: artAnalysisId });

  let castY = 280;
  for (const [kind, entities] of [["character", state.characters], ["scene", state.scenes], ["prop", state.props]] as const) {
    for (const entity of entities) {
      const ids = addEntity(nodes, edges, projectId, groups.cast.id, artId, kind, entity, castY, state);
      castY += ids.blockHeight;
    }
  }

  let frameY = 280;
  const storyboardAnalysisId = stableStudioNodeId(projectId, "frame", projectId, "analysis-config");
  nodes.push(node(projectId, "frame", projectId, "analysis-config", "config", "分镜结构分析", 2848, frameY, 724, 390, {
    groupId: groups.storyboard.id, artifactType: "studio-storyboard-analysis-config", stage: "storyboard", generationMode: "text", model: "google:gemini@3.1-pro",
    composerContent: storyboardPrompt(state), count: 1, status: "idle", layoutSection: "analysis", layoutOrder: 0,
  }));
  edges.push({ fromNodeId: scriptId, toNodeId: storyboardAnalysisId }, { fromNodeId: artId, toNodeId: storyboardAnalysisId });
  const globalPromptRevisionId = stableStudioNodeId(projectId, "frame", projectId, "prompt-revision-config");
  const globalVisualContextId = stableStudioNodeId(projectId, "frame", projectId, "visual-context-config");
  nodes.push(node(projectId, "frame", projectId, "visual-context-config", "config", "视频素材视觉上下文", 3744, frameY, 340, 390, {
    groupId: groups.storyboard.id, artifactType: "studio-visual-context-config", stage: "storyboard", generationMode: "text", model: "glm-5v-turbo", composerContent: state.originalText || "等待参考素材", count: 1, status: "idle", layoutSection: "visual-context", layoutOrder: 1,
  }));
  edges.push({ fromNodeId: storyboardAnalysisId, toNodeId: globalVisualContextId });
  nodes.push(node(projectId, "frame", projectId, "prompt-revision-config", "config", "视频 Prompt 生成", 4560, frameY, 340, 390, {
    groupId: groups.storyboard.id, artifactType: "studio-video-prompt-config", stage: "storyboard", generationMode: "text", model: "doubao-seed-2-1-turbo-260628", composerContent: state.originalText || "等待 Prompt 输入", count: 1, status: "idle", layoutSection: "prompt-revision", layoutOrder: 1,
  }));
  edges.push({ fromNodeId: storyboardAnalysisId, toNodeId: globalPromptRevisionId }, { fromNodeId: globalVisualContextId, toNodeId: globalPromptRevisionId });
  frameY += 460;
  for (const frame of [...state.frames].sort((a, b) => a.order - b.order)) {
    frameY += addFrame(nodes, edges, projectId, groups.storyboard.id, artId, frame, frameY, state);
  }

  const assemblyId = stableStudioNodeId(projectId, "assembly", projectId, "timeline");
  nodes.push(node(projectId, "assembly", projectId, "timeline", "text", "剪辑与混音", 5488, 280, 664, 300, {
    groupId: groups.assembly.id, artifactType: "studio-assembly", stage: "assembly",
    content: JSON.stringify({ orderedFrameIds: state.assembly.orderedFrameIds, mergedVideoUrl: state.assembly.mergedVideoUrl, bgmUrl: state.assembly.bgmUrl, mixSettings: state.assembly.mixSettings }, null, 2),
    status: state.assembly.mergedVideoUrl ? "success" : "idle", layoutSection: "assembly", layoutOrder: 1,
  }));
  for (const frameId of state.assembly.orderedFrameIds) {
    const task = selectedFrameTask(state, frameId);
    edges.push({ fromNodeId: task ? stableStudioNodeId(projectId, "take", task.id, "video-output") : stableStudioNodeId(projectId, "frame", frameId, "prompt"), toNodeId: assemblyId });
  }
  if (state.assembly.mergedVideoResourceId) {
    const outputId = stableStudioNodeId(projectId, "assembly", projectId, "merged-output");
    nodes.push(node(projectId, "assembly", projectId, "merged-output", "video", "合成视频", 5488, 620, 664, 420, resourceMetadata(state.assembly.mergedVideoResourceId, state.assembly.mergedVideoUrl || "", groups.assembly.id, "assembly", 2)));
    edges.push({ fromNodeId: assemblyId, toNodeId: outputId });
  }
  return { nodes, edges: edges.filter((edge) => nodes.some((node) => node.id === edge.fromNodeId) && nodes.some((node) => node.id === edge.toNodeId)) };
}

function addEntity(nodes: DesiredNode[], edges: Array<{ fromNodeId: string; toNodeId: string }>, projectId: string, groupId: string, artId: string, kind: "character" | "scene" | "prop", entity: StudioNamedEntity, y: number, state: StudioProjectState) {
  const labels = { character: "角色", scene: "场景", prop: "道具" };
  const entityId = stableStudioNodeId(projectId, kind, entity.id, "description");
  nodes.push(node(projectId, kind, entity.id, "description", "text", `${labels[kind]} · ${entity.name}`, 1968, y, 664, 240, {
    groupId, artifactType: `studio-${kind}`, stage: "cast", content: entity.description, studioEntitySnapshot: safeSnapshot(entity), status: entity.status || "success", layoutSection: kind, layoutOrder: y,
  }));
  edges.push({ fromNodeId: artId, toNodeId: entityId });
  const configId = stableStudioNodeId(projectId, kind, entity.id, "image-config");
  nodes.push(node(projectId, kind, entity.id, "image-config", "config", `${entity.name} · 形象生成`, 1968, y + 280, 320, 390, imageConfigMetadata(groupId, `${stylePrefix(state)}${entity.description || entity.name}`, kind, y + 1, undefined, state)));
  edges.push({ fromNodeId: entityId, toNodeId: configId });
  const variants = entity.image_asset?.variants || [];
  variants.forEach((variant, index) => {
    const role = `image-output-${variant.id}`;
    const imageId = stableStudioNodeId(projectId, kind, entity.id, role);
    nodes.push(node(projectId, kind, entity.id, role, "image", `${entity.name} · 形象 ${index + 1}`, 2312, y + 280 + index * 350, 320, 320,
      variant.resource_id ? resourceMetadata(variant.resource_id, variant.url || "", groupId, kind, y + 2 + index) : pendingResourceMetadata(groupId, kind, y + 2 + index)));
    nodes[nodes.length - 1].metadata.selected = variant.id === entity.image_asset?.selected_id;
    edges.push({ fromNodeId: configId, toNodeId: imageId });
  });
  const directResourceId = stringValue(entity.resource_id);
  if (!variants.length && directResourceId) {
    const imageId = stableStudioNodeId(projectId, kind, entity.id, "image-output-imported");
    nodes.push(node(projectId, kind, entity.id, "image-output-imported", "image", `${entity.name} · 形象`, 2312, y + 280, 320, 320, resourceMetadata(directResourceId, entity.image_url || "", groupId, kind, y + 2)));
    edges.push({ fromNodeId: configId, toNodeId: imageId });
  }
  const assetRows = Math.max(1, variants.length || (directResourceId ? 1 : 0));
  return { blockHeight: Math.max(710, 640 + (assetRows - 1) * 350) + 40 };
}

function addFrame(nodes: DesiredNode[], edges: Array<{ fromNodeId: string; toNodeId: string }>, projectId: string, groupId: string, artId: string, frame: StudioStoryboardFrame, y: number, state: StudioProjectState) {
  const promptId = stableStudioNodeId(projectId, "frame", frame.id, "prompt");
  nodes.push(node(projectId, "frame", frame.id, "prompt", "text", frame.title, 2848, y, 724, 260, {
    groupId, artifactType: "studio-storyboard-frame", stage: "storyboard", content: frame.prompt, studioEntitySnapshot: safeSnapshot(frame), shotId: frame.id, status: frame.status || "success", layoutSection: "prompt", layoutOrder: frame.order * 10,
  }));
  edges.push({ fromNodeId: artId, toNodeId: promptId });
  const imageConfigId = stableStudioNodeId(projectId, "frame", frame.id, "image-config");
  nodes.push(node(projectId, "frame", frame.id, "image-config", "config", `${frame.title} · 首帧`, 2848, y + 300, 340, 390, imageConfigMetadata(groupId, `${stylePrefix(state)}${frame.prompt}`, "frame", frame.order * 10 + 1, frame.id, state)));
  edges.push({ fromNodeId: promptId, toNodeId: imageConfigId });
  const visualContextConfigId = stableStudioNodeId(projectId, "frame", frame.id, "visual-context-config");
  nodes.push(node(projectId, "frame", frame.id, "visual-context-config", "config", `${frame.title} · 视觉上下文`, 3744, y, 340, 390, {
    groupId, artifactType: "studio-visual-context-config", stage: "storyboard", generationMode: "text", model: "glm-5v-turbo", composerContent: frame.prompt || "提取镜头素材的客观视觉上下文", count: 1, status: "idle", shotId: frame.id, layoutSection: "visual-context", layoutOrder: frame.order * 10 + 1,
  }));
  edges.push({ fromNodeId: promptId, toNodeId: visualContextConfigId });
  const revisionConfigId = stableStudioNodeId(projectId, "frame", frame.id, "prompt-revision-config");
  nodes.push(node(projectId, "frame", frame.id, "prompt-revision-config", "config", `${frame.title} · Prompt 返修`, 4560, y, 340, 390, {
    groupId, artifactType: "studio-shot-revision-config", stage: "storyboard", generationMode: "text", model: "glm-5.2", composerContent: frame.prompt || "等待返修输入", count: 1, status: "idle", shotId: frame.id, layoutSection: "prompt-revision", layoutOrder: frame.order * 10 + 2,
  }));
  edges.push({ fromNodeId: promptId, toNodeId: revisionConfigId });
  const imageVariants = frame.image_asset?.variants || [];
  let imageId: string | undefined;
  imageVariants.forEach((variant, index) => {
    const role = `image-output-${variant.id}`;
    const candidateId = stableStudioNodeId(projectId, "frame", frame.id, role);
    nodes.push(node(projectId, "frame", frame.id, role, "image", `${frame.title} · 首帧 ${index + 1}`, 3744, y + 430 + index * 360, 340, 320,
      variant.resource_id ? resourceMetadata(variant.resource_id, variant.url || "", groupId, "image", frame.order * 10 + 2 + index, frame.id) : pendingResourceMetadata(groupId, "image", frame.order * 10 + 2 + index, frame.id)));
    nodes[nodes.length - 1].metadata.selected = variant.id === frame.image_asset?.selected_id;
    edges.push({ fromNodeId: imageConfigId, toNodeId: candidateId });
    if (variant.id === frame.image_asset?.selected_id || !imageId) imageId = candidateId;
  });
  const directImageResourceId = stringValue(frame.image_resource_id);
  if (!imageVariants.length && directImageResourceId) {
    imageId = stableStudioNodeId(projectId, "frame", frame.id, "image-output-imported");
    nodes.push(node(projectId, "frame", frame.id, "image-output-imported", "image", `${frame.title} · 首帧`, 3744, y + 430, 340, 320, resourceMetadata(directImageResourceId, frame.image_url || "", groupId, "image", frame.order * 10 + 2, frame.id)));
    edges.push({ fromNodeId: imageConfigId, toNodeId: imageId });
  }
  const videoConfigId = stableStudioNodeId(projectId, "frame", frame.id, "video-config");
  nodes.push(node(projectId, "frame", frame.id, "video-config", "config", `${frame.title} · 视频`, 2848, y + 730, 340, 390, {
    ...managed(projectId, "frame", frame.id, "video-config"), groupId, artifactType: "studio-video-config", stage: "storyboard", generationMode: "video", model: "minimax-h3", composerContent: frame.prompt,
    seconds: Number(frame.duration) || 6, videoCount: 1, status: "idle", shotId: frame.id, layoutSection: "video", layoutOrder: frame.order * 10 + 3,
  }));
  edges.push({ fromNodeId: promptId, toNodeId: videoConfigId });
  if (imageId) edges.push({ fromNodeId: imageId, toNodeId: videoConfigId });
  const imageRows = Math.max(imageVariants.length, directImageResourceId ? 1 : 0);
  const imageBottom = imageRows ? 430 + (imageRows - 1) * 360 + 320 : 390;
  const frameTasks = state.videoTasks.filter((item) => item.frame_id === frame.id);
  const videoOutputY = y + Math.max(790, imageBottom + 40);
  for (const [index, task] of frameTasks.entries()) {
    const takeId = stableStudioNodeId(projectId, "take", task.id, "video-output");
    nodes.push(node(projectId, "take", task.id, "video-output", "video", `${frame.title} · 候选`, 3744, videoOutputY + index * 340, 340, 300, {
      ...(task.resource_id ? resourceMetadata(task.resource_id, task.video_url || "", groupId, "video", frame.order * 10 + 4, frame.id) : pendingResourceMetadata(groupId, "video", frame.order * 10 + 4, frame.id)), studioTaskSnapshot: safeSnapshot(task), selected: task.id === frame.selected_video_id || task.id === frame.selectedTakeId,
    }));
    edges.push({ fromNodeId: videoConfigId, toNodeId: takeId });
  }
  const audioOutputY = Math.max(y + 1160, videoOutputY + frameTasks.length * 340 + 40);
  if (frame.audio_resource_id) {
    const audioId = stableStudioNodeId(projectId, "audio", frame.id, "dialogue-output");
    nodes.push(node(projectId, "audio", frame.id, "dialogue-output", "audio", `${frame.title} · 配音`, 3744, audioOutputY, 340, 180, resourceMetadata(frame.audio_resource_id, frame.audio_url || "", groupId, "audio", frame.order * 10 + 5, frame.id)));
    edges.push({ fromNodeId: promptId, toNodeId: audioId });
  }
  const dialogue = frameDialogue(frame);
  const voiceId = frameVoice(state, frame);
  const audioConfigId = stableStudioNodeId(projectId, "audio", frame.id, "dialogue-config");
  nodes.push(node(projectId, "audio", frame.id, "dialogue-config", "config", `${frame.title} · 配音生成`, 2848, y + 1140, 340, 390, {
    groupId, artifactType: "studio-audio-config", stage: "storyboard", generationMode: "audio", model: "volc-speech", composerContent: dialogue || frame.prompt,
    audioVoice: voiceId, audioInstructions: String(frame.voice_instructions || ""), status: "idle", shotId: frame.id, layoutSection: "audio", layoutOrder: frame.order * 10 + 5,
  }));
  edges.push({ fromNodeId: promptId, toNodeId: audioConfigId });
  if (!frame.audio_resource_id && frame.audio_status === "queued") {
    const audioId = stableStudioNodeId(projectId, "audio", frame.id, "dialogue-output");
    nodes.push(node(projectId, "audio", frame.id, "dialogue-output", "audio", `${frame.title} · 配音`, 3744, audioOutputY, 340, 180, pendingResourceMetadata(groupId, "audio", frame.order * 10 + 6, frame.id)));
    edges.push({ fromNodeId: audioConfigId, toNodeId: audioId });
  } else if (frame.audio_resource_id) {
    const audioId = stableStudioNodeId(projectId, "audio", frame.id, "dialogue-output");
    edges.push({ fromNodeId: audioConfigId, toNodeId: audioId });
  }
  return Math.max(1630, audioOutputY - y + 260);
}

function group(projectId: string, entityType: StudioMappingEntityType, entityId: string, title: string, x: number, y: number, width: number, height: number): DesiredNode {
  return node(projectId, entityType, entityId, "stage-group", "group", title, x, y, width, height, { groupKind: "studio-stage", stage: entityId, layoutSection: "stage", layoutOrder: 0 });
}

function node(projectId: string, entityType: StudioMappingEntityType, entityId: string, role: string, type: string, title: string, x: number, y: number, width: number, height: number, metadata: Record<string, unknown>): DesiredNode {
  return { id: stableStudioNodeId(projectId, entityType, entityId, role), type, title, position: { x, y }, width, height, metadata: { ...managed(projectId, entityType, entityId, role), layoutManaged: true, ...metadata } };
}

function managed(_projectId: string, entityType: StudioMappingEntityType, entityId: string, role: string) {
  return { studioManaged: true as const, studioEntityType: entityType, studioEntityId: entityId, studioRole: role, studioMappingVersion: STUDIO_MAPPING_VERSION };
}

function imageConfigMetadata(groupId: string, prompt: string, section: string, order: number, shotId: string | undefined, state: StudioProjectState) {
  const settingKey = section === "character" ? "t2i_model" : section === "scene" ? "t2i_model" : section === "prop" ? "t2i_model" : "image_model";
  const requestedModel = String(state.modelSettings[settingKey] || state.modelSettings.image_model || models.image[0]);
  const model = models.image.includes(requestedModel) ? requestedModel : models.image[0];
  return { groupId, artifactType: "studio-image-config", stage: section === "frame" ? "storyboard" : "cast", generationMode: "image", model, requestedModel, composerContent: prompt, count: 1, size: "1024x1024", status: "idle", ...(shotId ? { shotId } : {}), layoutSection: "image", layoutOrder: order };
}

function resourceMetadata(resourceId: string, url: string, groupId: string, section: string, order: number, shotId?: string) {
  return { groupId, storageKey: resourceId, content: url || `/files/by-id/${resourceId}`, status: "success", generationState: "ready", layoutSection: section, layoutOrder: order, ...(shotId ? { shotId } : {}) };
}

function pendingResourceMetadata(groupId: string, section: string, order: number, shotId?: string) {
  return { groupId, status: "loading", generationState: "queued", layoutSection: section, layoutOrder: order, ...(shotId ? { shotId } : {}) };
}

function selectedFrameTask(state: StudioProjectState, frameId: string): StudioVideoTask | undefined {
  const frame = state.frames.find((item) => item.id === frameId);
  return state.videoTasks.find((task) => task.id === frame?.selected_video_id || task.id === frame?.selectedTakeId) || state.videoTasks.filter((task) => task.frame_id === frameId && task.resource_id).at(-1);
}
function stylePrefix(state: StudioProjectState) { return state.stylePrompt ? `${state.stylePrompt}\n` : state.artDirection?.style_config?.positive_prompt ? `${state.artDirection.style_config.positive_prompt}\n` : ""; }
function entityExtractionPrompt(state: StudioProjectState) {
  return JSON.stringify({ operation: "entity_extraction", script: state.originalText }, null, 2);
}
function artDirectionPrompt(state: StudioProjectState) {
  return JSON.stringify({ operation: "style_analysis", script: state.originalText }, null, 2);
}
function storyboardPrompt(state: StudioProjectState) {
  return JSON.stringify({ operation: "storyboard_extraction", artDirection: state.artDirection || state.stylePrompt || state.stylePreset || null, script: state.originalText }, null, 2);
}
function frameDialogue(frame: StudioStoryboardFrame) {
  if (typeof frame.dialogue === "string") return frame.dialogue;
  if (Array.isArray(frame.dialogue_structured)) return frame.dialogue_structured.map((item: any) => `${item?.speaker || ""}：${item?.line || ""}`).join("\n");
  return "";
}
function frameVoice(state: StudioProjectState, frame: StudioStoryboardFrame) {
  const explicit = String(frame.voice_id || "").trim();
  if (explicit) return explicit;
  const speaker = String((frame.dialogue_structured as any[])?.[0]?.speaker || frame.speaker || "").trim();
  return String(state.characters.find((character) => character.name === speaker)?.voice_id || "");
}
function stringValue(value: unknown) { const text = String(value || "").trim(); return text || undefined; }
function safeSnapshot(value: Record<string, unknown>) { const { image_asset: _image, video_assets: _videos, ...safe } = value; return safe; }
function edgeKey(edge: { fromNodeId: string; toNodeId: string; fromPort?: string; toPort?: string }) { return `${edge.fromNodeId}\0${edge.toNodeId}\0${edge.fromPort || "workflow-output"}\0${edge.toPort || "workflow-input"}`; }
