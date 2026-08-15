import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import { Router, type NextFunction, type Request, type Response } from "express";
import { listCharacters } from "./characters";
import { models } from "./providers";
import { addResource, fileSize, listProjects, listResources, readProject, resourceById, typeFromMime, updateResource, writeGenerated } from "./storage";
import { createStudioProject, deleteStudioProject, getStudioBackedProject, getStudioProject, listStudioProjectResponses, mutateStudioProject } from "./studio-commands";
import {
  analyzeStudioArtDirection, analyzeStudioStoryboard, clearStudioArtDirection, copyStudioFrame, createStudioEntity, createStudioFrame, createStudioVideoTasks,
  deleteStudioEntity, deleteStudioFrame, extractStudioEntities, generateStudioAsset, generateStudioFrameAudio, mergeStudioProject, patchStudioEntity, patchStudioFrame,
  polishStudioText, previewStudioEntities, renderStudioFrame, reorderStudioFrames, replaceStudioStoryboard, saveStudioArtDirection, selectStudioVideo, toggleStudioEntityFlag,
} from "./studio-workflow";
import { studioCompatRouter } from "./studio-compat-api";
import { studioPlaygroundRouter } from "./studio-playground-api";
import { getPromptTemplate, listPromptTemplates } from "./prompt-registry";
import { STUDIO_PROMPT_TEMPLATE_MAP } from "./studio-schemas";
import { getStudioModelCatalog } from "./model-catalog";
import { clearProviderSecret, listProviderSecretStatuses, revealProviderSecret, updateProviderSecret } from "./provider-secrets";
import { applyStudioCanvasEdits } from "./studio-canvas-translation";
import { executeStudioPromptForProject, type StudioPromptOperation } from "./studio-prompt-runtime";

export const studioApiRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024, files: 1 } });

const STYLE_PRESETS = {
  categories: [
    { id: "cinematic", name: "Cinematic", name_zh: "电影感", sort_order: 1 },
    { id: "animation", name: "Animation", name_zh: "动画", sort_order: 2 },
  ],
  presets: [
    { id: "cinematic-realism", category: "cinematic", name: "Cinematic Realism", name_zh: "电影写实", positive_prompt: "cinematic realism, natural light, production design, film color grading", negative_prompt: "plastic skin, flat lighting, text, watermark", thumbnail: null },
    { id: "stylized-animation", category: "animation", name: "Stylized Animation", name_zh: "风格动画", positive_prompt: "stylized animation, expressive shapes, cohesive palette, cinematic composition", negative_prompt: "photorealistic, noisy details, text, watermark", thumbnail: null },
  ],
};
studioApiRouter.get("/health", route(async (_request, response) => response.json({ ok: true, time: Date.now() / 1000, log_file: "data/runtime/server.log", log_dir: "data/runtime", studio_projects: (await listStudioProjectResponses({ kind: "episode" })).length })));
studioApiRouter.get("/system/check", route(async (_request, response) => response.json({ status: "ok", system_info: { runtime: "Croco Canvas" }, dependencies: { ffmpeg: { available: true, message: "由 Croco Canvas 运行时管理", path: "ffmpeg" } } })));
studioApiRouter.get("/diagnose/log_tail", route(async (_request, response) => response.json({ path: "data/runtime", lines: [], errors: [], missing: false, total_lines: 0, returned_lines: 0 })));
studioApiRouter.get("/prompt-registry", route(async (request, response) => response.json({
  schemaVersion: 1,
  templates: await listPromptTemplates({
    includeLegacy: request.query.include_legacy === "true",
    includeInactive: request.query.include_inactive === "true",
  }),
})));
studioApiRouter.get("/prompt-registry/:templateKey", route(async (request, response) => response.json(await getPromptTemplate(
  param(request.params.templateKey),
  typeof request.query.version === "string" ? request.query.version : undefined,
))));
studioApiRouter.get("/model-catalog", route(async (_request, response) => response.json(getStudioModelCatalog())));

studioApiRouter.post("/projects", route(async (request, response) => response.status(201).json(await createStudioProject(request.body, clientId(request)))));
studioApiRouter.get("/projects/", route(async (_request, response) => response.json(await listStudioProjectResponses({ kind: "episode" }))));
studioApiRouter.get("/projects", route(async (_request, response) => response.json(await listStudioProjectResponses({ kind: "episode" }))));
studioApiRouter.put("/projects/:id/text", projectRoute(async (request, response, id) => response.json(await mutateStudioProject(id, (state) => ({ ...state, originalText: String(request.body?.text || "") }), { originClientId: clientId(request) }))));
studioApiRouter.put("/projects/:id/reparse", projectRoute(async (request, response, id) => response.json(await extractStudioEntities(id, String(request.body?.text || ""), clientId(request)))));
studioApiRouter.post("/projects/:id/extract_preview", projectRoute(async (request, response, id) => response.json(await previewStudioEntities(id, String(request.body?.text || ""), clientId(request)))));
studioApiRouter.post("/projects/:id/toggle_starred", projectRoute(async (request, response, id) => response.json(await mutateStudioProject(id, (state) => ({ ...state, starred: !state.starred }), { originClientId: clientId(request) }))));
studioApiRouter.post("/projects/:id/sync_descriptions", projectRoute(async (_request, response, id) => response.json(await getStudioProject(id))));

studioApiRouter.post("/projects/:id/art_direction/analyze", projectRoute(async (request, response, id) => response.json(await analyzeStudioArtDirection(id, String(request.body?.script_text || ""), clientId(request)))));
studioApiRouter.post("/projects/:id/art_direction/save", projectRoute(async (request, response, id) => response.json(await saveStudioArtDirection(id, request.body, clientId(request)))));
studioApiRouter.post("/projects/:id/art_direction/clear", projectRoute(async (request, response, id) => response.json(await clearStudioArtDirection(id, clientId(request)))));
studioApiRouter.get("/art_direction/presets", route(async (_request, response) => response.json(STYLE_PRESETS)));

