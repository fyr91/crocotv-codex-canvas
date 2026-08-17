import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { addResource, createProject, dataDir, ensureStorage, fileSize, listProjects, listResources, readProject, renameProject, resourceById, resourcesDir, safeResourcePath, saveProject, trashProject, trashResource, typeFromMime, updateResource } from "./storage";
import { resourceThumbnail, thumbnailSize } from "./thumbnails";
import { generateH3Video, generateImage, generateMusic, generateText, models } from "./providers";
import { prepareH3Prompt } from "./h3-prompt";
import { generateSpeech, type SpeechGenerationProgress } from "./speech";
import { listCharacters, syncCharacters } from "./characters";
import { startSunoCallbackService, sunoCallbackState } from "./suno-callback";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { openProjectEventStream, publishProjectUpdated } from "./canvas-events";
import { runCanvasConfigNodes } from "./canvas-node-runtime";
import { cancelCanvasRunJob, createCanvasRerunJob, createCanvasRunJob, getCanvasRunJob, initializeCanvasRunJobs, recoverInterruptedCanvasRuns } from "./canvas-run-jobs";
import { initializeStudioGenerationJobs } from "./studio-generation-jobs";
import { verifyCanvasVideoAsr } from "./canvas-asr-runtime";
import { mergeCanvasVideos, recordCanvasVisualReview, useCanvasVideoFrames } from "./canvas-video-tools";
import { relayoutCanvasShotColumns, upsertCanvasShotColumn } from "./canvas-shot-columns";
import { suiteCompatibility } from "./version";
import { studioApiRouter } from "./studio-api";
import { recoverInterruptedStudioGenerations } from "./studio-workflow";
import { openAppThemeEventStream, parseAppTheme, readAppThemePreference, updateAppThemePreference } from "./app-preferences";

await ensureStorage();
await initializeCanvasRunJobs();
await initializeStudioGenerationJobs();
await recoverInterruptedCanvasRuns();
await recoverInterruptedStudioGenerations();

