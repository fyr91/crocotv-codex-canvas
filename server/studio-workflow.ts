import { randomUUID } from "node:crypto";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { publishProjectUpdated } from "./canvas-events";
import { runCanvasConfigNodes } from "./canvas-node-runtime";
import { dubCanvasVideo, mergeCanvasVideos, useCanvasVideoFrames } from "./canvas-video-tools";
import { stableStudioNodeId } from "./studio-canvas-mapping";
import { avoidStudioNodeOverlaps } from "./studio-node-placement";
import { getStudioBackedProject, listStudioProjectResponses, mutateStudioProject } from "./studio-commands";
import type { StudioImageAsset, StudioImageVariant, StudioNamedEntity, StudioProjectState, StudioStoryboardFrame, StudioVideoTask } from "./studio-types";
import { models } from "./providers";
import { readProject, resourceById } from "./storage";
import { executeStudioPrompt, type StudioPromptOperation } from "./studio-prompt-runtime";
import { createStudioGenerationJob } from "./studio-generation-jobs";
import type { TextThinkingMode } from "./providers";

type EntityKind = "character" | "scene" | "prop";
const ENTITY_EXTRACTION_MODEL = "deepseek-v4-flash-ga-260731";
const ENTITY_EXTRACTION_THINKING: TextThinkingMode = "disabled";

export async function recoverInterruptedStudioGenerations() {
  for (const summary of await listStudioProjectResponses()) {
    const project = await getStudioBackedProject(summary.id);
    const playground = objectValue(project.studio.metadata.playground);
    const history = Array.isArray(playground.history) ? playground.history as Array<Record<string, any>> : [];
    const hasInterrupted = [...project.studio.characters, ...project.studio.scenes, ...project.studio.props].some((entity) => entity.status === "generating")
      || project.studio.videoTasks.some((task) => task.status === "pending" || task.status === "processing")
      || history.some((entry) => entry.status === "pending" || entry.status === "processing");
    if (!hasInterrupted) continue;
    await mutateStudioProject(project.id, (state) => {
      const failEntity = (entity: StudioNamedEntity) => entity.status === "generating"
        ? { ...entity, status: "failed", generation_job_id: undefined }
        : entity;
      const currentPlayground = objectValue(state.metadata.playground);
      const currentHistory = Array.isArray(currentPlayground.history) ? currentPlayground.history as Array<Record<string, any>> : [];
      return {
        ...state,
        characters: state.characters.map(failEntity),
        scenes: state.scenes.map(failEntity),
        props: state.props.map(failEntity),
        videoTasks: state.videoTasks.map((task) => task.status === "pending" || task.status === "processing" ? { ...task, status: "failed", error: "本地服务重启，生成任务已中断" } : task),
        metadata: {
          ...state.metadata,
          playground: {
            ...currentPlayground,
            history: currentHistory.map((entry) => entry.status === "pending" || entry.status === "processing" ? { ...entry, status: "failed", error: "本地服务重启，生成任务已中断" } : entry),
          },
        },
      };
    }, { originClientId: "studio-generation-recovery" });
  }
}

export async function extractStudioEntities(projectId: string, text: string, originClientId: string) {
  await mutateStudioProject(projectId, (state) => ({ ...state, originalText: text }), { originClientId });
  const configId = stableStudioNodeId(projectId, "script", projectId, "entity-analysis-config");
  const parsed = await runStudioPromptJson({ projectId, configId, operation: "entity_extraction", draftPrompt: text, requestedModel: ENTITY_EXTRACTION_MODEL, thinking: ENTITY_EXTRACTION_THINKING, originClientId });
  return mutateStudioProject(projectId, (state) => ({
    ...state,
    characters: normalizeEntities(parsed.characters),
    scenes: normalizeEntities(parsed.scenes),
    props: normalizeEntities(parsed.props),
  }), { originClientId });
}

export async function previewStudioEntities(projectId: string, text: string, originClientId: string) {
  const configId = stableStudioNodeId(projectId, "script", projectId, "entity-analysis-config");
  const parsed = await runStudioPromptJson({ projectId, configId, operation: "entity_extraction", draftPrompt: text, requestedModel: ENTITY_EXTRACTION_MODEL, thinking: ENTITY_EXTRACTION_THINKING, originClientId });
  return { characters: normalizeEntities(parsed.characters), scenes: normalizeEntities(parsed.scenes), props: normalizeEntities(parsed.props) };
}

export async function applyStudioEntityExtraction(projectId: string, text: string, extraction: unknown, originClientId: string) {
  const parsed = objectValue(extraction);
  if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.scenes) || !Array.isArray(parsed.props)) throw new Error("实体提取结果必须包含 characters、scenes 和 props 数组");
  return mutateStudioProject(projectId, (state) => ({
    ...state,
    originalText: text,
    characters: normalizeEntities(parsed.characters),
    scenes: normalizeEntities(parsed.scenes),
    props: normalizeEntities(parsed.props),
  }), { originClientId });
}

export async function analyzeStudioArtDirection(projectId: string, text: string, originClientId: string) {
  const configId = stableStudioNodeId(projectId, "art-direction", projectId, "analysis-config");
  const parsed = await runStudioPromptJson({ projectId, configId, operation: "style_analysis", draftPrompt: text, originClientId });
  const candidates = Array.isArray(parsed.options) ? parsed.options : parsed.recommendations;
  const recommendations = Array.isArray(candidates) ? candidates.map((item, index) => normalizeStyle(item, index)) : [];
  return { recommendations };
}

export async function saveStudioArtDirection(projectId: string, raw: any, originClientId: string) {
  return mutateStudioProject(projectId, (state) => ({ ...state, artDirection: {
    selected_style_id: String(raw?.selected_style_id || "custom"),
    style_config: objectValue(raw?.style_config),
    custom_styles: arrayRecords(raw?.custom_styles),
    ai_recommendations: arrayRecords(raw?.ai_recommendations),
  } }), { originClientId });
}

export async function clearStudioArtDirection(projectId: string, originClientId: string) {
  return mutateStudioProject(projectId, (state) => { const { artDirection: _removed, ...rest } = state; return rest as StudioProjectState; }, { originClientId });
}