for (const [plural, kind] of [["characters", "character"], ["scenes", "scene"], ["props", "prop"]] as const) {
  studioApiRouter.post(`/projects/:id/${plural}`, projectRoute(async (request, response, id) => response.json(await createStudioEntity(id, kind, request.body, clientId(request)))));
  studioApiRouter.delete(`/projects/:id/${plural}/:entityId`, projectRoute(async (request, response, id) => response.json(await deleteStudioEntity(id, kind, param(request.params.entityId), clientId(request)))));
}
studioApiRouter.put("/projects/:id/assets/:assetType/:assetId", projectRoute(async (request, response, id) => response.json(await patchStudioEntity(id, entityKind(request.params.assetType), param(request.params.assetId), objectValue(request.body), clientId(request)))));
studioApiRouter.post("/projects/:id/assets/update_description", projectRoute(async (request, response, id) => response.json(await patchStudioEntity(id, entityKind(request.body?.asset_type), requiredId(request.body?.asset_id), { description: String(request.body?.description || "") }, clientId(request)))));
studioApiRouter.post("/projects/:id/assets/update_attributes", projectRoute(async (request, response, id) => response.json(await patchStudioEntity(id, entityKind(request.body?.asset_type), requiredId(request.body?.asset_id), objectValue(request.body?.attributes), clientId(request)))));
studioApiRouter.post("/projects/:id/assets/update_image", projectRoute(async (request, response, id) => response.json(await setEntityImageUrl(id, request.body, clientId(request)))));
studioApiRouter.post("/projects/:id/assets/toggle_lock", projectRoute(async (request, response, id) => response.json(await toggleStudioEntityFlag(id, entityKind(request.body?.asset_type), requiredId(request.body?.asset_id), "locked", clientId(request)))));
studioApiRouter.post("/projects/:id/assets/toggle_starred", projectRoute(async (request, response, id) => response.json(await toggleStudioEntityFlag(id, entityKind(request.body?.asset_type), requiredId(request.body?.asset_id), "starred", clientId(request)))));
studioApiRouter.post("/projects/:id/assets/variant/select", projectRoute(async (request, response, id) => response.json(await mutateEntityVariant(id, request.body, "select", clientId(request)))));
studioApiRouter.post("/projects/:id/assets/variant/delete", projectRoute(async (request, response, id) => response.json(await mutateEntityVariant(id, request.body, "delete", clientId(request)))));
studioApiRouter.post("/projects/:id/assets/variant/favorite", projectRoute(async (request, response, id) => response.json(await mutateEntityVariant(id, request.body, "favorite", clientId(request)))));
studioApiRouter.post("/projects/:id/assets/generate", projectRoute(async (request, response, id) => response.json(await generateStudioAsset(id, request.body, clientId(request)))));
studioApiRouter.post("/projects/:id/generate_assets", projectRoute(async (request, response, id) => response.json(await generateMissingAssets(id, clientId(request)))));
studioApiRouter.post("/projects/:id/assets/:assetType/:assetId/upload", upload.single("file"), projectRoute(async (request, response, id) => {
  const resource = await storeUpload(request);
  response.json(await attachEntityResource(id, entityKind(request.params.assetType), param(request.params.assetId), resource, clientId(request)));
}));