const app = express();
const port = Number(process.env.LOCAL_API_PORT || 4399);
const uploadTemp = path.join(dataDir, ".uploads");
await mkdir(uploadTemp, { recursive: true });
const upload = multer({ dest: uploadTemp, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

app.use(cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"] }));
app.use(express.json({ limit: "10mb" }));
app.use("/api/studio", studioApiRouter);

app.get("/api/status", (_request, response) => response.json({
  version: suiteCompatibility.components.crocoTV,
  suiteVersion: suiteCompatibility.suiteVersion,
  contracts: suiteCompatibility.contracts,
  dataDir,
  providers: {
    codingPlan: Boolean(process.env.CODING_PLAN_API_KEY),
    volcengine: Boolean(process.env.ARK_API_KEY),
    bigmodel: Boolean(process.env.BIGMODEL_API_KEY),
    runware: Boolean(process.env.RUNWARE_API_KEY),
    speech: Boolean(process.env.ARK_API_KEY && process.env.DOUBAO_TTS_API_KEY && process.env.DOUBAO_TTS_RESOURCE_ID),
    h3: Boolean(process.env.H3_BASE_URL && process.env.H3_API_KEY),
    asr: Boolean(process.env.CODING_PLAN_API_KEY),
    suno: Boolean(process.env.SUNO_API_KEY && sunoCallbackState() !== "error"),
  },
  sunoCallback: sunoCallbackState(),
  models,
}));
app.get("/api/preferences/theme", asyncHandler(async (_request, response) => response.json(await readAppThemePreference())));
app.put("/api/preferences/theme", asyncHandler(async (request, response) => response.json(await updateAppThemePreference(
  parseAppTheme(request.body?.theme),
  request.body?.initializeOnly === true,
))));
app.get("/api/preferences/events", asyncHandler(async (_request, response) => openAppThemeEventStream(response)));
app.get("/brand/favicon.png", (_request, response) => response.sendFile(path.resolve("web/public/favicon.png")));

app.get("/api/projects", asyncHandler(async (_request, response) => response.json(await listProjects())));
app.post("/api/projects", asyncHandler(async (request, response) => {
  const project = await createProject(request.body?.title || request.body?.name, request.body?.id);
  publishProjectUpdated(project, clientId(request));
  response.status(201).json(project);
}));
app.get("/api/projects/:id", asyncHandler(async (request, response) => response.json(await readProject(param(request.params.id)))));
app.post("/api/canvas/projects/:id/nodes/query", asyncHandler(async (request, response) => {
  const project = await readProject(param(request.params.id)) as { version?: number; nodes?: Array<{ id: string; type: string; metadata?: Record<string, unknown> }> };
  const ids = new Set(Array.isArray(request.body?.nodeIds) ? request.body.nodeIds.map(String) : []);
  const types = new Set(Array.isArray(request.body?.types) ? request.body.types.map(String) : []);
  const artifactTypes = new Set(Array.isArray(request.body?.artifactTypes) ? request.body.artifactTypes.map(String) : []);
  const stages = new Set(Array.isArray(request.body?.stages) ? request.body.stages.map(String) : []);
  const nodes = (project.nodes || []).filter((node) => (!ids.size || ids.has(node.id)) && (!types.size || types.has(node.type)) && (!artifactTypes.size || artifactTypes.has(String(node.metadata?.artifactType || ""))) && (!stages.size || stages.has(String(node.metadata?.stage || ""))));
  response.json({ projectId: param(request.params.id), projectVersion: project.version, nodes });
}));
app.get("/api/projects/:id/events", (request, response) => openProjectEventStream(param(request.params.id), response));
app.put("/api/projects/:id", asyncHandler(async (request, response) => {
  const project = await saveProject(param(request.params.id), request.body, optionalVersion(request.body?.version));
  publishProjectUpdated(project, clientId(request));
  response.json(project);
}));
app.put("/api/projects/:id/name", asyncHandler(async (request, response) => {
  const project = await renameProject(param(request.params.id), request.body?.name);
  publishProjectUpdated(project, clientId(request));
  response.json(project);
}));
app.delete("/api/projects/:id", asyncHandler(async (request, response) => { await trashProject(param(request.params.id)); response.status(204).end(); }));
app.post("/api/canvas/projects/:id/operations", asyncHandler(async (request, response) => {
  const result = await applyCanvasOperations(param(request.params.id), Array.isArray(request.body?.operations) ? request.body.operations as CanvasOperation[] : [], optionalVersion(request.body?.expectedVersion));
  publishProjectUpdated(result.project, clientId(request) || "mcp");
  response.json(result);
}));
app.post("/api/canvas/projects/:id/shot-columns/layout", asyncHandler(async (request, response) => response.json(await relayoutCanvasShotColumns({
  projectId: param(request.params.id),
  factoryRunId: requiredText(request.body?.factoryRunId, "factoryRunId"),
  shotIds: Array.isArray(request.body?.shotIds) ? request.body.shotIds.map(String) : undefined,
  layout: request.body?.layout,
  originClientId: clientId(request) || "canvas-shot-column-layout",
}))));
app.post("/api/canvas/projects/:id/shot-columns/:shotId", asyncHandler(async (request, response) => response.json(await upsertCanvasShotColumn({
  projectId: param(request.params.id),
  factoryRunId: requiredText(request.body?.factoryRunId, "factoryRunId"),
  shotId: param(request.params.shotId),
  columnIndex: Number(request.body?.columnIndex) || 0,
  title: String(request.body?.title || ""),
  operations: Array.isArray(request.body?.operations) ? request.body.operations as CanvasOperation[] : [],
  layout: request.body?.layout,
  originClientId: clientId(request) || "canvas-shot-column",
}))));
app.post("/api/canvas/projects/:id/run-nodes", asyncHandler(async (request, response) => {
  const originClientId = clientId(request);
  if (request.body?.async === true) {
    const job = await createCanvasRunJob({
      projectId: param(request.params.id),
      nodeIds: Array.isArray(request.body?.nodeIds) ? request.body.nodeIds : [],
      concurrency: request.body?.concurrency == null ? undefined : Number(request.body.concurrency),
      originClientId: originClientId || "mcp",
    });
    return response.status(202).json(job);
  }
  response.json(await runCanvasConfigNodes({
    projectId: param(request.params.id),
    configNodeIds: Array.isArray(request.body?.nodeIds) ? request.body.nodeIds : [],
    concurrency: request.body?.concurrency == null ? undefined : Number(request.body.concurrency),
    originClientId: originClientId || "canvas-node-runtime",
    remoteOperation: request.header("x-croco-operation-origin") === "mcp",
  }));
}));
app.post("/api/canvas/projects/:id/rerun-outputs", asyncHandler(async (request, response) => response.status(202).json(await createCanvasRerunJob({ projectId: param(request.params.id), outputNodeIds: Array.isArray(request.body?.outputNodeIds) ? request.body.outputNodeIds : [], concurrency: request.body?.concurrency == null ? undefined : Number(request.body.concurrency), originClientId: clientId(request) || "mcp" }))));
app.get("/api/canvas/run-jobs/:jobId", asyncHandler(async (request, response) => response.json(getCanvasRunJob(param(request.params.jobId)))));
app.post("/api/canvas/run-jobs/:jobId/cancel", asyncHandler(async (request, response) => response.json(await cancelCanvasRunJob(param(request.params.jobId)))));
app.post("/api/canvas/projects/:id/verify-video-asr", asyncHandler(async (request, response) => response.json(await verifyCanvasVideoAsr({
  projectId: param(request.params.id),
  videoNodeId: requiredText(request.body?.videoNodeId, "视频节点 ID"),
  expectedText: requiredText(request.body?.expectedText, "ASR 验收文案"),
  threshold: Number(request.body?.threshold) || 0.88,
  title: String(request.body?.title || ""),
  originClientId: clientId(request) || "canvas-asr-runtime",
  remoteOperation: request.header("x-croco-operation-origin") === "mcp",
}))));
app.post("/api/canvas/projects/:id/video-frames", asyncHandler(async (request, response) => response.json(await useCanvasVideoFrames({ projectId: param(request.params.id), videoNodeId: requiredText(request.body?.videoNodeId, "视频节点 ID"), frames: request.body?.frames, frameTimes: request.body?.frameTimes, targetNodeIds: request.body?.targetNodeIds, replaceExisting: request.body?.replaceExisting !== false, originClientId: clientId(request) || "canvas-video-frames" }))));
app.post("/api/canvas/projects/:id/visual-review", asyncHandler(async (request, response) => response.json(await recordCanvasVisualReview({ projectId: param(request.params.id), videoNodeId: requiredText(request.body?.videoNodeId, "视频节点 ID"), verdict: request.body?.verdict, reviewer: requiredText(request.body?.reviewer, "审核者"), checks: request.body?.checks, issues: request.body?.issues, originClientId: clientId(request) || "canvas-visual-review" }))));
app.post("/api/canvas/projects/:id/merge-videos", asyncHandler(async (request, response) => response.json(await mergeCanvasVideos({ projectId: param(request.params.id), videoNodeIds: Array.isArray(request.body?.videoNodeIds) ? request.body.videoNodeIds : [], title: String(request.body?.title || ""), requireVerification: request.body?.requireVerification !== false, originClientId: clientId(request) || "canvas-video-merge" }))));

app.get("/api/resources", asyncHandler(async (_request, response) => response.json(await listResources())));
app.post("/api/resources", upload.single("file"), asyncHandler(async (request, response) => {
  if (!request.file) throw new Error("没有收到资源文件");
  const id = randomUUID();
  const originalName = decodeMultipartFileName(request.file.originalname);
  const extension = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const fileName = path.posix.join("user", `${id}${extension}`);
  const target = safeResourcePath(fileName);
  await rename(request.file.path, target);
  const resource = await addResource({ id, name: originalName.slice(0, 180), type: typeFromMime(request.file.mimetype), mimeType: request.file.mimetype || "application/octet-stream", size: await fileSize(target), fileName, createdAt: new Date().toISOString(), source: "upload" });
  response.status(201).json(resource);
}));
app.delete("/api/resources/:id", asyncHandler(async (request, response) => { await trashResource(param(request.params.id)); response.status(204).end(); }));
app.put("/api/resources/:id", asyncHandler(async (request, response) => response.json(await updateResource(param(request.params.id), { name: request.body?.title || request.body?.name, metadata: request.body?.metadata }))));
app.get("/files/by-id/:id/thumbnail", asyncHandler(async (request, response) => {
  const resource = await resourceById(param(request.params.id));
  if (!resource) return response.status(404).json({ error: "资源不存在" });
  if (resource.type !== "image" && !resource.mimeType.startsWith("image/")) return response.status(415).json({ error: "只有图片资源支持缩略图" });
  response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  response.type("image/webp").sendFile(await resourceThumbnail(resource, thumbnailSize(request.query.size)));
}));
app.get("/files/by-id/:id", asyncHandler(async (request, response) => {
  const resource = await resourceById(param(request.params.id));
  if (!resource) return response.status(404).json({ error: "资源不存在" });
  response.type(resource.mimeType).sendFile(safeResourcePath(resource.fileName));
}));

app.get("/api/characters", asyncHandler(async (_request, response) => response.json(await listCharacters())));
app.post("/api/characters/sync", asyncHandler(async (_request, response) => response.json(await syncCharacters())));

app.post("/api/generate/text", asyncHandler(async (request, response) => response.json({ text: await generateText(requiredText(request.body?.prompt, "Prompt"), String(request.body?.model || ""), Array.isArray(request.body?.inputResourceIds) ? request.body.inputResourceIds : [], Array.isArray(request.body?.inputDataUrls) ? request.body.inputDataUrls : [], String(request.body?.systemPrompt || "")) })));
app.post("/api/generate/image", asyncHandler(async (request, response) => response.json({ resource: await generateImage({ ...request.body, prompt: requiredText(request.body?.prompt, "图片 Prompt") }) })));
app.post("/api/generate/speech", asyncHandler(async (request, response) => {
  const projectId = String(request.body?.projectId || "").trim();
  const nodeId = String(request.body?.nodeId || "").trim();
  const toneNodeId = String(request.body?.toneNodeId || "").trim();
  const remoteOperation = request.header("x-croco-operation-origin") === "mcp";
  const onProgress = projectId && nodeId && toneNodeId
    ? (progress: SpeechGenerationProgress) => publishSpeechProgress(projectId, nodeId, toneNodeId, progress, remoteOperation)
    : undefined;
  response.json({ resource: await generateSpeech({ ...request.body, content: requiredText(request.body?.content, "语音正文"), voiceId: requiredText(request.body?.voiceId, "角色 Voice ID") }, onProgress) });
}));
app.post("/api/generate/video", asyncHandler(async (request, response) => {
  const requestedModel = String(request.body?.model || "minimax-h3").trim().toLowerCase();
  const model = requestedModel === "minimax-h3-r2v" ? "minimax-h3" : requestedModel;
  if (model !== "minimax-h3") throw new Error(`不支持的视频模型：${model}`);
  const prompt = requiredText(request.body?.prompt, "H3 Prompt");
  const duration = Number(request.body?.duration);
  if (Array.isArray(request.body?.videoResourceIds) && request.body.videoResourceIds.length) throw new Error("MiniMax H3 暂不支持视频参考或视频编辑；请改用图片、音频参考");
  const prepared = await prepareH3Prompt({
    draftPrompt: prompt,
    durationSeconds: duration,
    inputMode: request.body?.inputMode,
    imageResourceIds: Array.isArray(request.body?.imageResourceIds) ? request.body.imageResourceIds : [],
    audioResourceIds: Array.isArray(request.body?.audioResourceIds) ? request.body.audioResourceIds : [],
    resourceRoles: Array.isArray(request.body?.resourceRoles) ? request.body.resourceRoles : [],
    optimize: request.body?.optimizePrompt !== false,
  });
  const resources = await generateH3Video({ ...request.body, prompt: prepared.prompt, duration, videoResourceIds: [] });
  response.json({ resources, promptPreparation: prepared });
}));
app.post("/api/generate/music", asyncHandler(async (request, response) => response.json({ resources: await generateMusic({ prompt: String(request.body?.prompt || ""), model: String(request.body?.model || ""), params: request.body?.params }) })));

app.use((error: Error & { statusCode?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error.message);
  response.status(error.statusCode || 400).json({ error: error.message || "本地服务请求失败", ...("currentVersion" in error ? { currentVersion: (error as Error & { currentVersion?: number }).currentVersion } : {}) });
});

app.listen(port, "127.0.0.1", () => console.log(`Croco Canvas local API: http://127.0.0.1:${port}\nData: ${dataDir}`));

if (process.env.CROCO_CHARACTERS_API_URL && process.env.CROCO_CHARACTERS_API_TOKEN) {
  void syncCharacters().then((result) => console.log(`Characters synced: ${result.remoteCharacters}, assets: ${result.assetsDownloaded}`)).catch((error) => console.warn(`Character sync skipped: ${error.message}`));
}
if (process.env.SUNO_API_KEY) {
  void startSunoCallbackService().then(() => console.log("Suno callback service ready")).catch((error) => console.warn(error.message));
}

function asyncHandler(handler: (request: express.Request, response: express.Response, next: express.NextFunction) => Promise<unknown>) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => void handler(request, response, next).catch(next);
}
function requiredText(value: unknown, name: string) { const text = String(value || "").trim(); if (!text) throw new Error(`${name} 不能为空`); return text; }
function param(value: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function clientId(request: express.Request) { return String(request.header("x-croco-client-id") || "").trim().slice(0, 120) || undefined; }
function optionalVersion(value: unknown) { const version = Number(value); return Number.isInteger(version) && version > 0 ? version : undefined; }
function decodeMultipartFileName(value: string) {
  const containsLatin1Bytes = [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code >= 0x80 && code <= 0xff;
  });
  if (!containsLatin1Bytes) return value;
  const decoded = Buffer.from(value, "latin1").toString("utf8");
  if (decoded.includes("\uFFFD")) return value;
  return Buffer.from(decoded, "utf8").toString("latin1") === value ? decoded : value;
}

async function publishSpeechProgress(projectId: string, nodeId: string, toneNodeId: string, progress: SpeechGenerationProgress, remoteOperation: boolean) {
  const operations: CanvasOperation[] = [];
  if (progress.stage === "tone") {
    operations.push(
      { op: "update_node", nodeId: toneNodeId, patch: { metadata: { model: progress.toneModel, status: "loading", generationState: "running", remoteOperationActive: remoteOperation, remoteOperationLabel: progress.label, speechStage: "tone" } } },
      { op: "update_node", nodeId, patch: { metadata: { remoteOperationActive: remoteOperation, remoteOperationLabel: "等待 DeepSeek 语气优化", speechStage: "waiting-for-tone" } } },
    );
  } else if (progress.stage === "tone-ready") {
    operations.push(
      { op: "update_node", nodeId: toneNodeId, patch: { metadata: { model: progress.toneModel, content: JSON.stringify({ segments: progress.segments || [] }, null, 2), status: "success", generationState: "ready", remoteOperationActive: false, remoteOperationLabel: progress.label, speechStage: "ready" } } },
      { op: "update_node", nodeId, patch: { metadata: { remoteOperationActive: remoteOperation, remoteOperationLabel: "Seed-TTS 正在准备语音", speechStage: "synthesis" } } },
    );
  } else if (progress.stage === "synthesis" || progress.stage === "saving") {
    operations.push({ op: "update_node", nodeId, patch: { metadata: { remoteOperationActive: remoteOperation, remoteOperationLabel: progress.label, speechStage: progress.stage, speechSegmentCurrent: progress.current, speechSegmentTotal: progress.total } } });
  } else {
    const targetId = progress.failedStage === "tone" ? toneNodeId : nodeId;
    operations.push({ op: "update_node", nodeId: targetId, patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationLabel: progress.label, errorDetails: progress.error || progress.label, speechStage: "error" } } });
  }
  const result = await applyCanvasOperations(projectId, operations);
  publishProjectUpdated(result.project, "speech-progress");
}