export async function createStudioEntity(projectId: string, kind: EntityKind, raw: any, originClientId: string) {
  const entity = normalizeEntity(raw);
  return mutateStudioProject(projectId, (state) => {
    const key = entityCollection(kind);
    return { ...state, [key]: [...state[key], entity] };
  }, { originClientId });
}

export async function deleteStudioEntity(projectId: string, kind: EntityKind, entityId: string, originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const key = entityCollection(kind);
    return { ...state, [key]: state[key].filter((entity) => entity.id !== entityId) };
  }, { originClientId });
}

export async function patchStudioEntity(projectId: string, kind: EntityKind, entityId: string, patch: Record<string, unknown>, originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const key = entityCollection(kind);
    if (!state[key].some((entity) => entity.id === entityId)) throw new Error(`${kind} 不存在：${entityId}`);
    return { ...state, [key]: state[key].map((entity) => entity.id === entityId ? { ...entity, ...patch, id: entity.id, name: String(patch.name || entity.name), description: String(patch.description ?? entity.description) } : entity) };
  }, { originClientId });
}

export async function toggleStudioEntityFlag(projectId: string, kind: EntityKind, entityId: string, flag: "locked" | "starred", originClientId: string) {
  const project = await getStudioBackedProject(projectId);
  const entity = project.studio[entityCollection(kind)].find((item) => item.id === entityId);
  if (!entity) throw new Error(`${kind} 不存在：${entityId}`);
  return patchStudioEntity(projectId, kind, entityId, { [flag]: !entity[flag] }, originClientId);
}

export async function generateStudioAsset(projectId: string, raw: any, originClientId: string) {
  const prepared = await prepareStudioAssetGeneration(projectId, raw, originClientId);
  return executeStudioAssetGeneration(prepared, originClientId);
}

export async function queueStudioAssetGeneration(projectId: string, raw: any, originClientId: string) {
  const jobId = randomUUID();
  const prepared = await prepareStudioAssetGeneration(projectId, raw, originClientId, jobId);
  const job = await createStudioGenerationJob({
    id: jobId,
    projectId,
    operation: "asset-image",
    metadata: { assetId: prepared.entityId, assetType: prepared.kind },
    execute: async ({ signal }) => {
      await executeStudioAssetGeneration(prepared, originClientId, signal);
      return { assetId: prepared.entityId, assetType: prepared.kind };
    },
  });
  return { ...prepared.response, _task_id: job.jobId, _generation_job: job };
}

async function prepareStudioAssetGeneration(projectId: string, raw: any, originClientId: string, generationJobId?: string) {
  const kind = normalizeEntityKind(raw?.asset_type);
  const entityId = requiredId(raw?.asset_id, "资产 ID");
  const initial = await getStudioBackedProject(projectId);
  const sourceEntity = requiredEntity(initial.studio[entityCollection(kind)], entityId);
  const resolvedPrompt = String(raw?.prompt || raw?.style_prompt || sourceEntity.description || sourceEntity.name);
  const count = boundedCount(raw?.batch_size);
  const variants: StudioImageVariant[] = Array.from({ length: count }, () => ({ id: randomUUID(), url: "", created_at: Date.now() / 1000, prompt_used: resolvedPrompt }));
  const response = await mutateStudioProject(projectId, (state) => {
    const key = entityCollection(kind);
    const entity = requiredEntity(state[key], entityId);
    const imageAsset: StudioImageAsset = { selected_id: variants[0].id, variants: [...(entity.image_asset?.variants || []), ...variants] };
    return { ...state, [key]: state[key].map((item) => item.id === entityId ? { ...item, image_asset: imageAsset, status: "generating", ...(generationJobId ? { generation_job_id: generationJobId } : {}) } : item) };
  }, { originClientId });
  const configId = stableStudioNodeId(projectId, kind, entityId, "image-config");
  const outputIds = variants.map((variant) => stableStudioNodeId(projectId, kind, entityId, `image-output-${variant.id}`));
  try {
    await configureNode(projectId, configId, {
      composerContent: resolvedPrompt,
      model: resolveImageModel(raw?.model_name), count,
      size: aspectSize(String(raw?.aspect_ratio || "1:1")),
    }, originClientId);
  } catch (error) {
    await mutateStudioProject(projectId, (state) => { const key = entityCollection(kind); return { ...state, [key]: state[key].map((entity) => entity.id === entityId ? { ...entity, status: "failed", generation_job_id: undefined } : entity) }; }, { originClientId }).catch(() => undefined);
    throw error;
  }
  return { projectId, kind, entityId, variants, configId, outputIds, response };
}

async function executeStudioAssetGeneration(prepared: Awaited<ReturnType<typeof prepareStudioAssetGeneration>>, originClientId: string, signal?: AbortSignal) {
  const { projectId, kind, entityId, variants, configId, outputIds } = prepared;
  try { await runTargets(projectId, configId, outputIds, originClientId, signal); }
  catch (error) { await mutateStudioProject(projectId, (state) => { const key = entityCollection(kind); return { ...state, [key]: state[key].map((entity) => entity.id === entityId ? { ...entity, status: "failed", generation_job_id: undefined } : entity) }; }, { originClientId }).catch(() => undefined); throw error; }
  const results = await outputResources(projectId, outputIds);
  const response = await mutateStudioProject(projectId, (state) => {
    const key = entityCollection(kind);
    return { ...state, [key]: state[key].map((entity) => entity.id === entityId ? {
      ...entity, status: results.some((result) => !result.resourceId) ? "failed" : "ready", generation_job_id: undefined,
      image_url: results.find((result) => result.resourceId)?.url || entity.image_url,
      image_asset: { selected_id: results.find((result) => result.resourceId)?.variantId || variants[0].id, variants: (entity.image_asset?.variants || []).map((variant) => {
        const result = results.find((item) => item.variantId === variant.id);
        return result?.resourceId ? { ...variant, resource_id: result.resourceId, url: result.url || "" } : variant;
      }) },
    } : entity) };
  }, { originClientId });
  if (results.some((result) => !result.resourceId)) throw new Error("Studio 资产图片没有生成完整的本地资源");
  return response;
}

