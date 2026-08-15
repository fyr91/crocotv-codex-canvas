import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { listCharacters } from "./characters";
import { createStudioProject, deleteStudioProject, getStudioBackedProject, listStudioProjectResponses, mutateStudioProject, studioProjectResponse } from "./studio-commands";
import { applyStudioDub, createStudioEntity, deleteStudioEntity, extractStudioLastFrame, patchStudioEntity, polishStudioText, previewStudioDub, previewStudioVoice, queueStudioAssetVideo, revertStudioDub, selectStudioVideo } from "./studio-workflow";
import { listProjects, readProject } from "./storage";

export const studioCompatRouter = Router();

studioCompatRouter.post("/series", route(async (request, response) => {
  const created = await createStudioProject({ title: String(request.body?.title || "未命名系列"), text: "", workflow_mode: request.body?.workflow_mode === "i2v_legacy" ? "i2v_legacy" : "r2v" }, clientId(request));
  await mutateStudioProject(created.id, (state) => ({ ...state, projectKind: "series", metadata: { ...state.metadata, description: String(request.body?.description || ""), defaultGenerationMode: request.body?.default_generation_mode || "r2v", episodeIds: [] } }), { originClientId: clientId(request) });
  response.status(201).json(await seriesResponse(created.id));
}));
studioCompatRouter.get("/series", route(async (_request, response) => response.json(await Promise.all((await listStudioProjectResponses({ kind: "series" })).map((series) => seriesResponse(series.id))))));
studioCompatRouter.get("/series/:seriesId", route(async (request, response) => response.json(await seriesResponse(param(request.params.seriesId)))));
studioCompatRouter.put("/series/:seriesId", route(async (request, response) => {
  const id = param(request.params.seriesId);
  await mutateStudioProject(id, (state) => ({ ...state,
    ...(request.body?.workflow_mode ? { workflowMode: request.body.workflow_mode } : {}),
    ...(request.body?.art_direction !== undefined ? { artDirection: request.body.art_direction || undefined } : {}),
    metadata: { ...state.metadata, ...objectValue(request.body), description: request.body?.description ?? state.metadata.description },
  }), { title: request.body?.title ? String(request.body.title) : undefined, originClientId: clientId(request) });
  response.json(await seriesResponse(id));
}));
studioCompatRouter.delete("/series/:seriesId", route(async (request, response) => { await deleteStudioProject(param(request.params.seriesId)); response.status(204).end(); }));

studioCompatRouter.get("/series/:seriesId/episodes", route(async (request, response) => response.json(await seriesEpisodes(param(request.params.seriesId)))));
studioCompatRouter.post("/series/:seriesId/episodes", route(async (request, response) => {
  const seriesId = param(request.params.seriesId); const projectId = requiredId(request.body?.script_id);
  await mutateStudioProject(projectId, (state) => ({ ...state, seriesId, episodeNumber: positiveInt(request.body?.episode_number) }), { originClientId: clientId(request) });
  response.json(await seriesEpisodes(seriesId));
}));
studioCompatRouter.delete("/series/:seriesId/episodes/:projectId", route(async (request, response) => {
  await mutateStudioProject(param(request.params.projectId), (state) => { const { seriesId: _series, episodeNumber: _number, ...rest } = state; return rest as typeof state; }, { originClientId: clientId(request) });
  response.json({ removed: true });
}));
studioCompatRouter.get("/series/:seriesId/assets", route(async (request, response) => { const state = (await getStudioBackedProject(param(request.params.seriesId))).studio; response.json({ characters: state.characters, scenes: state.scenes, props: state.props }); }));
for (const [pathName, kind] of [["characters", "character"], ["scenes", "scene"], ["props", "prop"]] as const) {
  studioCompatRouter.post(`/series/:seriesId/${pathName}`, route(async (request, response) => response.json(await createStudioEntity(param(request.params.seriesId), kind, request.body, clientId(request)))));
}
studioCompatRouter.post("/series/:seriesId/assets/toggle_starred", route(async (request, response) => { const id = param(request.params.seriesId); const kind = singularAsset(request.body?.asset_type); const project = await getStudioBackedProject(id); const entity = project.studio[collection(kind)].find((item) => item.id === String(request.body?.asset_id)); response.json(await patchStudioEntity(id, kind, requiredId(request.body?.asset_id), { starred: !entity?.starred }, clientId(request))); }));
studioCompatRouter.post("/series/:seriesId/assets/import", route(async (request, response) => {
  const source = await getStudioBackedProject(requiredId(request.body?.source_series_id)); const ids = new Set(stringArray(request.body?.asset_ids));
  const id = param(request.params.seriesId);
  await mutateStudioProject(id, (state) => ({ ...state, characters: mergeEntities(state.characters, source.studio.characters.filter((item) => ids.has(item.id))), scenes: mergeEntities(state.scenes, source.studio.scenes.filter((item) => ids.has(item.id))), props: mergeEntities(state.props, source.studio.props.filter((item) => ids.has(item.id))) }), { originClientId: clientId(request) });
  response.json(await seriesResponse(id));
}));
studioCompatRouter.get("/series/:seriesId/prompt_config", route(async (request, response) => response.json((await getStudioBackedProject(param(request.params.seriesId))).studio.promptConfig)));
studioCompatRouter.put("/series/:seriesId/prompt_config", route(async (request, response) => response.json(await mutateStudioProject(param(request.params.seriesId), (state) => ({ ...state, promptConfig: { ...state.promptConfig, ...stringRecord(request.body) } }), { originClientId: clientId(request) }))));
studioCompatRouter.get("/series/:seriesId/model_settings", route(async (request, response) => response.json((await getStudioBackedProject(param(request.params.seriesId))).studio.modelSettings)));
studioCompatRouter.put("/series/:seriesId/model_settings", route(async (request, response) => response.json(await mutateStudioProject(param(request.params.seriesId), (state) => ({ ...state, modelSettings: { ...state.modelSettings, ...objectValue(request.body) } }), { originClientId: clientId(request) }))));

