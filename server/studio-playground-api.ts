import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import { Router, type NextFunction, type Request, type Response } from "express";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { avoidStudioNodeOverlaps } from "./studio-node-placement";
import { publishProjectUpdated } from "./canvas-events";
import { runCanvasConfigNodes } from "./canvas-node-runtime";
import { models } from "./providers";
import { createStudioProject, getStudioBackedProject, listStudioProjectResponses, mutateStudioProject } from "./studio-commands";
import { addResource, fileSize, readProject, resourceById, typeFromMime, writeGenerated } from "./storage";
import { cancelStudioGenerationJob, createStudioGenerationJob, findStudioGenerationJob } from "./studio-generation-jobs";

export const studioPlaygroundRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024, files: 1 } });

studioPlaygroundRouter.post("/playground/generate", route(async (request, response) => response.status(202).json(await queueGeneration(request.body, clientId(request)))));
studioPlaygroundRouter.get("/playground/history", route(async (request, response) => { const state = await playgroundState(); const offset = Math.max(0, Number(request.query.offset) || 0); const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 50)); response.json(state.history.slice(offset, offset + limit)); }));
studioPlaygroundRouter.get("/playground/history/:id", route(async (request, response) => response.json(requiredHistory(await playgroundState(), param(request.params.id)))));
studioPlaygroundRouter.get("/playground/history/:id/status", route(async (request, response) => { const item = requiredHistory(await playgroundState(), param(request.params.id)); response.json({ id: item.id, status: item.status, outputs: item.outputs, error: item.error }); }));
studioPlaygroundRouter.delete("/playground/history/:id", route(async (request, response) => { const id = param(request.params.id); const project = await playgroundProject(); const item = requiredHistory(readPlayground(project.studio.metadata), id); if (findStudioGenerationJob(id)) await cancelStudioGenerationJob(id); const current = await readProject(project.id) as any; const nodeIds = stringArray(item.canvas_node_ids).filter((nodeId) => current.nodes.some((node: any) => node.id === nodeId)); if (nodeIds.length) { const changed = await applyCanvasOperations(project.id, nodeIds.map((nodeId): CanvasOperation => ({ op: "delete_node", nodeId })), Number(current.version)); publishProjectUpdated(changed.project, clientId(request)); } await mutateStudioProject(project.id, (state) => ({ ...state, metadata: { ...state.metadata, playground: { ...readPlayground(state.metadata), history: readPlayground(state.metadata).history.filter((entry) => entry.id !== id) } } }), { originClientId: clientId(request) }); response.json({ removed: true }); }));
studioPlaygroundRouter.get("/playground/templates", route(async (_request, response) => response.json((await playgroundState()).templates)));
studioPlaygroundRouter.post("/playground/templates", route(async (request, response) => { const project = await playgroundProject(); const now = new Date().toISOString(); const template = { id: randomUUID(), name: String(request.body?.name || "未命名模板"), category: String(request.body?.category || "general"), prompt: String(request.body?.prompt || ""), negative_prompt: String(request.body?.negative_prompt || ""), default_mode: String(request.body?.default_mode || "t2i"), default_model_id: String(request.body?.default_model_id || ""), default_parameters: objectValue(request.body?.default_parameters), created_at: now, updated_at: now }; await mutateStudioProject(project.id, (state) => ({ ...state, metadata: { ...state.metadata, playground: { ...readPlayground(state.metadata), templates: [...readPlayground(state.metadata).templates, template] } } }), { originClientId: clientId(request) }); response.status(201).json(template); }));
studioPlaygroundRouter.put("/playground/templates/:id", route(async (request, response) => { const project = await playgroundProject(); const id = param(request.params.id); let updated: any; await mutateStudioProject(project.id, (state) => ({ ...state, metadata: { ...state.metadata, playground: { ...readPlayground(state.metadata), templates: readPlayground(state.metadata).templates.map((template) => template.id === id ? (updated = { ...template, ...objectValue(request.body), id, updated_at: new Date().toISOString() }) : template) } } }), { originClientId: clientId(request) }); if (!updated) throw new Error("创作台模板不存在"); response.json(updated); }));
studioPlaygroundRouter.delete("/playground/templates/:id", route(async (request, response) => { const project = await playgroundProject(); const id = param(request.params.id); await mutateStudioProject(project.id, (state) => ({ ...state, metadata: { ...state.metadata, playground: { ...readPlayground(state.metadata), templates: readPlayground(state.metadata).templates.filter((template) => template.id !== id) } } }), { originClientId: clientId(request) }); response.json({ removed: true }); }));
studioPlaygroundRouter.post("/playground/upload", upload.single("file"), route(async (request, response) => { const resource = await storeUpload(request); response.json({ path: resource.url, resource_id: resource.id }); }));