export async function analyzeStudioStoryboard(projectId: string, text: string, originClientId: string) {
  const configId = stableStudioNodeId(projectId, "frame", projectId, "analysis-config");
  const parsed = await runStudioPromptJson({ projectId, configId, operation: "storyboard_extraction", draftPrompt: text, originClientId });
  const frames = normalizeFrames(parsed.frames || parsed.shots);
  return mutateStudioProject(projectId, (state) => ({ ...state, originalText: text || state.originalText, frames, assembly: { ...state.assembly, orderedFrameIds: frames.map((frame) => frame.id) } }), { originClientId });
}

export async function createStudioFrame(projectId: string, raw: any, originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const frame = normalizeFrame(raw, state.frames.length);
    const frames = [...state.frames, frame].map((item, order) => ({ ...item, order }));
    return { ...state, frames, assembly: { ...state.assembly, orderedFrameIds: frames.map((item) => item.id) } };
  }, { originClientId });
}

export async function replaceStudioStoryboard(projectId: string, rawFrames: unknown, originClientId: string) {
  const frames = normalizeFrames(rawFrames);
  return mutateStudioProject(projectId, (state) => ({
    ...state,
    frames,
    videoTasks: state.videoTasks.filter((task) => frames.some((frame) => frame.id === task.frame_id)),
    assembly: { ...state.assembly, orderedFrameIds: frames.map((frame) => frame.id) },
  }), { originClientId });
}

export async function patchStudioFrame(projectId: string, frameId: string, raw: any, originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const current = requiredFrame(state, frameId);
    const patch = { ...raw, prompt: String(raw?.prompt ?? raw?.image_prompt ?? current.prompt), title: String(raw?.title || current.title) };
    if (raw?.workbench_generate_count != null) patch.workbench_generate_count = boundedCount(raw.workbench_generate_count);
    return { ...state, frames: state.frames.map((frame) => frame.id === frameId ? { ...frame, ...patch, id: frame.id, order: frame.order } : frame) };
  }, { originClientId });
}

export async function deleteStudioFrame(projectId: string, frameId: string, originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const frames = state.frames.filter((frame) => frame.id !== frameId).map((frame, order) => ({ ...frame, order }));
    return { ...state, frames, videoTasks: state.videoTasks.filter((task) => task.frame_id !== frameId), assembly: { ...state.assembly, orderedFrameIds: frames.map((frame) => frame.id) } };
  }, { originClientId });
}

export async function copyStudioFrame(projectId: string, frameId: string, insertAt: number | undefined, originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const source = requiredFrame(state, frameId);
    const copy = { ...structuredClone(source), id: randomUUID(), title: `${source.title} 副本`, image_asset: undefined, selected_video_id: undefined, selectedTakeId: undefined };
    const frames = [...state.frames];
    frames.splice(Number.isInteger(insertAt) ? Math.max(0, Math.min(frames.length, Number(insertAt))) : source.order + 1, 0, copy);
    const ordered = frames.map((frame, order) => ({ ...frame, order }));
    return { ...state, frames: ordered, assembly: { ...state.assembly, orderedFrameIds: ordered.map((frame) => frame.id) } };
  }, { originClientId });
}

export async function reorderStudioFrames(projectId: string, frameIds: string[], originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const byId = new Map(state.frames.map((frame) => [frame.id, frame]));
    if (frameIds.length !== state.frames.length || frameIds.some((id) => !byId.has(id))) throw new Error("分镜排序必须包含全部镜头 ID");
    const frames = frameIds.map((id, order) => ({ ...byId.get(id)!, order }));
    return { ...state, frames, assembly: { ...state.assembly, orderedFrameIds: frameIds } };
  }, { originClientId });
}

export async function renderStudioFrame(projectId: string, raw: any, originClientId: string) {
  const frameId = requiredId(raw?.frame_id, "镜头 ID");
  const count = boundedCount(raw?.batch_size);
  const variants: StudioImageVariant[] = Array.from({ length: count }, () => ({ id: randomUUID(), url: "", created_at: Date.now() / 1000, prompt_used: String(raw?.prompt || "") }));
  await mutateStudioProject(projectId, (state) => {
    const frame = requiredFrame(state, frameId);
    return { ...state, frames: state.frames.map((item) => item.id === frameId ? { ...item, prompt: String(raw?.prompt || frame.prompt), status: "generating", image_asset: { selected_id: variants[0].id, variants: [...(frame.image_asset?.variants || []), ...variants] } } : item) };
  }, { originClientId });
  const configId = stableStudioNodeId(projectId, "frame", frameId, "image-config");
  const outputIds = variants.map((variant) => stableStudioNodeId(projectId, "frame", frameId, `image-output-${variant.id}`));
  await configureNode(projectId, configId, { composerContent: String(raw?.prompt || ""), count }, originClientId);
  try { await runTargets(projectId, configId, outputIds, originClientId); }
  catch (error) { await patchStudioFrame(projectId, frameId, { status: "failed" }, originClientId).catch(() => undefined); throw error; }
  const results = await outputResources(projectId, outputIds);
  return mutateStudioProject(projectId, (state) => ({ ...state, frames: state.frames.map((frame) => frame.id === frameId ? {
    ...frame, status: results.some((item) => !item.resourceId) ? "failed" : "ready", image_url: results.find((item) => item.resourceId)?.url || frame.image_url,
    image_asset: { selected_id: results.find((item) => item.resourceId)?.variantId || variants[0].id, variants: (frame.image_asset?.variants || []).map((variant) => {
      const result = results.find((item) => item.variantId === variant.id); return result?.resourceId ? { ...variant, resource_id: result.resourceId, url: result.url || "" } : variant;
    }) },
  } : frame) }), { originClientId });
}

export async function createStudioVideoTasks(projectId: string, raw: any, originClientId: string) {
  const prepared = await prepareStudioVideoTasks(projectId, raw, originClientId);
  return executeStudioVideoTasks(prepared, originClientId);
}