studioApiRouter.post("/projects/:id/storyboard/analyze", projectRoute(async (request, response, id) => response.json(await analyzeStudioStoryboard(id, String(request.body?.text || ""), clientId(request)))));
studioApiRouter.put("/projects/:id/storyboard", projectRoute(async (request, response, id) => response.json(await replaceStudioStoryboard(id, request.body?.frames, clientId(request)))));
studioApiRouter.post("/projects/:id/generate_storyboard", projectRoute(async (request, response, id) => { const project = await getStudioBackedProject(id); response.json(await analyzeStudioStoryboard(id, project.studio.originalText, clientId(request))); }));
studioApiRouter.post("/projects/:id/storyboard/render", projectRoute(async (request, response, id) => response.json(await renderStudioFrame(id, request.body, clientId(request)))));
studioApiRouter.post("/projects/:id/storyboard/refine_prompt", projectRoute(async (request, response, id) => {
  const frameId = requiredId(request.body?.frame_id);
  const polished = await polishStudioText(id, String(request.body?.raw_prompt || ""), clientId(request), promptRuntimeOptions(request.body, "storyboard_polish", frameId));
  const project = await patchStudioFrame(id, frameId, { prompt: polished.prompt_cn, prompt_cn: polished.prompt_cn, prompt_en: polished.prompt_en }, clientId(request));
  response.json({ ...polished, frame_updated: project });
}));
studioApiRouter.post("/projects/:id/frames", projectRoute(async (request, response, id) => response.json(await createStudioFrame(id, request.body, clientId(request)))));
studioApiRouter.post("/projects/:id/frames/update", projectRoute(async (request, response, id) => response.json(await patchStudioFrame(id, requiredId(request.body?.frame_id), request.body, clientId(request)))));
studioApiRouter.post("/projects/:id/frames/toggle_lock", projectRoute(async (request, response, id) => { const project = await getStudioBackedProject(id); const frameId = requiredId(request.body?.frame_id); const frame = project.studio.frames.find((item) => item.id === frameId); response.json(await patchStudioFrame(id, frameId, { locked: !frame?.locked }, clientId(request))); }));
studioApiRouter.patch("/projects/:id/frames/:frameId/workbench", projectRoute(async (request, response, id) => response.json(await patchStudioFrame(id, param(request.params.frameId), request.body, clientId(request)))));
studioApiRouter.delete("/projects/:id/frames/:frameId", projectRoute(async (request, response, id) => response.json(await deleteStudioFrame(id, param(request.params.frameId), clientId(request)))));
studioApiRouter.post("/projects/:id/frames/copy", projectRoute(async (request, response, id) => response.json(await copyStudioFrame(id, requiredId(request.body?.frame_id), request.body?.insert_at, clientId(request)))));
studioApiRouter.put("/projects/:id/frames/reorder", projectRoute(async (request, response, id) => response.json(await reorderStudioFrames(id, stringArray(request.body?.frame_ids), clientId(request)))));
studioApiRouter.post("/projects/:id/frames/:frameId/select_video", projectRoute(async (request, response, id) => response.json(await selectStudioVideo(id, param(request.params.frameId), requiredId(request.body?.video_id), clientId(request)))));
studioApiRouter.post("/projects/:id/frames/:frameId/auto_select_latest_video", projectRoute(async (request, response, id) => response.json(await selectStudioVideo(id, param(request.params.frameId), undefined, clientId(request)))));
studioApiRouter.post("/projects/:id/frames/:frameId/unpin_video", projectRoute(async (request, response, id) => response.json(await patchStudioFrame(id, param(request.params.frameId), { video_pinned: false }, clientId(request)))));
studioApiRouter.post("/projects/:id/frames/:frameId/audio", projectRoute(async (request, response, id) => response.json(await generateStudioFrameAudio(id, param(request.params.frameId), request.body, clientId(request)))));
studioApiRouter.post("/projects/:id/frames/:frameId/refine", projectRoute(async (request, response, id) => { const project = await getStudioBackedProject(id); const frameId = param(request.params.frameId); const frame = project.studio.frames.find((item) => item.id === frameId); const polished = await polishStudioText(id, frame?.prompt || "", clientId(request), promptRuntimeOptions(request.body, "storyboard_polish", frameId)); response.json(await patchStudioFrame(id, frameId, { prompt: polished.prompt_cn, prompt_cn: polished.prompt_cn, prompt_en: polished.prompt_en }, clientId(request))); }));
studioApiRouter.post("/projects/:id/storyboard/refine_batch", projectRoute(async (request, response, id) => {
  response.status(200); response.setHeader("Content-Type", "text/event-stream"); response.setHeader("Cache-Control", "no-cache"); response.flushHeaders();
  const project = await getStudioBackedProject(id); let index = 0;
  for (const frame of project.studio.frames) {
    response.write(`event: frame_refine_start\ndata: ${JSON.stringify({ frame_id: frame.id, frame_index: index, total: project.studio.frames.length })}\n\n`);
    try { const polished = await polishStudioText(id, frame.prompt, clientId(request), promptRuntimeOptions(request.body, "storyboard_polish", frame.id)); await patchStudioFrame(id, frame.id, { prompt: polished.prompt_cn, prompt_cn: polished.prompt_cn, prompt_en: polished.prompt_en }, clientId(request)); response.write(`event: frame_refine_complete\ndata: ${JSON.stringify({ frame_id: frame.id, frame_index: index, total: project.studio.frames.length })}\n\n`); }
    catch (error) { response.write(`event: frame_refine_error\ndata: ${JSON.stringify({ frame_id: frame.id, frame_index: index, total: project.studio.frames.length, error: error instanceof Error ? error.message : "refine failed" })}\n\n`); }
    index += 1;
  }
  response.write(`event: batch_complete\ndata: ${JSON.stringify({ total: project.studio.frames.length })}\n\n`); response.end();
}));
studioApiRouter.post("/projects/:id/frames/:frameId/upload_image", upload.single("file"), projectRoute(async (request, response, id) => response.json(await attachFrameResource(id, param(request.params.frameId), await storeUpload(request), clientId(request)))));
studioApiRouter.post("/projects/:id/frames/:frameId/upload_t2i", upload.single("file"), projectRoute(async (request, response, id) => response.json(await attachFrameResource(id, param(request.params.frameId), await storeUpload(request), clientId(request)))));

studioApiRouter.post("/projects/:id/video_tasks", projectRoute(async (request, response, id) => { const project = await createStudioVideoTasks(id, request.body, clientId(request)); response.json(project.video_tasks?.slice(-boundedCount(request.body?.batch_size)) || []); }));
studioApiRouter.patch("/projects/:id/video_tasks/:taskId/annotate", projectRoute(async (request, response, id) => response.json(await mutateVideoTask(id, param(request.params.taskId), request.body, clientId(request)))));
studioApiRouter.post("/projects/:id/video_tasks/:taskId/cancel", projectRoute(async (request, response, id) => response.json(await mutateVideoTask(id, param(request.params.taskId), { status: "failed", error: "用户取消" }, clientId(request)))));
studioApiRouter.get("/tasks/:taskId", route(async (request, response) => response.json(await findVideoTask(param(request.params.taskId)))));
studioApiRouter.post("/projects/:id/merge", projectRoute(async (request, response, id) => response.json(await mergeStudioProject(id, clientId(request)))));
studioApiRouter.post("/projects/:id/generate_video", projectRoute(async (request, response, id) => response.json(await mergeStudioProject(id, clientId(request)))));
studioApiRouter.post("/projects/:id/run-stage", projectRoute(async (request, response, id) => response.json(await runStudioStage(id, String(request.body?.stage || ""), clientId(request)))));
studioApiRouter.post("/projects/:id/canvas-edits", projectRoute(async (request, response, id) => response.json(await applyStudioCanvasEdits(id, request.body?.edits, { expectedVersion: optionalVersion(request.body?.expectedVersion), originClientId: clientId(request) }))));
studioApiRouter.post("/projects/:id/prompt-executions", projectRoute(async (request, response, id) => {
  const references = promptResourceReferences(request.body);
  response.json(await executeStudioPromptForProject({
    projectId: id,
    operation: promptOperation(request.body?.operation),
    templateKey: optionalTemplateKey(request.body?.template_key || request.body?.templateKey),
    draftPrompt: boundedText(request.body?.draft_prompt ?? request.body?.draftPrompt, "draftPrompt", 100_000),
    feedback: optionalText(request.body?.feedback, 100_000),
    prevCn: optionalText(request.body?.prev_cn ?? request.body?.prevCn, 100_000),
    targetDurationSeconds: boundedDuration(request.body?.target_duration_seconds ?? request.body?.targetDurationSeconds),
    orderedResourceIds: references.map((reference) => reference.resourceId),
    resourceRoles: references,
    requestedModel: optionalText(request.body?.requested_model ?? request.body?.requestedModel, 100),
    frameId: optionalId(request.body?.frame_id ?? request.body?.frameId),
    originClientId: clientId(request),
  }));
}));
studioApiRouter.get("/projects/:id/prompt-executions", projectRoute(async (request, response, id) => {
  const backed = await getStudioBackedProject(id);
  const executionId = optionalId(request.query.execution_id);
  const limit = boundedLimit(request.query.limit, 100);
  const executions = backed.studio.generationExecutions
    .filter((execution) => !executionId || execution.id === executionId)
    .slice(-limit)
    .reverse()
    .map((execution) => ({
      ...execution,
      results: execution.outputNodeIds.map((nodeId) => {
        const node = backed.nodes.find((candidate) => candidate.id === nodeId);
        return node ? {
          nodeId,
          type: node.type,
          title: node.title,
          status: String(node.metadata?.status || ""),
          resourceId: String(node.metadata?.storageKey || "") || undefined,
          content: typeof node.metadata?.content === "string" ? node.metadata.content.slice(0, 100_000) : undefined,
        } : { nodeId, missing: true };
      }),
    }));
  response.json({ projectId: id, projectVersion: backed.version, executions });
}));