studioCompatRouter.get("/series/:seriesId/custom_voices", route(async (request, response) => response.json(customVoices((await getStudioBackedProject(param(request.params.seriesId))).studio.metadata))));
studioCompatRouter.delete("/series/:seriesId/custom_voices/:voiceId", route(async (request, response) => {
  const id = param(request.params.seriesId); const voiceId = param(request.params.voiceId);
  await mutateStudioProject(id, (state) => ({ ...state, metadata: { ...state.metadata, customVoices: customVoices(state.metadata).filter((voice) => voice.id !== voiceId) } }), { originClientId: clientId(request) });
  response.json({ removed: true });
}));
studioCompatRouter.post("/voice/design/accept", route(async (request, response) => {
  const id = requiredId(request.body?.series_id); const voiceId = String(request.body?.voice_id || `design.${Buffer.from((await firstVoice()).voiceId).toString("base64url")}.${randomUUID()}`); const voice = { id: voiceId, label: String(request.body?.label || "自定义音色"), origin: "design", target_model: "volcengine:seed-tts-2.0-expressive", family: "cosyvoice", created_at: Date.now() / 1000, voice_prompt: String(request.body?.voice_prompt || ""), base_voice_id: decodePresetVoice(voiceId) };
  await mutateStudioProject(id, (state) => ({ ...state, metadata: { ...state.metadata, customVoices: [...customVoices(state.metadata).filter((item) => item.id !== voice.id), voice] } }), { originClientId: clientId(request) });
  response.json(voice);
}));
studioCompatRouter.post("/voice/clone", route(async (request, response) => {
  const id = requiredId(request.body?.series_id); const base = await firstVoice(); const voice = { id: `clone.${Buffer.from(base.voiceId).toString("base64url")}.${randomUUID()}`, label: String(request.body?.label || "复刻音色"), origin: "clone", target_model: "volcengine:seed-tts-2.0-expressive", family: "cosyvoice", created_at: Date.now() / 1000, source_audio_url: String(request.body?.audio_url || ""), base_voice_id: base.voiceId };
  await mutateStudioProject(id, (state) => ({ ...state, metadata: { ...state.metadata, customVoices: [...customVoices(state.metadata), voice] } }), { originClientId: clientId(request) });
  response.json(voice);
}));
studioCompatRouter.post("/voice/preview", route(async (request, response) => response.json(await previewStudioVoice(requiredId(request.body?.project_id), decodePresetVoice(String(request.body?.voice_id || "")), String(request.body?.text || "音色试听"), String(request.body?.instructions || ""), clientId(request)))));
studioCompatRouter.post("/voice/design/preview", route(async (request, response) => {
  const base = await firstVoice(); const voiceId = `design.${Buffer.from(base.voiceId).toString("base64url")}.${randomUUID()}`;
  const preview = await previewStudioVoice(requiredId(request.body?.project_id), base.voiceId, String(request.body?.preview_text || "你好，这是一段音色测试。"), String(request.body?.voice_prompt || ""), clientId(request));
  response.json({ voice_id: voiceId, preview_url: preview.url, target_model: "volcengine:seed-tts-2.0-expressive" });
}));
studioCompatRouter.post("/voice/design/translate", route(async (request, response) => { const result = await polishStudioText(requiredId(request.body?.project_id), `把下面角色描述改写为简洁的配音表演指导：${String(request.body?.description || "")}`, clientId(request)); response.json({ voice_prompt: result.prompt_cn }); }));