export async function queueStudioVideoTasks(projectId: string, raw: any, originClientId: string) {
  const jobId = randomUUID();
  const prepared = await prepareStudioVideoTasks(projectId, raw, originClientId, jobId);
  const job = await createStudioGenerationJob({
    id: jobId,
    projectId,
    operation: "frame-video",
    metadata: { frameId: prepared.frameId, taskIds: prepared.tasks.map((task) => task.id) },
    execute: async ({ signal }) => {
      await executeStudioVideoTasks(prepared, originClientId, signal);
      return { frameId: prepared.frameId, taskIds: prepared.tasks.map((task) => task.id) };
    },
  });
  return { tasks: prepared.tasks, job };
}

async function prepareStudioVideoTasks(projectId: string, raw: any, originClientId: string, generationJobId?: string) {
  const frameId = requiredId(raw?.frame_id, "镜头 ID");
  const initial = await getStudioBackedProject(projectId);
  const sourceFrame = requiredFrame(initial.studio, frameId);
  const resolvedPrompt = String(raw?.prompt || sourceFrame.prompt);
  const generationMode = String(raw?.generation_mode || "i2v").toLowerCase();
  const videoInputs = await resolveStudioVideoInputs(sourceFrame, raw, generationMode);
  const count = boundedCount(raw?.batch_size);
  const tasks: StudioVideoTask[] = Array.from({ length: count }, () => ({
    id: randomUUID(), project_id: projectId, frame_id: frameId, image_url: String(raw?.image_url || sourceFrame.image_url || ""), prompt: resolvedPrompt, status: "processing", created_at: Date.now() / 1000,
    duration: Number(raw?.duration) || 6, model: String(raw?.model || "minimax-h3"), generation_mode: generationMode, workbench_tab: raw?.workbench_tab,
    reference_resource_ids: videoInputs.map((input) => input.resourceId),
    ...(generationJobId ? { generation_job_id: generationJobId } : {}),
  }));
  await mutateStudioProject(projectId, (state) => { requiredFrame(state, frameId); return { ...state, videoTasks: [...state.videoTasks, ...tasks] }; }, { originClientId });
  const configId = stableStudioNodeId(projectId, "frame", frameId, "video-config");
  const outputIds = tasks.map((task) => stableStudioNodeId(projectId, "take", task.id, "video-output"));
  try {
    await configureStudioVideoNode(projectId, configId, frameId, resolvedPrompt, generationMode, videoInputs, { seconds: Number(raw?.duration) || 6, videoCount: count, vquality: String(raw?.resolution || "preview"), videoPromptEnhance: raw?.prompt_extend === false ? "false" : "true" }, originClientId);
  } catch (error) {
    await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: state.videoTasks.map((task) => tasks.some((created) => created.id === task.id) ? { ...task, status: "failed", error: error instanceof Error ? error.message : "生成任务准备失败" } : task) }), { originClientId }).catch(() => undefined);
    throw error;
  }
  return { projectId, frameId, tasks, configId, outputIds };
}

async function executeStudioVideoTasks(prepared: Awaited<ReturnType<typeof prepareStudioVideoTasks>>, originClientId: string, signal?: AbortSignal) {
  const { projectId, frameId, tasks, configId, outputIds } = prepared;
  try { await runTargets(projectId, configId, outputIds, originClientId, signal); }
  catch (error) { await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: state.videoTasks.map((task) => tasks.some((created) => created.id === task.id) ? { ...task, status: "failed", error: error instanceof Error ? error.message : "生成失败" } : task) }), { originClientId }).catch(() => undefined); throw error; }
  const results = await outputResources(projectId, outputIds, tasks.map((task) => task.id));
  const response = await mutateStudioProject(projectId, (state) => ({ ...state,
    videoTasks: state.videoTasks.map((task) => {
      const result = results.find((item) => item.variantId === task.id); return result ? { ...task, status: result.resourceId ? "completed" : "failed", resource_id: result.resourceId, video_url: result.url } : task;
    }),
    frames: state.frames.map((frame) => frame.id === frameId ? { ...frame, selected_video_id: results.find((item) => item.resourceId)?.variantId || frame.selected_video_id } : frame),
  }), { originClientId });
  if (results.some((result) => !result.resourceId)) throw new Error("Studio 视频任务没有生成完整的本地资源");
  return response;
}

export async function selectStudioVideo(projectId: string, frameId: string, videoId: string | undefined, originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const candidates = state.videoTasks.filter((task) => task.frame_id === frameId && task.status === "completed");
    const selected = videoId ? candidates.find((task) => task.id === videoId) : candidates.at(-1);
    if (videoId && !selected) throw new Error(`视频候选不存在：${videoId}`);
    return { ...state, frames: state.frames.map((frame) => frame.id === frameId ? { ...frame, selected_video_id: selected?.id, selectedTakeId: selected?.id, video_url: selected?.video_url, video_pinned: Boolean(videoId) } : frame) };
  }, { originClientId });
}

export async function generateStudioFrameAudio(projectId: string, frameId: string, raw: any, originClientId: string) {
  await mutateStudioProject(projectId, (state) => ({ ...state, frames: state.frames.map((frame) => frame.id === frameId ? { ...frame, audio_status: "queued", voice_instructions: raw?.instructions ?? frame.voice_instructions } : frame) }), { originClientId });
  const configId = stableStudioNodeId(projectId, "audio", frameId, "dialogue-config");
  const outputId = stableStudioNodeId(projectId, "audio", frameId, "dialogue-output");
  try { await runTargets(projectId, configId, [outputId], originClientId); }
  catch (error) { await patchStudioFrame(projectId, frameId, { audio_status: "failed" }, originClientId).catch(() => undefined); throw error; }
  const [result] = await outputResources(projectId, [outputId], [frameId]);
  return mutateStudioProject(projectId, (state) => ({ ...state, frames: state.frames.map((frame) => frame.id === frameId ? { ...frame, audio_status: result?.resourceId ? "ready" : "failed", audio_resource_id: result?.resourceId, audio_url: result?.url } : frame) }), { originClientId });
}