studioApiRouter.post("/video/polish_prompt", route(async (request, response) => response.json(await polishStudioText(requiredId(request.body?.script_id), String(request.body?.draft_prompt || ""), clientId(request), promptRuntimeOptions(request.body, "video_polish")))));
studioApiRouter.post("/video/polish_r2v_prompt", route(async (request, response) => response.json(await polishStudioText(requiredId(request.body?.script_id), String(request.body?.draft_prompt || ""), clientId(request), promptRuntimeOptions(request.body, "r2v_polish")))));
studioApiRouter.patch("/projects/:id/style", projectRoute(async (request, response, id) => response.json(await mutateStudioProject(id, (state) => ({ ...state, stylePreset: String(request.body?.style_preset || ""), stylePrompt: String(request.body?.style_prompt || "") }), { originClientId: clientId(request) }))));
studioApiRouter.post("/projects/:id/model_settings", projectRoute(async (request, response, id) => response.json(await mutateStudioProject(id, (state) => ({ ...state, modelSettings: { ...state.modelSettings, ...objectValue(request.body) } }), { originClientId: clientId(request) }))));
studioApiRouter.get("/projects/:id/prompt_config", projectRoute(async (_request, response, id) => response.json((await getStudioBackedProject(id)).studio.promptConfig)));
studioApiRouter.put("/projects/:id/prompt_config", projectRoute(async (request, response, id) => response.json(await mutateStudioProject(id, (state) => ({ ...state, promptConfig: { ...state.promptConfig, ...stringRecord(request.body) } }), { originClientId: clientId(request) }))));
studioApiRouter.get("/prompt_defaults", route(async (_request, response) => response.json(await legacyPromptDefaults())));
studioApiRouter.put("/projects/:id/audio_mix", projectRoute(async (request, response, id) => {
  const current = await getStudioBackedProject(id);
  const bgmUrl = request.body?.bgm_url !== undefined ? request.body.bgm_url : current.studio.assembly.bgmUrl;
  const bgmResourceId = typeof bgmUrl === "string" ? bgmUrl.match(/\/files\/by-id\/([A-Za-z0-9_-]+)/)?.[1] : undefined;
  response.json(await mutateStudioProject(id, (state) => ({ ...state, assembly: { ...state.assembly, bgmUrl, bgmResourceId, mixSettings: {
    dialogue: Number(request.body?.dialogue_volume ?? state.assembly.mixSettings?.dialogue ?? 100),
    bgm: Number(request.body?.bgm_volume ?? state.assembly.mixSettings?.bgm ?? 35),
    sfx: Number(request.body?.sfx_volume ?? state.assembly.mixSettings?.sfx ?? 60),
  } } }), { originClientId: clientId(request) }));
}));
studioApiRouter.get("/bgm/presets", route(async (_request, response) => {
  const resources = (await listResources()).filter((resource) => resource.type === "audio");
  response.json(resources.map((resource) => ({ id: resource.id, label: resource.name.replace(/\.[^.]+$/, ""), mood: String(resource.metadata?.mood || resource.source || "local"), url: resource.url })));
}));

studioApiRouter.get("/voices", route(async (_request, response) => response.json((await listCharacters()).map((character) => ({ id: character.voiceId, name: character.chineseName || character.name, gender: "Unknown", model: "volcengine:seed-tts-2.0-expressive", family: "cosyvoice", supports_instruction: true, origin: "system" })))));
studioApiRouter.post("/projects/:id/characters/:charId/voice", projectRoute(async (request, response, id) => {
  const presetId = String(request.body?.voice_id || "");
  response.json(await patchStudioEntity(id, "character", param(request.params.charId), { voice_id: decodePresetVoice(presetId), voice_preset_id: presetId, voice_name: request.body?.voice_name }, clientId(request)));
}));
studioApiRouter.put("/projects/:id/characters/:charId/voice_params", projectRoute(async (request, response, id) => response.json(await patchStudioEntity(id, "character", param(request.params.charId), { voice_params: objectValue(request.body) }, clientId(request)))));
studioApiRouter.post("/projects/:id/dialogue_audio/batch", projectRoute(async (request, response, id) => { const project = await getStudioBackedProject(id); let generated = 0, failed = 0, noVoice = 0; for (const frame of project.studio.frames) { if (!frame.dialogue && !frame.dialogue_structured) continue; try { await generateStudioFrameAudio(id, frame.id, {}, clientId(request)); generated += 1; } catch (error) { if (String(error).includes("Voice")) noVoice += 1; else failed += 1; } } response.json({ _batch_stats: { generated, skipped: 0, failed, no_voice: noVoice } }); }));
studioApiRouter.post("/projects/:id/generate_audio", projectRoute(async (request, response, id) => { const project = await getStudioBackedProject(id); for (const frame of project.studio.frames) if (frame.dialogue || frame.dialogue_structured) await generateStudioFrameAudio(id, frame.id, {}, clientId(request)); response.json(await getStudioProject(id)); }));
studioApiRouter.post("/projects/:id/export", projectRoute(async (_request, response, id) => { const project = await getStudioProject(id); response.json({ project_id: id, canvas_url: `/canvas/${id}`, studio_url: `/#/project/${id}`, merged_video_url: project.merged_video_url || null, project }); }));