async function queueGeneration(raw: any, originClientId: string) {
  const project = await playgroundProject();
  const mode = String(raw?.mode || "t2i"); const generationMode = ["t2v", "i2v", "r2v", "v2v"].includes(mode) ? "video" : "image";
  const id = randomUUID(); const inputMedia = stringArray(raw?.input_media);
  for (const mediaUrl of inputMedia) if (!await resourceById(resourceIdFromUrl(mediaUrl))) throw new Error(`输入素材不在 Croco 本地资源库：${mediaUrl}`);
  const history = { id, mode, model_id: String(raw?.model_id || (generationMode === "video" ? "minimax-h3" : models.image[0])), prompt: String(raw?.prompt || ""), negative_prompt: String(raw?.negative_prompt || ""), input_media: inputMedia, parameters: objectValue(raw?.parameters), batch_size: boundedCount(raw?.batch_size), outputs: [], status: "pending", created_at: new Date().toISOString(), canvas_project_id: project.id, canvas_node_ids: [], generation_job_id: id };
  await mutateStudioProject(project.id, (state) => ({ ...state, metadata: { ...state.metadata, playground: { ...readPlayground(state.metadata), history: [history, ...readPlayground(state.metadata).history].slice(0, 500) } } }), { originClientId });
  try {
    await createStudioGenerationJob({
      id,
      projectId: project.id,
      operation: "playground",
      metadata: { mode, generationMode },
      execute: async ({ signal }) => {
        await processGeneration(project.id, id, raw, originClientId, signal);
        return { generationId: id };
      },
    });
  } catch (error) {
    await updateHistory(project.id, id, { status: "failed", error: error instanceof Error ? error.message : "创作台任务入队失败" }, originClientId);
    throw error;
  }
  return history;
}

async function processGeneration(projectId: string, id: string, raw: any, originClientId: string, signal: AbortSignal) {
  const mode = String(raw?.mode || "t2i"); const generationMode = ["t2v", "i2v", "r2v", "v2v"].includes(mode) ? "video" : "image";
  const configId = randomUUID(); const inputMedia = stringArray(raw?.input_media); const inputNodes: string[] = [];
  await updateHistory(projectId, id, { status: "processing" }, originClientId);
  try {
  signal.throwIfAborted();
  const current = await readProject(projectId) as any; const right = Math.max(160, ...current.nodes.map((node: any) => Number(node.position?.x || 0) + Number(node.width || 0)));
  const operations: CanvasOperation[] = [];
  for (const [index, mediaUrl] of inputMedia.entries()) {
    const resource = await resourceById(resourceIdFromUrl(mediaUrl)); if (!resource) throw new Error(`输入素材不在 Croco 本地资源库：${mediaUrl}`);
    const nodeId = randomUUID(); inputNodes.push(nodeId); operations.push({ op: "add_node", node: { id: nodeId, type: resource.type === "audio" ? "audio" : resource.type === "video" ? "video" : "image", title: `创作台参考 ${index + 1}`, position: { x: right + 96, y: 160 + index * 360 }, width: 340, height: resource.type === "audio" ? 180 : 300, metadata: { storageKey: resource.id, content: resource.url, mimeType: resource.mimeType, status: "success", artifactType: "studio-playground-input", playgroundGenerationId: id } } });
  }
  const prompt = `${String(raw?.prompt || "")}${inputNodes.map((nodeId) => `\n@[node:${nodeId}]`).join("")}`;
  operations.push({ op: "add_node", node: { id: configId, type: "config", title: `创作台 · ${mode}`, position: { x: right + 520, y: 160 }, width: 360, height: 390, metadata: { generationMode, model: generationMode === "video" ? "minimax-h3" : resolveImageModel(raw?.model_id), requestedModel: String(raw?.model_id || ""), composerContent: prompt, count: boundedCount(raw?.batch_size), videoCount: boundedCount(raw?.batch_size), seconds: Number(raw?.parameters?.duration) || 6, size: aspectSize(String(raw?.parameters?.aspect_ratio || raw?.parameters?.ratio || "1:1")), artifactType: "studio-playground-config", playgroundGenerationId: id, status: "idle" } } });
  for (const nodeId of inputNodes) operations.push({ op: "connect", from: nodeId, to: configId, fromPort: "workflow-output", toPort: "workflow-input" });
  const added = await applyCanvasOperations(projectId, avoidStudioNodeOverlaps(current.nodes, operations), Number(current.version)); publishProjectUpdated(added.project, originClientId);
  signal.throwIfAborted();
  await updateHistory(projectId, id, { canvas_node_ids: [configId, ...inputNodes] }, originClientId);
  const result = await runCanvasConfigNodes({ projectId, configNodeIds: [configId], concurrency: 1, originClientId, signal }); const run = result.results[0];
  const final = await readProject(projectId) as any; const outputNodes = (run?.outputNodeIds || []).map((nodeId) => final.nodes.find((node: any) => node.id === nodeId)).filter(Boolean);
  const patch = { outputs: outputNodes.map((node: any) => ({ id: node.id, media_path: String(node.metadata?.content || ""), media_type: generationMode, thumbnail_path: generationMode === "video" ? undefined : String(node.metadata?.content || "") })), status: run?.status === "success" ? "completed" : "failed", error: run?.error, canvas_node_ids: [configId, ...inputNodes, ...outputNodes.map((node: any) => node.id), ...(run?.toneNodeId ? [run.toneNodeId] : [])] };
  await updateHistory(projectId, id, patch, originClientId);
  if (run?.status !== "success") throw new Error(run?.error || "创作台生成失败");
  } catch (error) {
    await updateHistory(projectId, id, { status: "failed", error: error instanceof Error ? error.message : "创作台生成失败" }, originClientId).catch(() => undefined);
    throw error;
  }
}