export async function mergeStudioProject(projectId: string, originClientId: string) {
  const project = await getStudioBackedProject(projectId);
  const videoNodeIds = project.studio.assembly.orderedFrameIds.flatMap((frameId) => {
    const frame = project.studio.frames.find((item) => item.id === frameId);
    const task = project.studio.videoTasks.find((item) => item.id === frame?.selected_video_id || item.id === frame?.selectedTakeId);
    return task?.resource_id ? [stableStudioNodeId(projectId, "take", task.id, "video-output")] : [];
  });
  const merged = await mergeCanvasVideos({
    projectId,
    videoNodeIds,
    title: `${project.title} · 合片`,
    requireVerification: false,
    bgmResourceId: project.studio.assembly.bgmResourceId,
    dialogueVolume: project.studio.assembly.mixSettings?.dialogue,
    bgmVolume: project.studio.assembly.mixSettings?.bgm,
    originClientId,
  });
  const canvas = await readProject(projectId) as any;
  const node = canvas.nodes.find((item: any) => item.id === merged.nodeId);
  return mutateStudioProject(projectId, (state) => ({ ...state, assembly: { ...state.assembly, mergedVideoNodeId: merged.nodeId, mergedVideoResourceId: merged.resourceId, mergedVideoUrl: String(node?.metadata?.content || `/files/by-id/${merged.resourceId}`) } }), { originClientId });
}

export async function generateStudioAssetVideo(projectId: string, raw: any, originClientId: string) {
  const prepared = await prepareStudioAssetVideo(projectId, raw, originClientId);
  return executeStudioAssetVideo(prepared, originClientId);
}

export async function queueStudioAssetVideo(projectId: string, raw: any, originClientId: string) {
  const taskId = randomUUID();
  const prepared = await prepareStudioAssetVideo(projectId, raw, originClientId, taskId, taskId);
  const job = await createStudioGenerationJob({
    id: taskId,
    projectId,
    operation: "asset-video",
    metadata: { assetId: prepared.entityId, assetType: prepared.kind, taskId },
    execute: async ({ signal }) => {
      await executeStudioAssetVideo(prepared, originClientId, signal);
      return { assetId: prepared.entityId, assetType: prepared.kind, taskId };
    },
  });
  return { ...prepared.response, _task_id: taskId, _generation_job: job };
}

async function prepareStudioAssetVideo(projectId: string, raw: any, originClientId: string, requestedTaskId?: string, generationJobId?: string) {
  const kind = normalizeEntityKind(raw?.asset_type);
  const entityId = requiredId(raw?.asset_id, "资产 ID");
  const initial = await getStudioBackedProject(projectId);
  const entity = requiredEntity(initial.studio[entityCollection(kind)], entityId);
  const selectedVariant = entity.image_asset?.variants.find((variant) => variant.id === entity.image_asset?.selected_id)
    || entity.image_asset?.variants.find((variant) => variant.resource_id)
    || entity.image_asset?.variants.at(-1);
  const imageNodeId = selectedVariant
    ? stableStudioNodeId(projectId, kind, entityId, `image-output-${selectedVariant.id}`)
    : entity.resource_id
      ? stableStudioNodeId(projectId, kind, entityId, "image-output-imported")
      : "";
  if (!imageNodeId) throw new Error("资产尚无可用于视频生成的本地图片");
  const task: StudioVideoTask = {
    id: requestedTaskId || randomUUID(), project_id: projectId, asset_id: entityId, asset_type: kind,
    status: "processing", prompt: String(raw?.prompt || entity.description || entity.name), image_url: String(selectedVariant?.url || entity.image_url || ""),
    created_at: Date.now() / 1000, duration: Number(raw?.duration) || 5, model: "minimax-h3", generation_mode: "i2v",
    ...(generationJobId ? { generation_job_id: generationJobId } : {}),
  };
  const response = await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: [...state.videoTasks, task] }), { originClientId });
  const project = await readProject(projectId) as any;
  if (!project.nodes.some((node: any) => node.id === imageNodeId && node.type === "image")) {
    await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: state.videoTasks.map((item) => item.id === task.id ? { ...item, status: "failed", error: "资产图片尚未映射到 Canvas" } : item) }), { originClientId });
    throw new Error("资产图片尚未映射到 Canvas");
  }
  const configId = stableStudioNodeId(projectId, "take", task.id, "asset-video-config");
  const sourceNode = project.nodes.find((node: any) => node.id === imageNodeId);
  let created: Awaited<ReturnType<typeof applyCanvasOperations>>;
  try {
    created = await applyCanvasOperations(projectId, avoidStudioNodeOverlaps(project.nodes, [
      { op: "add_node", node: { id: configId, type: "config", title: `${entity.name} · 动态参考`, position: { x: Number(sourceNode.position?.x || 2300) + 420, y: Number(sourceNode.position?.y || 280) }, width: 360, height: 390, metadata: { generationMode: "video", model: "minimax-h3", composerContent: task.prompt, seconds: task.duration, videoCount: 1, vquality: String(raw?.resolution || "preview"), artifactType: "studio-asset-video-config", studioAssetId: entityId, studioAssetType: kind, status: "idle" } } },
      { op: "connect", from: imageNodeId, to: configId },
    ]), Number(project.version), { allowStudioManagedWrites: true });
  } catch (error) {
    await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: state.videoTasks.map((item) => item.id === task.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : "动态参考任务准备失败" } : item) }), { originClientId }).catch(() => undefined);
    throw error;
  }
  publishProjectUpdated(created.project, originClientId);
  return { projectId, kind, entityId, task, configId, response };
}