studioApiRouter.post("/upload", upload.single("file"), route(async (request, response) => { const resource = await storeUpload(request); response.json({ url: resource.url, path: resource.url, resource_id: resource.id }); }));
studioApiRouter.get("/library/assets", route(async (_request, response) => response.json(libraryResponse(await listResources()))));
studioApiRouter.post("/library/assets/upload", upload.single("file"), route(async (request, response) => { const resource = await storeUpload(request); response.json({ image_url: resource.url, resource_id: resource.id }); }));
studioApiRouter.post("/library/assets", route(async (request, response) => response.status(201).json(await createLibraryAsset(request.body))));
studioApiRouter.put("/library/assets/:assetType/:assetId", route(async (request, response) => response.json(await updateLibraryAsset(param(request.params.assetType), param(request.params.assetId), request.body))));
studioApiRouter.post("/library/assets/promote", route(async (request, response) => response.json(await promoteLibraryAsset(request.body))));

studioApiRouter.post("/projects/:id/document", projectRoute(async (request, response, id) => { const content = objectValue(request.body?.content || request.body); const updatedAt = new Date().toISOString(); await mutateStudioProject(id, (state) => ({ ...state, document: { ...state.document, content, updatedAt, snapshots: request.body?.create_snapshot && state.document.content ? [...state.document.snapshots, { timestamp: Date.now() / 1000, label: "自动快照", content: state.document.content }].slice(-500) : state.document.snapshots } }), { originClientId: clientId(request) }); response.json({ project_id: id, content, updated_at: updatedAt }); }));
studioApiRouter.get("/projects/:id/document", projectRoute(async (_request, response, id) => { const document = (await getStudioBackedProject(id)).studio.document; response.json({ project_id: id, content: document.content || { type: "doc", content: [] }, updated_at: document.updatedAt || "" }); }));
studioApiRouter.get("/projects/:id/document/snapshots", projectRoute(async (_request, response, id) => response.json((await getStudioBackedProject(id)).studio.document.snapshots.map((snapshot) => ({ project_id: id, timestamp: String(snapshot.timestamp), created_at: new Date(snapshot.timestamp * 1000).toISOString() })).reverse())));
studioApiRouter.post("/projects/:id/document/snapshots", projectRoute(async (request, response, id) => { const timestamp = Date.now() / 1000; await mutateStudioProject(id, (state) => ({ ...state, document: { ...state.document, snapshots: [...state.document.snapshots, { timestamp, label: String(request.body?.label || "手动快照"), content: state.document.content || {} }].slice(-500) } }), { originClientId: clientId(request) }); response.json({ project_id: id, timestamp: String(timestamp), created_at: new Date(timestamp * 1000).toISOString() }); }));
studioApiRouter.post("/projects/:id/document/snapshots/:timestamp/restore", projectRoute(async (request, response, id) => { const timestamp = Number(param(request.params.timestamp)); const project = await getStudioBackedProject(id); const snapshot = project.studio.document.snapshots.find((item) => item.timestamp === timestamp); if (!snapshot) throw new Error("文档快照不存在"); const updatedAt = new Date().toISOString(); await mutateStudioProject(id, (state) => ({ ...state, document: { ...state.document, content: snapshot.content, updatedAt } }), { originClientId: clientId(request) }); response.json({ project_id: id, content: snapshot.content, updated_at: updatedAt }); }));
studioApiRouter.post("/projects/:id/document/import", projectRoute(async (request, response, id) => { const text = Buffer.from(String(request.body?.content || ""), "base64").toString("utf8"); const content = textToTiptap(text); const updatedAt = new Date().toISOString(); await mutateStudioProject(id, (state) => ({ ...state, originalText: text, document: { ...state.document, content, updatedAt } }), { originClientId: clientId(request) }); response.json({ project_id: id, content, updated_at: updatedAt, filename: String(request.body?.filename || "") }); }));
studioApiRouter.post("/projects/:id/document/export", projectRoute(async (request, response, id) => { const text = tiptapText(objectValue(request.body?.content)); response.setHeader("Content-Type", "text/plain; charset=utf-8"); response.setHeader("Content-Disposition", `attachment; filename=studio-${id}.txt`); response.send(text); }));
studioApiRouter.post("/projects/:id/sync_derivation", projectRoute(async (request, response, id) => { await mutateStudioProject(id, (state) => ({ ...state, metadata: { ...state.metadata, derivation: objectValue(request.body) } }), { originClientId: clientId(request) }); response.json({ status: "ok", synced_at: new Date().toISOString() }); }));
studioApiRouter.post("/projects/:id/derive_gaps", projectRoute(async (request, response, id) => { const project = await getStudioBackedProject(id); const preview = await previewStudioEntities(id, stringArray(request.body?.raw_text_blocks).join("\n") || project.studio.originalText, clientId(request)); const results = [...preview.characters.map((item) => ({ type: "character", name: item.name, description: item.description, confidence: 1 })), ...preview.props.map((item) => ({ type: "prop", name: item.name, description: item.description, confidence: 1 })), ...preview.scenes.map((item) => ({ type: "location", name: item.name, description: item.description, confidence: 1 }))]; response.json({ results, entities: results, cached: false }); }));
studioApiRouter.post("/projects/:id/shot_blocks/:shotId/confirm", projectRoute(async (request, response, id) => { const shotId = param(request.params.shotId); await patchStudioFrame(id, shotId, { ...objectValue(request.body), status: "confirmed" }, clientId(request)); response.json({ shot_id: shotId, status: "confirmed", ...objectValue(request.body), confirmed_at: new Date().toISOString() }); }));