studioCompatRouter.get("/projects/:id/previous_episode", projectRoute(async (_request, response, id) => {
  const current = await getStudioBackedProject(id); const previous = (await seriesEpisodes(current.studio.seriesId || "")).filter((item: any) => Number(item.episode_number) < Number(current.studio.episodeNumber || Infinity)).at(-1);
  response.json(previous ? { has_previous: true, previous_episode_id: previous.id, previous_episode_title: previous.title, raw_snippet: String(previous.original_text || "").slice(-1200), ai_summary: previous.last_episode_summary || null, ai_summary_stale: false, last_frames: (previous.frames || []).slice(-6).map((frame: any) => ({ id: frame.id, action_description: frame.prompt || frame.action_description || "", thumbnail_url: frame.image_url || null, video_url: frame.video_url || null })) } : { has_previous: false, previous_episode_id: null, previous_episode_title: null, raw_snippet: "", ai_summary: null, ai_summary_stale: false, last_frames: [] });
}));
studioCompatRouter.post("/projects/:id/previous_episode/summary", projectRoute(async (_request, response, id) => {
  const current = await getStudioBackedProject(id); const previous = (await seriesEpisodes(current.studio.seriesId || "")).filter((item: any) => Number(item.episode_number) < Number(current.studio.episodeNumber || Infinity)).at(-1);
  const summary = previous ? String(previous.original_text || "").slice(0, 600) : "";
  response.json({ ai_summary: summary, ai_summary_stale: false, previous_episode_id: previous?.id || "", previous_episode_title: previous?.title || "" });
}));
studioCompatRouter.get("/projects/:id/reconcile/suggestions", projectRoute(async (_request, response, id) => response.json(await reconcileSuggestions(id))));
studioCompatRouter.post("/projects/:id/reconcile/apply", projectRoute(async (request, response, id) => response.json(await applyReconcile(id, objectValue(request.body), clientId(request)))));
studioCompatRouter.get("/projects/:id/next_hook", projectRoute(async (_request, response, id) => { const project = await getStudioBackedProject(id); response.json({ has_text: Boolean(project.studio.originalText.trim()), hook: project.studio.nextHook || null, stale: false }); }));
studioCompatRouter.post("/projects/:id/next_hook", projectRoute(async (_request, response, id) => { const project = await getStudioBackedProject(id); const hook = project.studio.originalText.slice(-240); await mutateStudioProject(id, (state) => ({ ...state, nextHook: hook }), { originClientId: "studio-next-hook" }); response.json({ hook }); }));
studioCompatRouter.put("/projects/:id/next_hook", projectRoute(async (request, response, id) => response.json(await mutateStudioProject(id, (state) => ({ ...state, nextHook: request.body?.hook == null ? null : String(request.body.hook) }), { originClientId: clientId(request) }))));
studioCompatRouter.put("/projects/:id/last_episode_summary", projectRoute(async (request, response, id) => response.json(await mutateStudioProject(id, (state) => ({ ...state, lastEpisodeSummary: request.body?.ai_summary == null ? null : String(request.body.ai_summary) }), { originClientId: clientId(request) }))));
studioCompatRouter.get("/series/:seriesId/characters/:characterId/appearances", route(async (request, response) => { const series = await getStudioBackedProject(param(request.params.seriesId)); const episodes = await seriesEpisodes(param(request.params.seriesId)); const characterId = param(request.params.characterId); const character = series.studio.characters.find((item) => item.id === characterId); const appearances = episodes.filter((episode: any) => episode.characters?.some((item: any) => item.id === characterId || item.name === character?.name)).map((episode: any) => ({ episode_id: episode.id, episode_number: episode.episode_number || null, episode_title: episode.title, frame_count: (episode.frames || []).filter((frame: any) => frame.character_ids?.includes(characterId)).length })); response.json({ character: character || { id: characterId, name: "", persona: "", description: "" }, appearances, total_frames: appearances.reduce((sum: number, item: any) => sum + item.frame_count, 0) }); }));