async function executeStudioAssetVideo(prepared: Awaited<ReturnType<typeof prepareStudioAssetVideo>>, originClientId: string, signal?: AbortSignal) {
  const { projectId, kind, entityId, task, configId } = prepared;
  let runResult: Awaited<ReturnType<typeof runCanvasConfigNodes>>;
  try { runResult = await runCanvasConfigNodes({ projectId, configNodeIds: [configId], concurrency: 1, originClientId, signal }); }
  catch (error) {
    await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: state.videoTasks.map((item) => item.id === task.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : "动态参考生成失败" } : item) }), { originClientId }).catch(() => undefined);
    throw error;
  }
  const run = runResult.results[0];
  if (!run || run.status === "error") {
    await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: state.videoTasks.map((item) => item.id === task.id ? { ...item, status: "failed", error: run?.error || "动态参考生成失败" } : item) }), { originClientId });
    throw new Error(run?.error || "动态参考生成失败");
  }
  const canvas = await readProject(projectId) as any;
  const output = canvas.nodes.find((node: any) => node.id === run.outputNodeIds[0]);
  const resourceId = String(output?.metadata?.storageKey || "");
  if (!resourceId) {
    await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: state.videoTasks.map((item) => item.id === task.id ? { ...item, status: "failed", error: "动态参考没有生成本地视频资源" } : item) }), { originClientId });
    throw new Error("动态参考没有生成本地视频资源");
  }
  const completed = { ...task, status: "completed", resource_id: resourceId, video_url: String(output.metadata.content || `/files/by-id/${resourceId}`), canvas_node_id: output.id, config_node_id: configId };
  const response = await mutateStudioProject(projectId, (state) => ({
    ...state,
    videoTasks: state.videoTasks.map((item) => item.id === task.id ? completed : item),
    [entityCollection(kind)]: state[entityCollection(kind)].map((item) => item.id === entityId ? { ...item, video_assets: [...(Array.isArray(item.video_assets) ? item.video_assets : []), completed] } : item),
  }), { originClientId });
  return { ...response, _task_id: task.id };
}

export async function extractStudioLastFrame(projectId: string, targetFrameId: string, videoTaskId: string, originClientId: string) {
  const project = await getStudioBackedProject(projectId);
  requiredFrame(project.studio, targetFrameId);
  const task = project.studio.videoTasks.find((item) => item.id === videoTaskId && item.status === "completed");
  if (!task?.resource_id) throw new Error("视频任务尚未完成或没有本地资源");
  const videoNodeId = String(task.canvas_node_id || stableStudioNodeId(projectId, "take", task.id, "video-output"));
  const extracted = await useCanvasVideoFrames({ projectId, videoNodeId, frames: ["last"], replaceExisting: false, originClientId });
  const frameResult = extracted.frames[0];
  const url = `/files/by-id/${frameResult.resourceId}`;
  return mutateStudioProject(projectId, (state) => ({ ...state, frames: state.frames.map((frame) => frame.id === targetFrameId ? { ...frame, rendered_image_url: url, rendered_image_resource_id: frameResult.resourceId, extracted_from_video_task_id: videoTaskId } : frame) }), { originClientId });
}

export async function previewStudioDub(projectId: string, frameId: string, videoTaskId: string, offsetMs: number, originClientId: string) {
  const project = await getStudioBackedProject(projectId);
  const frame = requiredFrame(project.studio, frameId);
  const task = project.studio.videoTasks.find((item) => item.id === videoTaskId && item.status === "completed");
  if (!task?.resource_id) throw new Error("选中的视频尚未完成");
  if (!frame.audio_resource_id) throw new Error("当前镜头尚未生成对白音频");
  const videoNodeId = String(task.canvas_node_id || stableStudioNodeId(projectId, "take", task.id, "video-output"));
  const audioNodeId = stableStudioNodeId(projectId, "audio", frame.id, "dialogue-output");
  const targetNodeId = stableStudioNodeId(projectId, "take", task.id, "dubbed-video-output");
  const dubbed = await dubCanvasVideo({ projectId, videoNodeId, audioNodeId, offsetMs, title: `${frame.title} · 配音预览`, targetNodeId, originClientId });
  await mutateStudioProject(projectId, (state) => ({ ...state, frames: state.frames.map((item) => item.id === frameId ? { ...item, preview_video_url: dubbed.url, preview_video_resource_id: dubbed.resourceId, preview_video_node_id: dubbed.nodeId, preview_video_task_id: videoTaskId, dub_offset_ms: dubbed.offsetMs } : item) }), { originClientId });
  return { frame_id: frameId, video_task_id: videoTaskId, preview_url: dubbed.url, resource_id: dubbed.resourceId, offset_ms: dubbed.offsetMs };
}

export async function applyStudioDub(projectId: string, frameId: string, originClientId: string) {
  return mutateStudioProject(projectId, (state) => {
    const frame = requiredFrame(state, frameId);
    if (!frame.preview_video_url || !frame.preview_video_resource_id) throw new Error("请先生成配音预览");
    return { ...state, frames: state.frames.map((item) => item.id === frameId ? { ...item, dubbed_video_url: frame.preview_video_url, dubbed_video_resource_id: frame.preview_video_resource_id, dubbed_video_node_id: frame.preview_video_node_id, dubbed_video_task_id: frame.preview_video_task_id, dub_applied: true } : item) };
  }, { originClientId });
}

export async function revertStudioDub(projectId: string, frameId: string, originClientId: string) {
  return mutateStudioProject(projectId, (state) => ({ ...state, frames: state.frames.map((item) => item.id === frameId ? { ...item, dubbed_video_url: undefined, dubbed_video_resource_id: undefined, dubbed_video_node_id: undefined, dubbed_video_task_id: undefined, dub_applied: false } : item) }), { originClientId });
}

export async function polishStudioText(projectId: string, prompt: string, originClientId: string, options: {
  frameId?: string;
  operation?: Extract<StudioPromptOperation, "storyboard_polish" | "video_polish" | "r2v_polish">;
  feedback?: string;
  prevCn?: string;
  targetDurationSeconds?: number;
  orderedResourceIds?: string[];
  resourceRoles?: Array<{ resourceId: string; role: string }>;
  requestedModel?: string;
} = {}) {
  const operation = options.operation || "storyboard_polish";
  const configId = options.frameId
    ? stableStudioNodeId(projectId, "frame", options.frameId, "prompt-revision-config")
    : stableStudioNodeId(projectId, "frame", projectId, "prompt-revision-config");
  const result = await executeStudioPrompt({
    projectId,
    frameId: options.frameId,
    operation,
    draftPrompt: prompt,
    feedback: options.feedback,
    prevCn: options.prevCn,
    targetDurationSeconds: options.targetDurationSeconds,
    orderedResourceIds: options.orderedResourceIds,
    resourceRoles: options.resourceRoles,
    requestedModel: options.requestedModel,
    configNodeId: configId,
    originClientId,
  });
  if (operation === "video_polish" || operation === "r2v_polish") {
    return { prompt_cn: options.prevCn || prompt, prompt_en: result.text.trim(), execution: result.execution };
  }
  const parsed = parseJson(result.text);
  const promptCn = String(parsed.revisedDescriptionCn || parsed.prompt_cn || prompt);
  const promptEn = String(parsed.revisedDescriptionEn || parsed.prompt_en || promptCn);
  return { prompt_cn: promptCn, prompt_en: promptEn, execution: result.execution };
}