async function updateHistory(projectId: string, id: string, patch: Record<string, unknown>, originClientId: string) {
  return mutateStudioProject(projectId, (state) => ({ ...state, metadata: { ...state.metadata, playground: { ...readPlayground(state.metadata), history: readPlayground(state.metadata).history.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) } } }), { originClientId });
}

async function playgroundProject() { const existing = (await listStudioProjectResponses({ kind: "playground" }))[0]; if (existing) return getStudioBackedProject(existing.id); const created = await createStudioProject({ title: "视频工坊 · 创作台", text: "", workflow_mode: "r2v" }, "studio-playground"); await mutateStudioProject(created.id, (state) => ({ ...state, projectKind: "playground", metadata: { ...state.metadata, playground: { history: [], templates: [] } } }), { originClientId: "studio-playground" }); return getStudioBackedProject(created.id); }
async function playgroundState() { return readPlayground((await playgroundProject()).studio.metadata); }
function readPlayground(metadata: Record<string, unknown>) { const value = objectValue(metadata.playground); return { history: Array.isArray(value.history) ? value.history as any[] : [], templates: Array.isArray(value.templates) ? value.templates as any[] : [] }; }
function requiredHistory(state: ReturnType<typeof readPlayground>, id: string) { const item = state.history.find((entry) => entry.id === id); if (!item) throw new Error("创作台记录不存在"); return item; }
function resolveImageModel(value: unknown) { const requested = String(value || ""); return models.image.includes(requested) ? requested : models.image[0]; }
function aspectSize(value: string) { return ({ "16:9": "1344x768", "9:16": "768x1344", "4:3": "1184x896", "3:4": "896x1184", "1:1": "1024x1024" } as Record<string, string>)[value] || "1024x1024"; }
function boundedCount(value: unknown) { const count = Number(value); return Math.max(1, Math.min(3, Number.isFinite(count) ? Math.floor(count) : 1)); }
function resourceIdFromUrl(value: unknown) { const match = String(value || "").match(/\/files\/by-id\/([A-Za-z0-9_-]+)/); if (!match) throw new Error("素材 URL 不是 Croco 本地资源"); return match[1]; }
async function storeUpload(request: Request) { if (!request.file) throw new Error("没有收到上传文件"); const extension = path.extname(request.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").replace(/^\./, "") || "bin"; const stored = await writeGenerated("canvas", extension, request.file.buffer); return addResource({ id: stored.id, name: request.file.originalname.slice(0, 180), type: typeFromMime(request.file.mimetype), mimeType: request.file.mimetype || "application/octet-stream", size: await fileSize(stored.target), fileName: stored.fileName, createdAt: new Date().toISOString(), source: "upload", metadata: { importedBy: "video-workshop-playground" } }); }
function route(handler: (request: Request, response: Response) => Promise<unknown>) { return (request: Request, response: Response, next: NextFunction) => void handler(request, response).catch(next); }
function clientId(request: Request) { return String(request.header("x-croco-client-id") || "studio-playground").slice(0, 180); }
function param(value: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function objectValue(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
