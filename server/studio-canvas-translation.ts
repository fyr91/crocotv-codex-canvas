import { randomUUID } from "node:crypto";
import { getStudioBackedProject, mutateStudioProject } from "./studio-commands";
import type { StudioBackedProject, StudioCanvasBinding, StudioNamedEntity, StudioProjectState } from "./studio-types";
import { readProject } from "./storage";

type StudioCanvasEdit =
  | { op: "update_node"; nodeId: string; content?: string; title?: string; metadata?: Record<string, unknown> }
  | { op: "delete_node"; nodeId: string }
  | { op: "connect"; fromNodeId: string; toNodeId: string; fromPort?: StudioCanvasBinding["fromPort"]; toPort?: StudioCanvasBinding["toPort"] }
  | { op: "disconnect"; connectionId: string };

export async function applyStudioCanvasEdits(projectId: string, rawEdits: unknown, options: { expectedVersion?: number; originClientId?: string } = {}) {
  const project = await getStudioBackedProject(projectId);
  const edits = parseEdits(rawEdits);
  await mutateStudioProject(projectId, (state) => translateStudioCanvasEdits(state, project, edits), { expectedVersion: options.expectedVersion, originClientId: options.originClientId || "canvas-studio-translation" });
  return readProject(projectId);
}

export function translateStudioCanvasEdits(state: StudioProjectState, project: StudioBackedProject, edits: StudioCanvasEdit[]) {
  let next = structuredClone(state);
  for (const edit of edits) {
    if (edit.op === "update_node") next = updateManagedNode(next, requiredManagedNode(project, edit.nodeId), edit);
    else if (edit.op === "delete_node") next = deleteManagedNode(next, project, requiredManagedNode(project, edit.nodeId));
    else if (edit.op === "connect") next = connectManagedNode(next, project, edit);
    else next = disconnectManagedNode(next, project, edit.connectionId);
  }
  return next;
}

function updateManagedNode(state: StudioProjectState, node: StudioBackedProject["nodes"][number], edit: Extract<StudioCanvasEdit, { op: "update_node" }>) {
  const role = String(node.metadata?.studioRole || "");
  const entityType = String(node.metadata?.studioEntityType || "");
  const entityId = String(node.metadata?.studioEntityId || "");
  const content = edit.content === undefined ? undefined : boundedText(edit.content);
  if (role === "source-text" && content !== undefined) return withNodeOverride({ ...state, originalText: content }, node.id, edit, ["content"]);
  if (role === "direction" && content !== undefined) return withNodeOverride({ ...state, artDirection: parseRecord(content, "艺术指导") as any }, node.id, edit, ["content"]);
  if (role === "timeline" && content !== undefined) {
    const value = parseRecord(content, "剪辑与混音");
    const orderedFrameIds = Array.isArray(value.orderedFrameIds) ? value.orderedFrameIds.map(String) : state.assembly.orderedFrameIds;
    if (orderedFrameIds.some((id) => !state.frames.some((frame) => frame.id === id))) throw new Error("剪辑顺序包含不存在的 Studio 镜头");
    return withNodeOverride({ ...state, assembly: { ...state.assembly, orderedFrameIds, ...(value.mixSettings && typeof value.mixSettings === "object" ? { mixSettings: value.mixSettings as Record<string, number> } : {}) } }, node.id, edit, ["content"]);
  }
  if (role === "description" && ["character", "scene", "prop"].includes(entityType)) {
    const key = entityCollection(entityType);
    return withNodeOverride({ ...state, [key]: state[key].map((entity) => entity.id === entityId ? { ...entity, ...(content === undefined ? {} : { description: content }), ...(edit.title ? { name: entityTitle(edit.title) } : {}) } : entity) }, node.id, edit, ["content"]);
  }
  if (role === "prompt" && entityType === "frame") {
    return withNodeOverride({ ...state, frames: state.frames.map((frame) => frame.id === entityId ? { ...frame, ...(content === undefined ? {} : { prompt: content }), ...(edit.title ? { title: boundedTitle(edit.title) } : {}) } : frame) }, node.id, edit, ["content"]);
  }
  if (["image-config", "video-config", "prompt-revision-config"].includes(role) && entityType === "frame") {
    const composerContent = edit.metadata?.composerContent;
    const seconds = Number(edit.metadata?.seconds);
    return withNodeOverride({ ...state, frames: state.frames.map((frame) => frame.id === entityId ? { ...frame, ...(typeof composerContent === "string" ? { prompt: boundedText(composerContent) } : {}), ...(Number.isInteger(seconds) && seconds >= 3 && seconds <= 15 ? { duration: seconds } : {}) } : frame) }, node.id, edit, ["composerContent", "seconds"]);
  }
  if ((edit.title !== undefined || edit.metadata !== undefined) && content === undefined) return withNodeOverride(state, node.id, edit);
  throw new Error(`该 Studio 托管节点不支持从 Canvas 修改：${role}`);
}