export async function previewStudioVoice(projectId: string, voiceId: string, text: string, instructions: string, originClientId: string) {
  const project = await readProject(projectId) as any;
  const configId = randomUUID();
  const position = { x: Math.max(160, ...project.nodes.map((node: any) => Number(node.position?.x || 0) + Number(node.width || 0))) + 96, y: 160 };
  const created = await applyCanvasOperations(projectId, avoidStudioNodeOverlaps(project.nodes, [{ op: "add_node", node: { id: configId, type: "config", title: "Studio · 音色试听", position, width: 360, height: 390, metadata: { generationMode: "audio", model: "volc-speech", composerContent: text, audioVoice: voiceId, audioInstructions: instructions, artifactType: "studio-voice-preview", status: "idle" } } }]), Number(project.version));
  publishProjectUpdated(created.project, originClientId);
  let generatedIds: string[] = [];
  try {
    const result = await runCanvasConfigNodes({ projectId, configNodeIds: [configId], concurrency: 1, originClientId });
    const run = result.results[0];
    if (!run || run.status === "error") throw new Error(run?.error || "音色试听生成失败");
    generatedIds = [...run.outputNodeIds, ...(run.toneNodeId ? [run.toneNodeId] : [])];
    const current = await readProject(projectId) as any;
    const output = current.nodes.find((node: any) => node.id === run.outputNodeIds[0]);
    const resourceId = String(output?.metadata?.storageKey || "");
    if (!resourceId) throw new Error("音色试听没有生成本地资源");
    return { url: String(output.metadata.content || `/files/by-id/${resourceId}`), resource_id: resourceId, cached: false };
  } finally {
    const current = await readProject(projectId).catch(() => null) as any;
    if (current) {
      const ids = [configId, ...generatedIds].filter((id) => current.nodes.some((node: any) => node.id === id));
      if (ids.length) {
        const cleaned = await applyCanvasOperations(projectId, ids.map((nodeId) => ({ op: "delete_node" as const, nodeId })), Number(current.version));
        publishProjectUpdated(cleaned.project, originClientId);
      }
    }
  }
}

async function runStudioPromptJson(input: { projectId: string; configId: string; operation: StudioPromptOperation; draftPrompt: string; requestedModel?: string; thinking?: TextThinkingMode; originClientId: string }) {
  const result = await executeStudioPrompt({ projectId: input.projectId, operation: input.operation, draftPrompt: input.draftPrompt, requestedModel: input.requestedModel, thinking: input.thinking, configNodeId: input.configId, originClientId: input.originClientId });
  return parseJson(result.text);
}

async function configureNode(projectId: string, nodeId: string, metadata: Record<string, unknown>, originClientId: string) {
  const project = await readProject(projectId) as any;
  const result = await applyCanvasOperations(projectId, [{ op: "update_node", nodeId, patch: { metadata } }], Number(project.version), { allowStudioManagedWrites: true });
  publishProjectUpdated(result.project, originClientId);
}

type StudioVideoInput = { resourceId: string; type: "image" | "video" | "audio"; role: string };

async function resolveStudioVideoInputs(frame: StudioStoryboardFrame, raw: any, generationMode: string): Promise<StudioVideoInput[]> {
  const requested: Array<{ value: unknown; role: string }> = generationMode === "fl2v"
    ? [{ value: raw?.first_frame_url || raw?.image_url || frame.image_url, role: "firstFrame" }, { value: raw?.last_frame_url, role: "lastFrame" }]
    : generationMode === "r2v"
      ? [
          ...valueArray(raw?.reference_image_urls).map((value, index) => ({ value, role: `referenceImage${index + 1}` })),
          ...valueArray(raw?.reference_audio_urls || raw?.audio_url).map((value, index) => ({ value, role: `referenceAudio${index + 1}` })),
        ]
      : [{ value: raw?.image_url || frame.image_url, role: "firstFrame" }];
  const inputs: StudioVideoInput[] = [];
  for (const item of requested) {
    const value = String(item.value || "").trim();
    if (!value) continue;
    const resourceId = value.match(/\/files\/by-id\/([A-Za-z0-9_-]{1,80})/)?.[1] || (/^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : "");
    if (!resourceId) throw new Error(`视频参考素材必须先导入 Croco 本地资源库：${item.role}`);
    if (inputs.some((input) => input.resourceId === resourceId)) continue;
    const resource = await resourceById(resourceId);
    if (!resource || !["image", "audio"].includes(resource.type)) throw new Error(`H3 参考资源必须是图片或音频：${resourceId}`);
    inputs.push({ resourceId, type: resource.type as StudioVideoInput["type"], role: item.role });
  }
  if (generationMode === "fl2v" && (inputs.length !== 2 || inputs.some((input) => input.type !== "image"))) throw new Error("FL2V 必须提供有序的本地首帧和尾帧图片");
  if (generationMode === "i2v" && !inputs.some((input) => input.type === "image")) throw new Error("I2V 必须提供本地首帧图片");
  if (generationMode === "r2v" && !inputs.length) throw new Error("多参考生视频至少需要一个本地图片或音频参考资源");
  return inputs.slice(0, 16);
}