studioApiRouter.get("/config/env", route(async (_request, response) => response.json({ managed_by: "Croco Canvas", secrets_configured: Object.fromEntries((await listProviderSecretStatuses()).map((item) => [item.key, item.configured])) })));
studioApiRouter.post("/config/env", route(async (_request, response) => response.status(403).json({ detail: "Provider 密钥由 Croco 的 .codex/.env 统一管理，不写入 Studio 或浏览器状态" })));
studioApiRouter.get("/config/secrets", route(async (_request, response) => response.json({ secrets: await listProviderSecretStatuses() })));
studioApiRouter.put("/config/secrets/:key", route(async (request, response) => response.json(await updateProviderSecret(param(request.params.key), request.body?.value))));
studioApiRouter.delete("/config/secrets/:key", route(async (request, response) => response.json(await clearProviderSecret(param(request.params.key)))));
studioApiRouter.post("/config/secrets/:key/reveal", route(async (request, response) => response.json({ value: await revealProviderSecret(param(request.params.key)) })));
studioApiRouter.post("/config/mulerun-login", route(async (_request, response) => response.status(410).json({ detail: "MuleRun 登录已由 Croco provider 配置取代" })));

studioApiRouter.use(studioCompatRouter);
studioApiRouter.use(studioPlaygroundRouter);

studioApiRouter.get("/projects/:id", projectRoute(async (_request, response, id) => response.json(await getStudioProject(id))));
studioApiRouter.delete("/projects/:id", projectRoute(async (_request, response, id) => { await deleteStudioProject(id); response.status(204).end(); }));