function deleteManagedNode(state: StudioProjectState, project: StudioBackedProject, node: StudioBackedProject["nodes"][number]) {
  const role = String(node.metadata?.studioRole || "");
  const entityType = String(node.metadata?.studioEntityType || "");
  const entityId = String(node.metadata?.studioEntityId || "");
  const removedNodeIds = new Set(project.nodes.filter((candidate) => candidate.metadata?.studioEntityType === entityType && candidate.metadata?.studioEntityId === entityId).map((candidate) => candidate.id));
  let next = state;
  if (role === "description" && ["character", "scene", "prop"].includes(entityType)) {
    const key = entityCollection(entityType);
    next = { ...state, [key]: state[key].filter((entity) => entity.id !== entityId) };
  } else if (role === "prompt" && entityType === "frame") {
    const frames = state.frames.filter((frame) => frame.id !== entityId).map((frame, order) => ({ ...frame, order }));
    next = { ...state, frames, videoTasks: state.videoTasks.filter((task) => task.frame_id !== entityId), assembly: { ...state.assembly, orderedFrameIds: frames.map((frame) => frame.id) } };
  } else if (role === "video-output" && entityType === "take") {
    next = { ...state, videoTasks: state.videoTasks.filter((task) => task.id !== entityId), frames: state.frames.map((frame) => frame.selectedTakeId === entityId || frame.selected_video_id === entityId ? { ...frame, selectedTakeId: undefined, selected_video_id: undefined } : frame) };
  } else if (role.startsWith("image-output-") && ["character", "scene", "prop", "frame"].includes(entityType)) {
    next = deleteImageVariant(state, entityType, entityId, role.slice("image-output-".length));
  } else {
    throw new Error(`该 Studio 托管节点不能直接删除：${role}`);
  }
  return {
    ...next,
    canvasBindings: next.canvasBindings.filter((binding) => !removedNodeIds.has(binding.fromNodeId) && !removedNodeIds.has(binding.toNodeId)),
    canvasNodeOverrides: next.canvasNodeOverrides.filter((override) => !removedNodeIds.has(override.nodeId)),
  };
}

function connectManagedNode(state: StudioProjectState, project: StudioBackedProject, edit: Extract<StudioCanvasEdit, { op: "connect" }>) {
  const from = requiredNode(project, edit.fromNodeId);
  const to = requiredNode(project, edit.toNodeId);
  if (from.metadata?.studioManaged !== true && to.metadata?.studioManaged !== true) throw new Error("自由 Canvas 节点连接不需要 Studio 转换");
  if ([from, to].some((node) => node.metadata?.studioRole === "stage-group")) throw new Error("Studio 阶段容器不能建立业务连接");
  if (project.connections.some((connection) => connection.fromNodeId === from.id && connection.toNodeId === to.id && (connection.fromPort || "workflow-output") === (edit.fromPort || "workflow-output") && (connection.toPort || "workflow-input") === (edit.toPort || "workflow-input"))) throw new Error("连接已存在");
  const binding: StudioCanvasBinding = { id: randomUUID(), fromNodeId: from.id, toNodeId: to.id, ...(edit.fromPort ? { fromPort: edit.fromPort } : {}), ...(edit.toPort ? { toPort: edit.toPort } : {}) };
  return { ...state, canvasBindings: [...state.canvasBindings, binding] };
}

function disconnectManagedNode(state: StudioProjectState, project: StudioBackedProject, connectionId: string) {
  const connection = project.connections.find((item) => item.id === connectionId);
  if (!connection) throw new Error("连接不存在");
  const binding = state.canvasBindings.find((item) => item.fromNodeId === connection.fromNodeId && item.toNodeId === connection.toNodeId && (item.fromPort || "") === (connection.fromPort || "") && (item.toPort || "") === (connection.toPort || ""));
  if (!binding) throw new Error("Studio 基础流程连接不能直接断开；请修改对应的 Studio 内容或选择");
  return { ...state, canvasBindings: state.canvasBindings.filter((item) => item.id !== binding.id) };
}

function deleteImageVariant(state: StudioProjectState, entityType: string, entityId: string, variantId: string) {
  if (entityType === "frame") return { ...state, frames: state.frames.map((frame) => frame.id === entityId ? { ...frame, image_asset: removeVariant(frame.image_asset, variantId), image_url: frame.image_asset?.selected_id === variantId ? undefined : frame.image_url } : frame) };
  const key = entityCollection(entityType);
  return { ...state, [key]: state[key].map((entity) => entity.id === entityId ? { ...entity, image_asset: removeVariant(entity.image_asset, variantId), image_url: entity.image_asset?.selected_id === variantId ? undefined : entity.image_url } : entity) };
}