async function configureStudioVideoNode(projectId: string, configId: string, frameId: string, prompt: string, generationMode: string, inputs: StudioVideoInput[], metadata: Record<string, unknown>, originClientId: string) {
  const project = await readProject(projectId) as any;
  const operations: CanvasOperation[] = [];
  const nodeIds: string[] = [];
  for (const [index, input] of inputs.entries()) {
    let resourceNode = project.nodes.find((node: any) => String(node.metadata?.storageKey || "") === input.resourceId && node.type === input.type);
    if (!resourceNode) {
      const resource = await resourceById(input.resourceId);
      if (!resource) throw new Error(`视频参考资源不存在：${input.resourceId}`);
      const nodeId = stableStudioNodeId(projectId, "frame", frameId, `reference-${input.resourceId}`);
      resourceNode = { id: nodeId, type: input.type };
      operations.push({ op: "add_node", node: { id: nodeId, type: input.type, title: `${input.role} · ${resource.name}`, position: { x: 2460, y: 900 + index * 240 }, width: 320, height: input.type === "audio" ? 180 : 240, metadata: { artifactType: "studio-reference-resource", storageKey: input.resourceId, content: resource.url, status: "success", generationState: "ready", resourceRole: input.role } } });
    }
    nodeIds.push(String(resourceNode.id));
  }
  const composerContent = [prompt, ...nodeIds.map((nodeId, index) => `${inputs[index].role}: @[node:${nodeId}]`)].join("\n");
  operations.push({ op: "update_node", nodeId: configId, patch: { metadata: { ...metadata, composerContent, videoInputMode: generationMode, orderedResourceIds: inputs.map((input) => input.resourceId), resourceRoles: inputs.map(({ resourceId, role, type }) => ({ resourceId, role, type })) } } });
  operations.push(...nodeIds.map((nodeId): CanvasOperation => ({ op: "connect", from: nodeId, to: configId })));
  const result = await applyCanvasOperations(projectId, avoidStudioNodeOverlaps(project.nodes, operations), Number(project.version), { allowStudioManagedWrites: true });
  publishProjectUpdated(result.project, originClientId);
}

function valueArray(value: unknown): unknown[] { return Array.isArray(value) ? value : value == null || value === "" ? [] : [value]; }

async function runTargets(projectId: string, configNodeId: string, outputNodeIds: string[], originClientId: string, signal?: AbortSignal) {
  const result = await runCanvasConfigNodes({ projectId, configNodeIds: [configNodeId], concurrency: 1, originClientId, signal, targetOutputNodeIds: { [configNodeId]: outputNodeIds } });
  const run = result.results[0];
  if (!run || run.status === "error") throw new Error(run?.error || "Studio 生成任务失败");
}

async function outputResources(projectId: string, outputNodeIds: string[], explicitIds?: string[]) {
  const project = await readProject(projectId) as any;
  return outputNodeIds.map((nodeId, index) => {
    const node = project.nodes.find((item: any) => item.id === nodeId);
    const role = String(node?.metadata?.studioRole || "");
    const roleId = role.startsWith("image-output-") ? role.slice("image-output-".length) : undefined;
    return { variantId: explicitIds?.[index] || roleId || "", resourceId: String(node?.metadata?.storageKey || "") || undefined, url: String(node?.metadata?.content || "") || undefined };
  });
}

function normalizeEntities(value: unknown): StudioNamedEntity[] { return Array.isArray(value) ? value.slice(0, 500).map(normalizeEntity) : []; }
function normalizeEntity(value: any): StudioNamedEntity { return { ...objectValue(value), id: safeId(value?.id), name: String(value?.name || "未命名").slice(0, 180), description: String(value?.description || "").slice(0, 100_000), status: String(value?.status || "ready") }; }
function normalizeFrames(value: unknown): StudioStoryboardFrame[] { return Array.isArray(value) ? value.slice(0, 2_000).map((item, index) => normalizeFrame(item, index)) : []; }
function normalizeFrame(value: any, order: number): StudioStoryboardFrame { return { ...objectValue(value), id: safeId(value?.id), title: String(value?.title || `镜头 ${order + 1}`).slice(0, 180), prompt: String(value?.prompt || value?.image_prompt || value?.action_description || "").slice(0, 100_000), order, status: String(value?.status || "ready") }; }
function normalizeStyle(value: any, index: number) { return { ...objectValue(value), id: safeId(value?.id || `recommendation-${index + 1}`), name: String(value?.name || `风格 ${index + 1}`), description: String(value?.description || ""), positive_prompt: String(value?.positive_prompt || ""), negative_prompt: String(value?.negative_prompt || "") }; }
function normalizeEntityKind(value: unknown): EntityKind { const text = String(value || "").toLowerCase().replace(/s$/, ""); if (text === "character" || text === "scene" || text === "prop") return text; throw new Error(`不支持的资产类型：${value}`); }
function entityCollection(kind: EntityKind): "characters" | "scenes" | "props" { return kind === "character" ? "characters" : kind === "scene" ? "scenes" : "props"; }
function requiredEntity(items: StudioNamedEntity[], id: string) { const item = items.find((entry) => entry.id === id); if (!item) throw new Error(`资产不存在：${id}`); return item; }
function requiredFrame(state: StudioProjectState, id: string) { const frame = state.frames.find((item) => item.id === id); if (!frame) throw new Error(`镜头不存在：${id}`); return frame; }
function requiredId(value: unknown, label: string) { const id = String(value || "").trim(); if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error(`${label}无效`); return id; }
function safeId(value: unknown) { const id = String(value || "").trim(); return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : randomUUID(); }
function boundedCount(value: unknown) { const count = Number(value); return Math.max(1, Math.min(3, Number.isFinite(count) ? Math.floor(count) : 1)); }
function resolveImageModel(value: unknown) { const requested = String(value || "").trim(); return models.image.includes(requested) ? requested : models.image[0]; }
function aspectSize(value: string) { return ({ "16:9": "1344x768", "9:16": "768x1344", "4:3": "1184x896", "3:4": "896x1184", "1:1": "1024x1024" } as Record<string, string>)[value] || "1024x1024"; }
function objectValue(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function arrayRecords(value: unknown) { return Array.isArray(value) ? value.map(objectValue) : []; }
function parseJson(text: string): Record<string, any> { const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); try { const parsed = JSON.parse(cleaned); return objectValue(parsed); } catch { const match = cleaned.match(/\{[\s\S]*\}/); if (match) return objectValue(JSON.parse(match[0])); throw new Error("模型返回的 Studio JSON 无法解析"); } }