function route(handler: (request: Request, response: Response) => Promise<unknown>) { return (request: Request, response: Response, next: NextFunction) => void handler(request, response).catch(next); }
function projectRoute(handler: (request: Request, response: Response, id: string) => Promise<unknown>) { return route((request, response) => handler(request, response, param(request.params.id))); }
function clientId(request: Request) { return String(request.header("x-croco-client-id") || "studio-api").slice(0, 180); }
function param(value: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function requiredId(value: unknown) { const id = String(value || "").trim(); if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("ID 无效"); return id; }
function optionalId(value: unknown) { const id = String(value || "").trim(); return id ? requiredId(id) : undefined; }
function entityKind(value: unknown): "character" | "scene" | "prop" { const kind = String(value || "").toLowerCase().replace(/s$/, "").replace("full_body", "character").replace("head_shot", "character"); if (kind === "character" || kind === "scene" || kind === "prop") return kind; throw new Error(`不支持的资产类型：${value}`); }
function collection(kind: "character" | "scene" | "prop") { return kind === "character" ? "characters" as const : kind === "scene" ? "scenes" as const : "props" as const; }
function objectValue(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
function stringRecord(value: unknown) { return Object.fromEntries(Object.entries(objectValue(value)).filter(([, item]) => typeof item === "string")) as Record<string, string>; }
function boundedCount(value: unknown) { const count = Number(value); return Math.max(1, Math.min(3, Number.isFinite(count) ? Math.floor(count) : 1)); }
function optionalVersion(value: unknown) { const version = Number(value); return Number.isInteger(version) && version > 0 ? version : undefined; }
function boundedLimit(value: unknown, fallback: number) { const limit = Number(value); return Number.isInteger(limit) ? Math.max(1, Math.min(100, limit)) : fallback; }
function boundedText(value: unknown, label: string, maximum: number) { const text = String(value ?? ""); if (!text.trim()) throw new Error(`${label} 不能为空`); if (text.length > maximum) throw new Error(`${label} 超过 ${maximum} 字符`); return text; }
function optionalText(value: unknown, maximum: number) { const text = String(value ?? ""); if (!text) return undefined; if (text.length > maximum) throw new Error(`文本超过 ${maximum} 字符`); return text; }
function optionalTemplateKey(value: unknown) { const key = String(value || "").trim(); if (!key) return undefined; if (!/^[a-z0-9._-]{1,100}$/.test(key)) throw new Error("templateKey 无效"); return key; }
function promptOperation(value: unknown): StudioPromptOperation { const operation = String(value || "") as StudioPromptOperation; if (!(operation in STUDIO_PROMPT_TEMPLATE_MAP)) throw new Error(`不支持的 Studio Prompt 操作：${value}`); return operation; }
function decodePresetVoice(value: string) { const parts = value.split("."); if ((parts[0] === "design" || parts[0] === "clone") && parts[1]) { try { return Buffer.from(parts[1], "base64url").toString("utf8"); } catch {} } return value; }

function promptRuntimeOptions(raw: any, operation: "storyboard_polish" | "video_polish" | "r2v_polish", frameId?: string) {
  const references = promptResourceReferences(raw);
  return {
    operation,
    ...(frameId ? { frameId } : {}),
    feedback: String(raw?.feedback || "").slice(0, 100_000) || undefined,
    prevCn: String(raw?.prev_cn || raw?.previous_cn || "").slice(0, 100_000) || undefined,
    targetDurationSeconds: boundedDuration(raw?.duration || raw?.target_duration_seconds),
    orderedResourceIds: references.map((reference) => reference.resourceId),
    resourceRoles: references,
    requestedModel: String(raw?.polish_model || raw?.model || "").slice(0, 100) || undefined,
  };
}

function promptResourceReferences(raw: any) {
  const references: Array<{ resourceId: string; role: string }> = [];
  const add = (value: unknown, role: unknown) => {
    const resourceId = resourceIdFromValue(value);
    if (resourceId && !references.some((reference) => reference.resourceId === resourceId)) references.push({ resourceId, role: String(role || "reference").slice(0, 80) });
  };
  for (const id of stringArray(raw?.ordered_resource_ids || raw?.resource_ids || raw?.image_resource_ids)) add(id, "reference");
  for (const url of stringArray(raw?.image_urls)) add(url, "visual-reference");
  for (const slot of Array.isArray(raw?.slots) ? raw.slots : []) {
    const value = objectValue(slot);
    add(value.resource_id || value.resourceId || value.url || value.image_url || value.video_url || value.audio_url, value.role || value.type || value.name || "r2v-reference");
  }
  for (const item of Array.isArray(raw?.resource_roles) ? raw.resource_roles : []) {
    const value = objectValue(item);
    add(value.resource_id || value.resourceId, value.role);
  }
  return references.slice(0, 16);
}

function resourceIdFromValue(value: unknown) {
  const text = String(value || "").trim();
  const fromUrl = text.match(/\/files\/by-id\/([A-Za-z0-9_-]{1,80})/)?.[1];
  const id = fromUrl || text;
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : undefined;
}

function boundedDuration(value: unknown) {
  const duration = Number(value);
  return Number.isFinite(duration) ? Math.max(3, Math.min(15, Math.round(duration))) : undefined;
}

async function legacyPromptDefaults() {
  return Object.fromEntries(await Promise.all(Object.entries(STUDIO_PROMPT_TEMPLATE_MAP).map(async ([operation, templateKey]) => [operation, (await getPromptTemplate(templateKey)).systemPrompt])));
}

async function storeUpload(request: Request) {
  if (!request.file) throw new Error("没有收到上传文件");
  const extension = path.extname(request.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || extensionForMime(request.file.mimetype);
  const stored = await writeGenerated("canvas", extension.replace(/^\./, "") || "bin", request.file.buffer);
  return addResource({ id: stored.id, name: request.file.originalname.slice(0, 180), type: typeFromMime(request.file.mimetype), mimeType: request.file.mimetype || "application/octet-stream", size: await fileSize(stored.target), fileName: stored.fileName, createdAt: new Date().toISOString(), source: "upload", metadata: { importedBy: "video-workshop" } });
}
function extensionForMime(mime: string) { return ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "audio/mpeg": ".mp3", "audio/wav": ".wav", "video/mp4": ".mp4" } as Record<string, string>)[mime] || ".bin"; }

async function attachEntityResource(projectId: string, kind: "character" | "scene" | "prop", entityId: string, resource: Awaited<ReturnType<typeof storeUpload>>, originClientId: string) {
  const variant = { id: randomUUID(), url: resource.url, resource_id: resource.id, created_at: Date.now() / 1000 };
  return mutateStudioProject(projectId, (state) => ({ ...state, [collection(kind)]: state[collection(kind)].map((entity) => entity.id === entityId ? { ...entity, image_url: resource.url, image_asset: { selected_id: variant.id, variants: [...(entity.image_asset?.variants || []), variant] }, status: "ready" } : entity) }), { originClientId });
}
async function attachFrameResource(projectId: string, frameId: string, resource: Awaited<ReturnType<typeof storeUpload>>, originClientId: string) {
  const variant = { id: randomUUID(), url: resource.url, resource_id: resource.id, created_at: Date.now() / 1000 };
  return mutateStudioProject(projectId, (state) => ({ ...state, frames: state.frames.map((frame) => frame.id === frameId ? { ...frame, image_url: resource.url, image_asset: { selected_id: variant.id, variants: [...(frame.image_asset?.variants || []), variant] }, status: "ready" } : frame) }), { originClientId });
}
async function setEntityImageUrl(projectId: string, raw: any, originClientId: string) {
  const kind = entityKind(raw?.asset_type); const entityId = requiredId(raw?.asset_id); const url = String(raw?.image_url || "");
  return patchStudioEntity(projectId, kind, entityId, { image_url: url }, originClientId);
}
async function mutateEntityVariant(projectId: string, raw: any, action: "select" | "delete" | "favorite", originClientId: string) {
  const kind = entityKind(raw?.asset_type); const entityId = requiredId(raw?.asset_id); const variantId = requiredId(raw?.variant_id);
  return mutateStudioProject(projectId, (state) => ({ ...state, [collection(kind)]: state[collection(kind)].map((entity) => {
    if (entity.id !== entityId || !entity.image_asset) return entity;
    const variants = action === "delete" ? entity.image_asset.variants.filter((variant) => variant.id !== variantId) : entity.image_asset.variants.map((variant) => action === "favorite" && variant.id === variantId ? { ...variant, is_favorited: Boolean(raw?.is_favorited) } : variant);
    const selectedId = action === "select" ? variantId : entity.image_asset.selected_id === variantId && action === "delete" ? variants.at(-1)?.id || null : entity.image_asset.selected_id;
    const selected = variants.find((variant) => variant.id === selectedId);
    return { ...entity, image_asset: { selected_id: selectedId, variants }, image_url: selected?.url || entity.image_url };
  }) }), { originClientId });
}
async function generateMissingAssets(projectId: string, originClientId: string) {
  let current: any = await getStudioProject(projectId);
  for (const [kind, entities] of [["character", current.characters], ["scene", current.scenes], ["prop", current.props]] as const) for (const entity of entities || []) {
    if (!entity.image_url) current = await generateStudioAsset(projectId, { asset_id: entity.id, asset_type: kind, prompt: entity.description || entity.name, batch_size: 1, model_name: models.image[0] }, originClientId);
  }
  return current;
}
async function runStudioStage(projectId: string, stage: string, originClientId: string) {
  let project: any = await getStudioProject(projectId);
  if (stage === "extract_entities") return extractStudioEntities(projectId, project.original_text || "", originClientId);
  if (stage === "analyze_art_direction") return analyzeStudioArtDirection(projectId, project.original_text || "", originClientId);
  if (stage === "analyze_storyboard") return analyzeStudioStoryboard(projectId, project.original_text || "", originClientId);
  if (stage === "generate_assets") return generateMissingAssets(projectId, originClientId);
  if (stage === "render_storyboard") {
    for (const frame of project.frames || []) if (!frame.image_url) project = await renderStudioFrame(projectId, { frame_id: frame.id, prompt: frame.prompt, batch_size: 1 }, originClientId);
    return project;
  }
  if (stage === "generate_videos") {
    for (const frame of project.frames || []) if (!project.video_tasks?.some((task: any) => task.frame_id === frame.id && task.status === "completed")) project = await createStudioVideoTasks(projectId, { frame_id: frame.id, image_url: frame.image_url || "", prompt: frame.prompt, duration: frame.duration || 6, batch_size: 1 }, originClientId);
    return project;
  }
  if (stage === "generate_audio") {
    for (const frame of project.frames || []) if ((frame.dialogue || frame.dialogue_structured) && !frame.audio_resource_id) project = await generateStudioFrameAudio(projectId, frame.id, {}, originClientId);
    return project;
  }
  if (stage === "merge") return mergeStudioProject(projectId, originClientId);
  throw new Error(`不支持的 Studio 阶段：${stage}`);
}
async function mutateVideoTask(projectId: string, taskId: string, patch: Record<string, unknown>, originClientId: string) {
  const response = await mutateStudioProject(projectId, (state) => ({ ...state, videoTasks: state.videoTasks.map((task) => task.id === taskId ? { ...task, ...patch, ...(patch.clear_label ? { label: null } : {}) } : task) }), { originClientId });
  return response.video_tasks.find((task: any) => task.id === taskId);
}
async function findVideoTask(taskId: string) {
  for (const summary of await listProjects()) { const project = await readProject(String(summary!.id)).catch(() => null) as any; const task = project?.studio?.videoTasks?.find((item: any) => item.id === taskId); if (task) return task; }
  throw new Error(`任务不存在：${taskId}`);
}
function libraryResponse(resources: Awaited<ReturnType<typeof listResources>>) {
  const result: Record<string, any[]> = { characters: [], scenes: [], props: [] };
  for (const resource of resources.filter((item) => item.type === "image")) { const type = String(resource.metadata?.studioAssetType || "props"); const key = type.startsWith("character") ? "characters" : type.startsWith("scene") ? "scenes" : "props"; result[key].push({ id: resource.id, name: resource.name, description: String(resource.metadata?.description || ""), image_url: resource.url, resource_id: resource.id, source: "library" }); }
  return result;
}
async function createLibraryAsset(raw: any) {
  const kind = entityKind(raw?.asset_type);
  let resource = await resourceFromUrl(String(raw?.image_url || ""));
  if (!resource) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="100%" height="100%" fill="#171717"/><text x="50%" y="50%" fill="#a3a3a3" font-family="sans-serif" font-size="52" text-anchor="middle">${escapeXml(String(raw?.name || "本地素材"))}</text></svg>`;
    const stored = await writeGenerated("canvas", "svg", Buffer.from(svg));
    resource = await addResource({ id: stored.id, name: `${String(raw?.name || "本地素材")}.svg`, type: "image", mimeType: "image/svg+xml", size: await fileSize(stored.target), fileName: stored.fileName, createdAt: new Date().toISOString(), source: "upload", metadata: { importedBy: "video-workshop" } });
  }
  resource = await updateResource(resource.id, { name: String(raw?.name || resource.name), metadata: { ...(resource.metadata || {}), studioAssetType: kind, description: String(raw?.description || ""), persona: String(raw?.persona || ""), voiceId: String(raw?.voice_id || "") } });
  return libraryAssetResponse(resource, kind);
}
async function updateLibraryAsset(assetType: string, assetId: string, raw: any) {
  const resource = await resourceById(assetId); if (!resource) throw new Error("本地素材不存在");
  const updated = await updateResource(assetId, { name: raw?.name ? String(raw.name) : undefined, metadata: { ...(resource.metadata || {}), studioAssetType: entityKind(assetType), ...(raw?.description !== undefined ? { description: String(raw.description) } : {}), ...(raw?.persona !== undefined ? { persona: String(raw.persona) } : {}), ...(raw?.voice_id !== undefined ? { voiceId: String(raw.voice_id) } : {}), ...(raw?.starred !== undefined ? { starred: Boolean(raw.starred) } : {}), ...(raw?.locked !== undefined ? { locked: Boolean(raw.locked) } : {}) } });
  return libraryAssetResponse(updated, entityKind(assetType));
}
async function promoteLibraryAsset(raw: any) {
  const source = await getStudioBackedProject(requiredId(raw?.source_id)); const kind = entityKind(raw?.asset_type); const entity = source.studio[collection(kind)].find((item) => item.id === String(raw?.asset_id)); if (!entity) throw new Error("来源资产不存在");
  const variant = entity.image_asset?.variants.find((item) => item.id === entity.image_asset?.selected_id) || entity.image_asset?.variants.at(-1);
  const resource = variant?.resource_id ? await resourceById(variant.resource_id) : await resourceFromUrl(String(entity.image_url || "")); if (!resource) throw new Error("来源资产尚未进入 Croco 本地素材库");
  const updated = await updateResource(resource.id, { name: entity.name, metadata: { ...(resource.metadata || {}), studioAssetType: kind, description: entity.description, promotedFrom: { kind: raw?.source_kind, id: raw?.source_id, assetId: entity.id } } });
  return libraryAssetResponse(updated, kind);
}
async function resourceFromUrl(url: string) { const match = url.match(/\/files\/by-id\/([A-Za-z0-9_-]+)/); return match ? resourceById(match[1]) : undefined; }
function libraryAssetResponse(resource: Awaited<ReturnType<typeof resourceById>> & {}, requestedKind?: "character" | "scene" | "prop") { const kind = requestedKind || entityKind(resource.metadata?.studioAssetType || "prop"); return { id: resource.id, name: resource.name, description: String(resource.metadata?.description || ""), persona: String(resource.metadata?.persona || ""), voice_id: String(resource.metadata?.voiceId || ""), image_url: resource.url, resource_id: resource.id, starred: Boolean(resource.metadata?.starred), locked: Boolean(resource.metadata?.locked), asset_type: kind }; }
function escapeXml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]!)); }
function textToTiptap(text: string) { return { type: "doc", content: text.split(/\n{2,}/).filter(Boolean).map((paragraph) => ({ type: "paragraph", content: [{ type: "text", text: paragraph }] })) }; }
function tiptapText(value: any): string { if (typeof value?.text === "string") return value.text; if (Array.isArray(value?.content)) return value.content.map(tiptapText).filter(Boolean).join(value.type === "doc" ? "\n\n" : ""); return ""; }