studioCompatRouter.patch("/projects/:id/video_tasks/:taskId/annotate", projectRoute(async (request, response, id) => response.json(await mutateTask(id, param(request.params.taskId), request.body, clientId(request)))));
studioCompatRouter.post("/projects/:id/video_tasks/:taskId/cancel", projectRoute(async (request, response, id) => response.json(await mutateTask(id, param(request.params.taskId), { status: "failed", error: "用户取消" }, clientId(request)))));
studioCompatRouter.delete("/projects/:id/assets/:assetType/:assetId/videos/:videoId", projectRoute(async (request, response, id) => response.json(await removeAssetVideo(id, singularAsset(request.params.assetType), param(request.params.assetId), param(request.params.videoId), clientId(request)))));
studioCompatRouter.post("/projects/:id/assets/generate_motion_ref", projectRoute(async (request, response, id) => response.status(202).json(await queueStudioAssetVideo(id, { ...request.body, asset_type: singularAsset(request.body?.asset_type) }, clientId(request)))));
studioCompatRouter.post("/projects/:id/assets/:assetType/:assetId/generate_video", projectRoute(async (request, response, id) => response.status(202).json(await queueStudioAssetVideo(id, { ...request.body, asset_type: singularAsset(request.params.assetType), asset_id: param(request.params.assetId) }, clientId(request)))));
studioCompatRouter.post("/projects/:id/frames/:frameId/dub/preview", projectRoute(async (request, response, id) => response.json(await previewStudioDub(id, param(request.params.frameId), requiredId(request.body?.video_task_id), Number(request.body?.offset_ms || 0), clientId(request)))));
studioCompatRouter.post("/projects/:id/frames/:frameId/dub/apply", projectRoute(async (request, response, id) => response.json(await applyStudioDub(id, param(request.params.frameId), clientId(request)))));
studioCompatRouter.delete("/projects/:id/frames/:frameId/dub", projectRoute(async (request, response, id) => response.json(await revertStudioDub(id, param(request.params.frameId), clientId(request)))));
studioCompatRouter.post("/projects/:id/frames/:frameId/extract_last_frame", projectRoute(async (request, response, id) => response.json(await extractStudioLastFrame(id, param(request.params.frameId), requiredId(request.body?.video_task_id), clientId(request)))));

studioCompatRouter.post("/series/import/preview", route(async (_request, response) => response.json({ title: "导入系列", description: "", text: "", episodes: [] })));
studioCompatRouter.post("/series/import/confirm", route(async (request, response) => { const created = await createStudioProject({ title: String(request.body?.title || "导入系列"), text: "", workflow_mode: "r2v" }, clientId(request)); await mutateStudioProject(created.id, (state) => ({ ...state, projectKind: "series", metadata: { ...state.metadata, description: String(request.body?.description || "") } }), { originClientId: clientId(request) }); response.json(await seriesResponse(created.id)); }));