function removeVariant(asset: StudioNamedEntity["image_asset"], variantId: string) {
  if (!asset) return undefined;
  const variants = asset.variants.filter((variant) => variant.id !== variantId);
  return { ...asset, variants, selected_id: asset.selected_id === variantId ? variants[0]?.id || null : asset.selected_id };
}

function parseEdits(value: unknown): StudioCanvasEdit[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error("Studio Canvas edits 必须包含 1–100 个操作");
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Studio Canvas edit 格式无效");
    const edit = raw as Record<string, any>;
    if (edit.op === "update_node") return { op: edit.op, nodeId: boundedId(edit.nodeId), ...(edit.content === undefined ? {} : { content: boundedText(edit.content) }), ...(edit.title === undefined ? {} : { title: boundedTitle(edit.title) }), ...(edit.metadata && typeof edit.metadata === "object" && !Array.isArray(edit.metadata) ? { metadata: edit.metadata } : {}) };
    if (edit.op === "delete_node") return { op: edit.op, nodeId: boundedId(edit.nodeId) };
    if (edit.op === "connect") return { op: edit.op, fromNodeId: boundedId(edit.fromNodeId), toNodeId: boundedId(edit.toNodeId), ...(validPort(edit.fromPort) ? { fromPort: edit.fromPort } : {}), ...(validPort(edit.toPort) ? { toPort: edit.toPort } : {}) };
    if (edit.op === "disconnect") return { op: edit.op, connectionId: boundedId(edit.connectionId) };
    throw new Error(`不支持的 Studio Canvas edit：${edit.op}`);
  });
}

function requiredManagedNode(project: StudioBackedProject, nodeId: string) { const node = requiredNode(project, nodeId); if (node.metadata?.studioManaged !== true) throw new Error("目标不是 Studio 托管节点"); return node; }
function requiredNode(project: StudioBackedProject, nodeId: string) { const node = project.nodes.find((item) => item.id === nodeId); if (!node) throw new Error(`节点不存在：${nodeId}`); return node; }
function entityCollection(value: string): "characters" | "scenes" | "props" { if (value === "character") return "characters"; if (value === "scene") return "scenes"; if (value === "prop") return "props"; throw new Error(`不支持的 Studio 实体类型：${value}`); }
function parseRecord(value: string, label: string) { try { const parsed = JSON.parse(value); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>; } catch {} throw new Error(`${label}必须是有效的 JSON 对象`); }
function entityTitle(value: string) { return boundedTitle(value).replace(/^(?:角色|场景|道具)\s*·\s*/, "") || "未命名"; }
function boundedId(value: unknown) { const id = String(value || "").trim(); if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("Studio Canvas edit ID 无效"); return id; }
function boundedTitle(value: unknown) { return String(value || "").trim().slice(0, 180); }
function boundedText(value: unknown) { const text = String(value ?? ""); if (text.length > 1_000_000) throw new Error("Studio Canvas edit 内容过长"); return text; }
function validPort(value: unknown): value is NonNullable<StudioCanvasBinding["fromPort"]> { return value === "node" || value === "workflow-input" || value === "workflow-output"; }

const editableConfigMetadata = new Set([
  "model", "size", "count", "seconds", "vquality", "videoCount", "videoInputMode", "videoReferenceSizePolicy",
  "videoFirstFrameNodeId", "videoLastFrameNodeId", "videoEditSourceNodeId", "videoReferenceImageNodeIds", "videoAudioSetting",
  "returnLastFrame", "videoPromptEnhance", "videoStage1Review", "audioVoice", "audioFormat", "audioSpeed", "audioVolume",
  "audioPitch", "audioInstructions", "composerContent", "optimizePrompt", "imageWebSearch", "imageSearch", "webSearch",
]);

function withNodeOverride(state: StudioProjectState, nodeId: string, edit: Extract<StudioCanvasEdit, { op: "update_node" }>, consumedMetadata: string[] = []) {
  const consumed = new Set(consumedMetadata);
  const metadata = Object.fromEntries(Object.entries(edit.metadata || {}).filter(([key]) => editableConfigMetadata.has(key) && !consumed.has(key)));
  const existing = state.canvasNodeOverrides.find((override) => override.nodeId === nodeId);
  const title = edit.title === undefined ? existing?.title : boundedTitle(edit.title) || existing?.title;
  const nextMetadata = { ...(existing?.metadata || {}), ...metadata };
  if (!title && !Object.keys(nextMetadata).length) return state;
  const override = { nodeId, ...(title ? { title } : {}), metadata: nextMetadata };
  return { ...state, canvasNodeOverrides: [...state.canvasNodeOverrides.filter((item) => item.nodeId !== nodeId), override] };
}