async function seriesResponse(id: string) {
  const project = await getStudioBackedProject(id); const state = project.studio;
  return { id, title: project.title, description: String(state.metadata.description || ""), characters: state.characters, scenes: state.scenes, props: state.props, art_direction: state.artDirection, prompt_config: state.promptConfig, model_settings: state.modelSettings, workflow_mode: state.workflowMode, default_generation_mode: state.metadata.defaultGenerationMode || "r2v", episode_ids: (await seriesEpisodes(id)).map((episode: any) => episode.id), created_at: Date.parse(project.createdAt) / 1000, updated_at: Date.parse(project.updatedAt) / 1000 };
}
async function seriesEpisodes(seriesId: string) { if (!seriesId) return []; return (await listStudioProjectResponses({ kind: "episode" })).filter((project: any) => project.series_id === seriesId).sort((a: any, b: any) => Number(a.episode_number || 0) - Number(b.episode_number || 0)); }
async function reconcileSuggestions(id: string) { const project = await getStudioBackedProject(id); if (!project.studio.seriesId) return { characters: [], scenes: [], props: [] }; const series = await getStudioBackedProject(project.studio.seriesId); const suggest = (local: any[], shared: any[]) => local.map((entity) => { const match = shared.find((item) => item.name === entity.name); return { local_id: entity.id, local_name: entity.name, suggested_series_id: match?.id || null, suggested_series_name: match?.name || null, confidence: match ? 100 : 0 }; }); return { characters: suggest(project.studio.characters, series.studio.characters), scenes: suggest(project.studio.scenes, series.studio.scenes), props: suggest(project.studio.props, series.studio.props) }; }
async function applyReconcile(id: string, raw: Record<string, any>, originClientId: string) {
  const episode = await getStudioBackedProject(id); if (!episode.studio.seriesId) throw new Error("项目未关联系列"); const seriesId = episode.studio.seriesId; const series = await getStudioBackedProject(seriesId);
  const nextSeries: Record<string, any[]> = { characters: [...series.studio.characters], scenes: [...series.studio.scenes], props: [...series.studio.props] };
  const replacements = new Map<string, any>();
  for (const key of ["characters", "scenes", "props"] as const) for (const decision of Array.isArray(raw[key]) ? raw[key] : []) {
    const local = episode.studio[key].find((item) => item.id === decision.local_id); if (!local || decision.action === "skip") continue;
    if (decision.action === "merge_into_series") { const target = nextSeries[key].find((item) => item.id === decision.target_series_id); if (target) replacements.set(`${key}:${local.id}`, target); }
    if (decision.action === "create_new_in_series") { const shared = { ...structuredClone(local), source: "series" }; nextSeries[key] = mergeEntities(nextSeries[key], [shared]); replacements.set(`${key}:${local.id}`, shared); }
  }
  await mutateStudioProject(seriesId, (state) => ({ ...state, characters: nextSeries.characters, scenes: nextSeries.scenes, props: nextSeries.props }), { originClientId });
  return mutateStudioProject(id, (state) => ({ ...state, characters: state.characters.map((item) => replacements.get(`characters:${item.id}`) || item), scenes: state.scenes.map((item) => replacements.get(`scenes:${item.id}`) || item), props: state.props.map((item) => replacements.get(`props:${item.id}`) || item) }), { originClientId });
}
async function mutateTask(id: string, taskId: string, patch: Record<string, unknown>, originClientId: string) { const result = await mutateStudioProject(id, (state) => ({ ...state, videoTasks: state.videoTasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) }), { originClientId }); return result.video_tasks.find((task: any) => task.id === taskId); }
async function removeAssetVideo(id: string, kind: "character" | "scene" | "prop", entityId: string, videoId: string, originClientId: string) { return mutateStudioProject(id, (state) => ({ ...state, [collection(kind)]: state[collection(kind)].map((entity) => entity.id === entityId ? { ...entity, video_assets: Array.isArray(entity.video_assets) ? entity.video_assets.filter((item: any) => item.id !== videoId) : [] } : entity) }), { originClientId }); }
async function patchFrameMeta(id: string, frameId: string, patch: Record<string, unknown>, originClientId: string) { return mutateStudioProject(id, (state) => ({ ...state, frames: state.frames.map((frame) => frame.id === frameId ? { ...frame, ...patch } : frame) }), { originClientId }); }
function route(handler: (request: Request, response: Response) => Promise<unknown>) { return (request: Request, response: Response, next: NextFunction) => void handler(request, response).catch(next); }
function projectRoute(handler: (request: Request, response: Response, id: string) => Promise<unknown>) { return route((request, response) => handler(request, response, param(request.params.id))); }
function clientId(request: Request) { return String(request.header("x-croco-client-id") || "studio-api").slice(0, 180); }
function param(value: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function requiredId(value: unknown) { const id = String(value || "").trim(); if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("ID 无效"); return id; }
function positiveInt(value: unknown) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : undefined; }
function objectValue(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
function stringRecord(value: unknown) { return Object.fromEntries(Object.entries(objectValue(value)).filter(([, item]) => typeof item === "string")) as Record<string, string>; }
function singular(value: string) { return value === "characters" ? "character" as const : value === "scenes" ? "scene" as const : "prop" as const; }
function singularAsset(value: unknown): "character" | "scene" | "prop" { const text = String(value || "").replace(/s$/, "").replace("full_body", "character").replace("head_shot", "character"); if (text === "character" || text === "scene" || text === "prop") return text; throw new Error(`资产类型无效：${value}`); }
function collection(kind: "character" | "scene" | "prop") { return kind === "character" ? "characters" as const : kind === "scene" ? "scenes" as const : "props" as const; }
function mergeEntities<T extends { id: string }>(current: T[], incoming: T[]) { const map = new Map(current.map((item) => [item.id, item])); for (const item of incoming) map.set(item.id, structuredClone(item)); return [...map.values()]; }
function customVoices(metadata: Record<string, unknown>) { return Array.isArray(metadata.customVoices) ? metadata.customVoices as any[] : []; }
async function firstVoice() { const voice = (await listCharacters())[0]; if (!voice?.voiceId) throw new Error("本地没有可用音色，请先同步 pull characters"); return voice; }
function decodePresetVoice(value: string) { const parts = value.split("."); if ((parts[0] === "design" || parts[0] === "clone") && parts[1]) { try { return Buffer.from(parts[1], "base64url").toString("utf8"); } catch {} } return value; }
