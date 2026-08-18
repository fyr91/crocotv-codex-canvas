import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { addResource, fileSize, resourceById, safeResourcePath, updateResource, writeGenerated } from "./storage";
import type { StoredResource } from "./types";
import { getSunoCallbackUrl } from "./suno-callback";
import { createModelAssetLease, type ModelAssetLease } from "./model-asset-url";
import { providerModels as models } from "./model-catalog";
import {
  cancelUnifiedGpuJob,
  downloadUnifiedGpuOutput,
  getUnifiedGpuJob,
  listUnifiedGpuOutputs,
  submitUnifiedGpuJob,
  uploadGpuResource,
  waitForUnifiedGpuJob,
  type GpuJobProgress,
} from "./gpu-orchestrator";

export { models };

export type TextThinkingMode = "enabled" | "disabled" | "auto";

export async function generateText(prompt: string, requestedModel?: string, inputResourceIds: string[] = [], inputDataUrls: string[] = [], systemPrompt = "", options: { thinking?: TextThinkingMode } = {}) {
  const normalizedRequestedModel = requestedModel === "deepseek-v4-flash-260425" ? "deepseek-v4-flash-ga-260731" : requestedModel;
  const logicalModel = normalizedRequestedModel && [...models.volcengineLlm, ...models.bigmodelLlm, ...models.runwareLlm].includes(normalizedRequestedModel) ? normalizedRequestedModel : models.volcengineLlm[0];
  const channel = models.runwareLlm.includes(logicalModel) ? "runware" : models.bigmodelLlm.includes(logicalModel) ? "bigmodel" : "volcengine";
  const apiKey = required(channel === "runware" ? "RUNWARE_API_KEY" : channel === "bigmodel" ? "BIGMODEL_API_KEY" : "ARK_API_KEY");
  const baseUrl = (channel === "runware" ? process.env.RUNWARE_BASE_URL || "https://api.runware.ai/v1" : channel === "bigmodel" ? process.env.BIGMODEL_BASE_URL || "https://open.bigmodel.cn/api/paas/v4" : process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  const model = resolveLlmDeployment(logicalModel);
  const settledLeases = await Promise.allSettled(inputResourceIds.slice(0, 16).map(async (id) => {
    const resource = await resourceById(id);
    if (!resource) throw new Error(`多模态资源不存在：${id}`);
    if (!modelAcceptsMimeType(logicalModel, resource.mimeType)) return null;
    return createModelAssetLease(id);
  }));
  const leases = settledLeases.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const leaseFailure = settledLeases.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (leaseFailure) {
    await releaseModelAssetLeases(leases);
    throw leaseFailure.reason;
  }
  try {
    const media: Array<{ mimeType: string; url: string }> = leases.map((lease) => ({ mimeType: lease.mimeType, url: lease.url }));
    for (const dataUrl of inputDataUrls.slice(0, 16)) {
      const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,/);
      if (match && modelAcceptsMimeType(logicalModel, match[1])) media.push({ mimeType: match[1], url: dataUrl });
    }
    const content = media.length ? [{ type: "text", text: prompt }, ...media.map((item) => mediaContent(item.mimeType, item.url))] : prompt;
    const messages = systemPrompt.length
      ? [{ role: "system", content: systemPrompt }, { role: "user", content }]
      : [{ role: "user", content }];
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, ...(logicalModel === "deepseek-v4-flash-ga-260731" ? { thinking: { type: options.thinking || "enabled" } } : {}), stream: false }),
      signal: AbortSignal.timeout(420_000),
    });
    const channelLabel = channel === "runware" ? "Runware" : channel === "bigmodel" ? "智谱 BigModel" : "火山引擎 Ark";
    if (!response.ok) throw new Error(await responseError(response, `${channelLabel} 请求失败（${response.status}）`));
    const payload = await response.json() as any;
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error(`${channelLabel} 没有返回文本`);
    return text;
  } finally {
    await releaseModelAssetLeases(leases);
  }
}

async function releaseModelAssetLeases(leases: ModelAssetLease[]) {
  await Promise.allSettled(leases.map((lease) => lease.release()));
}

export async function generateMusic(input: { prompt: string; model?: string; params?: Record<string, unknown>; signal?: AbortSignal; onProgress?: (progress: GpuJobProgress) => void | Promise<void> }) {
  if (input.model === "minimax-music-3") return generateMiniMaxMusic3(input);
  const baseUrl = (process.env.SUNO_BASE_URL || "https://api.sunoapi.org").replace(/\/$/, "");
  const apiKey = required("SUNO_API_KEY");
  const params = input.params || {};
  const createResponse = await fetch(`${baseUrl}/api/v1/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      model: input.model || models.music[0],
      customMode: Boolean(params.customMode),
      instrumental: Boolean(params.instrumental),
      callBackUrl: await getSunoCallbackUrl(),
      ...(params.customMode ? { style: params.style || "", title: params.title || "" } : {}),
      ...(params.negativeTags ? { negativeTags: params.negativeTags } : {}),
      ...(params.vocalGender ? { vocalGender: params.vocalGender } : {}),
      ...(params.styleWeight != null ? { styleWeight: Number(params.styleWeight) } : {}),
      ...(params.weirdnessConstraint != null ? { weirdnessConstraint: Number(params.weirdnessConstraint) } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const created = await createResponse.json().catch(() => ({})) as any;
  if (!createResponse.ok || created.code !== 200 || !created.data?.taskId) throw new Error(created.msg || `Suno 音乐任务创建失败（${createResponse.status}）`);
  const taskId = String(created.data.taskId);
  let data: any;
  const deadline = Date.now() + 15 * 60_000;
  do {
    if (Date.now() >= deadline) throw new Error("Suno 音乐生成超时，请稍后重试");
    await wait(10_000);
    const poll = await fetch(`${baseUrl}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30_000) });
    const payload = await poll.json().catch(() => ({})) as any;
    if (!poll.ok || payload.code !== 200) throw new Error(payload.msg || `Suno 音乐任务查询失败（${poll.status}）`);
    data = payload.data || {};
    const status = String(data.status || "").toUpperCase();
    if (["FAILED", "ERROR"].includes(status)) throw new Error(data.errorMessage || "Suno 音乐生成失败");
    if (status === "SUCCESS") break;
  } while (true);
  const songs = data.response?.sunoData || data.response?.data || [];
  const resources: StoredResource[] = [];
  for (const [index, song] of songs.entries()) {
    const audioUrl = song.audioUrl || song.audio_url;
    if (!audioUrl) continue;
    const audio = await downloadBinary(audioUrl, "Suno 音频");
    const audioStored = await writeGenerated("suno", "mp3", audio.bytes);
    let cover: StoredResource | undefined;
    const coverRemoteUrl = song.imageUrl || song.image_url;
    if (coverRemoteUrl) {
      const image = await downloadBinary(coverRemoteUrl, "Suno 封面");
      const coverStored = await writeGenerated("suno", extensionForMime(image.mimeType, "jpg"), image.bytes);
      cover = await addResource({ id: coverStored.id, name: `${song.title || params.title || "Suno 音乐"}-封面.jpg`, type: "image", mimeType: image.mimeType, size: await fileSize(coverStored.target), fileName: coverStored.fileName, createdAt: new Date().toISOString(), source: "suno", metadata: { taskId, providerAssetId: song.id, role: "cover" } });
    }
    resources.push(await addResource({ id: audioStored.id, name: `${song.title || params.title || `Suno 音乐 ${index + 1}`}.mp3`, type: "audio", mimeType: audio.mimeType || "audio/mpeg", size: await fileSize(audioStored.target), fileName: audioStored.fileName, createdAt: new Date().toISOString(), source: "suno", metadata: { taskId, providerAssetId: song.id, duration: Number(song.duration) || undefined, tags: song.tags, prompt: song.prompt, coverResourceId: cover?.id, coverUrl: cover?.url } }));
  }
  if (!resources.length) throw new Error("Suno 音乐任务成功，但没有返回音频");
  return resources;
}

export function buildMusic3JobPayload(input: { prompt: string; params?: Record<string, unknown> }) {
  const params = input.params || {};
  const caption = String(params.style || params.caption || params.title || "").trim();
  if (!caption) throw new Error("MiniMax Music 3 需要音乐描述");
  const instrumental = Boolean(params.instrumental);
  const lyrics = instrumental ? "" : String(params.lyrics ?? input.prompt ?? "").trim();
  const maxDuration = Number(params.maxDuration ?? params.max_duration ?? 120);
  if (!Number.isFinite(maxDuration) || maxDuration < 0.04 || maxDuration > 360) throw new Error("MiniMax Music 3 时长必须为 0.04–360 秒");
  const seed = Number(params.seed ?? 0);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("MiniMax Music 3 Seed 必须为非负整数");
  const outputFormat = String(params.outputFormat || params.output_format || "mp3").toLowerCase();
  if (!["mp3", "wav"].includes(outputFormat)) throw new Error("MiniMax Music 3 输出格式只支持 mp3 或 wav");
  return {
    caption,
    lyrics,
    max_duration: maxDuration,
    seed,
    tiled_decode: Boolean(params.tiledDecode ?? params.tiled_decode),
    output_format: outputFormat,
  };
}

async function generateMiniMaxMusic3(input: { prompt: string; params?: Record<string, unknown>; signal?: AbortSignal; onProgress?: (progress: GpuJobProgress) => void | Promise<void> }) {
  const parameters = buildMusic3JobPayload(input);
  const created = await submitUnifiedGpuJob({
    modelId: "minimax-music-3",
    operation: "audio.generate",
    contractVersion: "1",
    parameters,
    signal: input.signal,
  });
  await input.onProgress?.({ stage: "submitted", jobId: created.job_id, outputIndex: 0, progress: 0, label: "MiniMax Music 3 任务已提交" });
  try {
    await waitForUnifiedGpuJob({ job: created, signal: input.signal, onProgress: input.onProgress });
  } catch (error) {
    if (input.signal?.aborted) await cancelUnifiedGpuJob(created.job_id).catch(() => undefined);
    throw error;
  }
  const outputs = await listUnifiedGpuOutputs(created.job_id, input.signal);
  const output = outputs.find((item) => item.output_type === "audio" && item.delivery_state === "ready");
  if (!output) throw new Error("MiniMax Music 3 任务成功，但没有返回音频");
  const audio = await downloadUnifiedGpuOutput(created.job_id, output.output_id, input.signal);
  const extension = extensionForMime(audio.mimeType, parameters.output_format);
  const stored = await writeGenerated("minimax-music3", extension, audio.bytes);
  const title = String(input.params?.title || "MiniMax Music 3").trim() || "MiniMax Music 3";
  const resource = await addResource({
    id: stored.id,
    name: `${title}.${extension}`,
    type: "audio",
    mimeType: audio.mimeType,
    size: await fileSize(stored.target),
    fileName: stored.fileName,
    createdAt: new Date().toISOString(),
    source: "minimax-music3",
    metadata: {
      model: "minimax-music-3",
      jobId: created.job_id,
      duration: parameters.max_duration,
      caption: parameters.caption,
      lyrics: parameters.lyrics,
      instrumental: !parameters.lyrics,
      seed: parameters.seed,
      tiledDecode: parameters.tiled_decode,
      outputFormat: parameters.output_format,
    },
  });
  return [resource];
}

export async function generateImage(input: { prompt: string; model: string; width?: number; height?: number; seed?: number; referenceResourceIds?: string[]; signal?: AbortSignal }) {
  if (input.model === "ernie-image-turbo") return generateErnieImage(input);
  if (!models.image.includes(input.model)) throw new Error("只支持已配置的图片模型");
  const taskUUID = randomUUID();
  const references = await Promise.all((input.referenceResourceIds || []).slice(0, 8).map(resourceDataUri));
  const request = {
    taskType: "imageInference", taskUUID, model: input.model, positivePrompt: input.prompt,
    deliveryMethod: "sync", outputType: "URL", outputFormat: "PNG", outputQuality: 90, numberResults: 1, includeCost: true,
    ...(input.model === "openai:gpt-image@2"
      ? { providerSettings: { openai: { quality: "auto", moderation: "low" } } }
      : { safety: { checkContent: true } }),
    ...(references.length
      ? {
          inputs: { referenceImages: references },
          ...(input.model === "google:nano-banana@2-lite"
            ? { resolution: "1K" }
            : { width: input.width || 1024, height: input.height || 1024 }),
        }
      : { width: input.width || 1024, height: input.height || 1024 }),
  };
  const response = await fetch((process.env.RUNWARE_BASE_URL || "https://api.runware.ai/v1").replace(/\/$/, ""), {
    method: "POST", headers: { Authorization: `Bearer ${required("RUNWARE_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify([request]), signal: AbortSignal.timeout(420_000),
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok || payload.errors?.length) throw new Error(payload.errors?.map((item: any) => item.message).filter(Boolean).join("；") || `Runware 请求失败（${response.status}）`);
  const result = payload.data?.find((item: any) => item.taskUUID === taskUUID);
  if (!result?.imageURL) throw new Error("Runware 没有返回图片地址");
  const image = await fetch(result.imageURL);
  if (!image.ok) throw new Error(`Runware 图片下载失败（${image.status}）`);
  const stored = await writeGenerated("runware", "png", new Uint8Array(await image.arrayBuffer()));
  return addResource({ id: stored.id, name: `Runware-${new Date().toLocaleString("zh-CN")}.png`, type: "image", mimeType: "image/png", size: await fileSize(stored.target), fileName: stored.fileName, createdAt: new Date().toISOString(), source: "runware", metadata: { model: input.model, taskUUID, imageUUID: result.imageUUID, seed: result.seed, cost: result.cost } });
}

const ERNIE_IMAGE_SIZES = new Set(["1024x1024", "848x1264", "1264x848", "768x1376", "1376x768", "896x1200", "1200x896"]);

async function generateErnieImage(input: { prompt: string; model: string; width?: number; height?: number; seed?: number; referenceResourceIds?: string[]; signal?: AbortSignal }) {
  if (input.referenceResourceIds?.length) throw new Error("ERNIE Image Turbo 当前只支持文生图，不接受参考图片");
  const width = Math.floor(Number(input.width) || 1024);
  const height = Math.floor(Number(input.height) || 1024);
  if (!ERNIE_IMAGE_SIZES.has(`${width}x${height}`)) throw new Error(`ERNIE Image Turbo 不支持尺寸 ${width}x${height}`);
  if (input.seed != null && (!Number.isSafeInteger(input.seed) || input.seed < 0)) throw new Error("ERNIE Image Turbo Seed 必须为非负整数");
  const parameters = { prompt: input.prompt, width, height, ...(input.seed == null ? {} : { seed: input.seed }) };
  const created = await submitUnifiedGpuJob({
    modelId: "ernie-image-turbo",
    operation: "image.generate",
    contractVersion: "1",
    parameters,
    signal: input.signal,
  });
  const job = await waitForUnifiedGpuJob({ job: created, signal: input.signal });
  const outputs = await listUnifiedGpuOutputs(job.job_id, input.signal);
  const output = outputs.find((item) => item.output_type === "image" && item.delivery_state === "ready");
  if (!output) throw new Error("ERNIE Image Turbo 任务成功，但没有返回图片");
  const image = await downloadUnifiedGpuOutput(job.job_id, output.output_id, input.signal);
  const stored = await writeGenerated("ernie", extensionForMime(image.mimeType, "png"), image.bytes);
  return addResource({
    id: stored.id,
    name: `ERNIE-${new Date().toLocaleString("zh-CN")}.png`,
    type: "image",
    mimeType: image.mimeType,
    size: await fileSize(stored.target),
    fileName: stored.fileName,
    createdAt: new Date().toISOString(),
    source: "ernie",
    metadata: { model: input.model, jobId: job.job_id, width, height, seed: job.parameters?.seed ?? input.seed },
  });
}

export type H3GenerationProgress = GpuJobProgress;

export type VideoGenerationInput = {
  model: string;
  prompt: string;
  duration: number;
  quality?: string;
  size?: string;
  count?: number;
  inputMode?: string;
  optimizePrompt?: boolean;
  imageResourceIds?: string[];
  videoResourceIds?: string[];
  audioResourceIds?: string[];
  referenceStrength?: number;
  seed?: number;
  signal?: AbortSignal;
  onProgress?: (progress: H3GenerationProgress) => void | Promise<void>;
};

export async function generateVideo(input: VideoGenerationInput) {
  const model = input.model === "minimax-h3-r2v" ? "minimax-h3" : input.model;
  if (model === "minimax-h3") return generateH3Video(input);
  if (model === "ltx-2.5") return generateLtxVideo(input);
  throw new Error(`不支持的视频模型：${model}`);
}

export function h3JobProgressState(status: unknown): { pending: boolean; stage: H3GenerationProgress["stage"]; label: string } {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "dispatching") return { pending: true, stage: "queued", label: "MiniMax H3 任务分发中" };
  if (["queued", "queued_remote"].includes(normalized)) return { pending: true, stage: "queued", label: "MiniMax H3 排队中" };
  if (["running", "cancel_requested", "unknown"].includes(normalized)) return { pending: true, stage: "running", label: "MiniMax H3 生成中" };
  return { pending: false, stage: "completed", label: "MiniMax H3 正在保存结果" };
}

export async function generateH3Video(input: Omit<VideoGenerationInput, "model"> & { model?: string }) {
  if (!Number.isInteger(input.duration) || input.duration < 3 || input.duration > 15) throw new Error("H3 时长必须为 3–15 秒整数");
  if (input.videoResourceIds?.length) throw new Error("当前 H3 Runtime 不支持参考视频；请仅连接图片或音频参考");
  const images = await Promise.all((input.imageResourceIds || []).slice(0, 9).map((id) => uploadGpuResource(id, "images", input.signal)));
  const audios = await Promise.all((input.audioResourceIds || []).slice(0, 3).map((id) => uploadGpuResource(id, "audio", input.signal)));
  const qualities = ["preview", "base_0_7mp", "base_768p", "standard_480p", "standard_0_7mp", "standard_768p", "portrait_preview", "portrait_0_7mp", "portrait_768p", "standard_portrait_480p", "standard_portrait_0_7mp", "standard_portrait_768p"];
  const quality = qualities.includes(String(input.quality)) ? String(input.quality) : "preview";
  const count = Math.max(1, Math.min(3, Number(input.count) || 1));
  return Promise.all(Array.from({ length: count }, async (_, outputIndex) => {
    const clientJobId = randomUUID();
    const request = buildH3JobPayload({ externalJobId: clientJobId, count: 1, prompt: input.prompt, quality, duration: input.duration, inputMode: input.inputMode, images, videos: [], audios });
    const created = await submitUnifiedGpuJob({
      modelId: "minimax-h3",
      operation: "video.generate",
      contractVersion: "2",
      clientJobId,
      parameters: request.parameters,
      inputs: request.inputs,
      signal: input.signal,
    });
    await input.onProgress?.({ stage: "submitted", jobId: created.job_id, outputIndex, progress: 0, label: "MiniMax H3 任务已提交" });
    try {
      await waitForUnifiedGpuJob({ job: created, outputIndex, signal: input.signal, onProgress: input.onProgress });
    } catch (error) {
      if (input.signal?.aborted) await cancelUnifiedGpuJob(created.job_id).catch(() => undefined);
      throw error;
    }
    const outputs = await listUnifiedGpuOutputs(created.job_id, input.signal);
    const output = outputs.find((item) => item.output_type === "video" && item.delivery_state === "ready");
    if (!output) throw new Error("MiniMax H3 任务成功，但没有返回视频");
    const video = await downloadUnifiedGpuOutput(created.job_id, output.output_id, input.signal);
    const stored = await writeGenerated("h3", extensionForMime(video.mimeType, "mp4"), video.bytes);
    const completed = await getUnifiedGpuJob(created.job_id, input.signal);
    const parameters = completed.parameters || {};
    return addResource({ id: stored.id, name: `H3-${new Date().toLocaleString("zh-CN")}-${outputIndex + 1}.mp4`, type: "video", mimeType: video.mimeType, size: await fileSize(stored.target), fileName: stored.fileName, createdAt: new Date().toISOString(), source: "h3", metadata: { model: "minimax-h3", jobId: created.job_id, outputIndex, quality, duration: input.duration, width: parameters.width, height: parameters.height, seed: parameters.seed } });
  }));
}

async function generateLtxVideo(input: VideoGenerationInput) {
  if (input.videoResourceIds?.length || input.audioResourceIds?.length) throw new Error("LTX 2.5 当前不接受视频或音频参考");
  const imageIds = input.imageResourceIds || [];
  if (imageIds.length > 1) throw new Error("LTX 2.5 每次只接受一张首帧或 Ingredients 参考图");
  const count = Math.max(1, Math.min(3, Math.floor(Number(input.count) || 1)));
  const uploadedImageId = imageIds[0] ? await uploadGpuResource(imageIds[0], "images", input.signal) : undefined;
  return Promise.all(Array.from({ length: count }, async (_, outputIndex) => {
    const seed = Number.isInteger(input.seed) ? Number(input.seed) + outputIndex : Math.floor(Math.random() * 2_147_483_647);
    const request = buildLtxGenerationRequest({ ...input, hasImage: Boolean(uploadedImageId), seed });
    const created = await submitUnifiedGpuJob({
      modelId: "ltx-2.5",
      operation: "video.generate",
      contractVersion: "2",
      parameters: request.parameters,
      inputs: request.inputRole && uploadedImageId ? [{ role: request.inputRole, asset_id: uploadedImageId }] : [],
      signal: input.signal,
    });
    await input.onProgress?.({ stage: "submitted", jobId: created.job_id, outputIndex, progress: 0, label: "LTX 2.5 任务已提交" });
    try {
      await waitForUnifiedGpuJob({ job: created, outputIndex, signal: input.signal, onProgress: input.onProgress });
    } catch (error) {
      if (input.signal?.aborted) await cancelUnifiedGpuJob(created.job_id).catch(() => undefined);
      throw error;
    }
    const outputs = await listUnifiedGpuOutputs(created.job_id, input.signal);
    const output = outputs.find((item) => item.output_type === "video" && item.delivery_state === "ready");
    if (!output) throw new Error("LTX 2.5 任务成功，但没有返回视频");
    const video = await downloadUnifiedGpuOutput(created.job_id, output.output_id, input.signal);
    const stored = await writeGenerated("ltx", extensionForMime(video.mimeType, "mp4"), video.bytes);
    return addResource({
      id: stored.id,
      name: `LTX-2.5-${new Date().toLocaleString("zh-CN")}-${outputIndex + 1}.mp4`,
      type: "video",
      mimeType: video.mimeType,
      size: await fileSize(stored.target),
      fileName: stored.fileName,
      createdAt: new Date().toISOString(),
      source: "ltx",
      metadata: { model: "ltx-2.5", jobId: created.job_id, outputIndex, width: request.width, height: request.height, duration: request.duration, fps: 24, numFrames: request.numFrames, seed, workflowId: request.workflowId },
    });
  }));
}

export function buildLtxGenerationRequest(input: Pick<VideoGenerationInput, "prompt" | "size" | "duration" | "inputMode" | "optimizePrompt" | "referenceStrength"> & { hasImage: boolean; seed: number }) {
  const prompt = input.prompt.trim();
  if (prompt.length < 3 || prompt.length > 4000) throw new Error("LTX 2.5 Prompt 必须为 3–4000 个字符");
  const [width, height] = ltxDimensions(input.size || "1280x704");
  const duration = Number(input.duration);
  if (!Number.isInteger(duration) || duration < 3 || duration > 20) throw new Error("LTX 2.5 时长必须为 3–20 秒整数");
  const numFrames = duration * 24 + 1;
  if (width * height * numFrames > 1_200_000_000) throw new Error("LTX 2.5 分辨率和时长超过 GPU 像素帧预算");
  if (input.inputMode === "firstFrame" && !input.hasImage) throw new Error("LTX 2.5 首帧生视频缺少首帧图片");
  if (input.inputMode === "multimodal" && !input.hasImage) throw new Error("LTX 2.5 Ingredients 缺少参考图");
  const workflowId = !input.hasImage
    ? "ltx25_distilled_t2v_v1"
    : input.inputMode === "firstFrame"
      ? "ltx25_distilled_i2v_v1"
      : "ltx25_ic_lora_ingredients_v1";
  const inputRole = workflowId === "ltx25_distilled_i2v_v1" ? "first_frame" : workflowId === "ltx25_ic_lora_ingredients_v1" ? "reference_sheet" : undefined;
  return {
    workflowId,
    inputRole,
    width,
    height,
    duration,
    numFrames,
    parameters: {
      workflow_id: workflowId,
      prompt,
      width,
      height,
      num_frames: numFrames,
      fps: 24,
      seed: input.seed,
      enhance_prompt: input.optimizePrompt !== false,
      reference_strength: Math.max(0.1, Math.min(1.5, Number(input.referenceStrength) || 1)),
    },
  };
}

export function ltxDimensions(size: string): [number, number] {
  const match = String(size || "").match(/^(\d+)x(\d+)$/);
  const width = Number(match?.[1] || 1024);
  const height = Number(match?.[2] || 576);
  if (width < 320 || height < 320 || width > 4096 || height > 4096 || width % 64 || height % 64) throw new Error(`LTX 2.5 不支持尺寸 ${width}x${height}`);
  if (width * height > 4096 * 2304) throw new Error("LTX 2.5 分辨率超过 GPU 像素预算");
  return [width, height];
}

export type FlashVsrEnhancement = {
  id: string;
  source_resource_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  stage: string;
  progress: number;
  output_resource_id?: string | null;
  error_message?: string | null;
};

const flashVsrFinalizers = new Map<string, Promise<FlashVsrEnhancement>>();

export async function createFlashVsrEnhancement(sourceResourceId: string) {
  const source = await requiredH3Source(sourceResourceId);
  const existingJobId = String(source.metadata?.flashVsrJobId || "");
  if (existingJobId) {
    const existing = await getFlashVsrEnhancement(sourceResourceId);
    if (existing && !["failed", "canceled"].includes(existing.status)) return existing;
  }
  const sourceJobId = String(source.metadata?.jobId || "");
  const created = await submitUnifiedGpuJob({
    modelId: "flashvsr",
    operation: "video.enhance",
    contractVersion: "1",
    parameters: { source_job_id: sourceJobId, profile: "flashvsr_v1_1_tiny_long_native2x_hevc_crf26" },
  });
  await updateResource(source.id, { metadata: { ...(source.metadata || {}), flashVsrJobId: created.job_id, flashVsrOutputResourceId: "" } });
  return normalizedFlashVsrJob(source.id, created);
}

export async function getFlashVsrEnhancement(sourceResourceId: string): Promise<FlashVsrEnhancement | null> {
  const source = await requiredH3Source(sourceResourceId);
  const outputResourceId = String(source.metadata?.flashVsrOutputResourceId || "");
  const jobId = String(source.metadata?.flashVsrJobId || "");
  if (outputResourceId && jobId) return { id: jobId, source_resource_id: source.id, status: "succeeded", stage: "completed", progress: 100, output_resource_id: outputResourceId };
  if (!jobId) return null;
  const job = await getUnifiedGpuJob(jobId);
  if (job.status !== "succeeded") return normalizedFlashVsrJob(source.id, job);
  const current = flashVsrFinalizers.get(source.id);
  if (current) return current;
  const finalize = finalizeFlashVsrEnhancement(source, jobId).finally(() => flashVsrFinalizers.delete(source.id));
  flashVsrFinalizers.set(source.id, finalize);
  return finalize;
}

async function finalizeFlashVsrEnhancement(source: StoredResource, jobId: string): Promise<FlashVsrEnhancement> {
  const outputs = await listUnifiedGpuOutputs(jobId);
  const output = outputs.find((item) => item.output_type === "video" && item.delivery_state === "ready");
  if (!output) throw new Error("FlashVSR 任务成功，但没有返回增强视频");
  const video = await downloadUnifiedGpuOutput(jobId, output.output_id);
  const stored = await writeGenerated("flashvsr", extensionForMime(video.mimeType, "mp4"), video.bytes);
  const resource = await addResource({
    id: stored.id,
    name: `FlashVSR-${new Date().toLocaleString("zh-CN")}.mp4`,
    type: "video",
    mimeType: video.mimeType,
    size: await fileSize(stored.target),
    fileName: stored.fileName,
    createdAt: new Date().toISOString(),
    source: "flashvsr",
    metadata: {
      model: "flashvsr",
      jobId,
      sourceResourceId: source.id,
      sourceJobId: source.metadata?.jobId,
      width: Number(source.metadata?.width) ? Number(source.metadata?.width) * 2 : undefined,
      height: Number(source.metadata?.height) ? Number(source.metadata?.height) * 2 : undefined,
      duration: source.metadata?.duration,
    },
  });
  await updateResource(source.id, { metadata: { ...(source.metadata || {}), flashVsrJobId: jobId, flashVsrOutputResourceId: resource.id } });
  return { id: jobId, source_resource_id: source.id, status: "succeeded", stage: "completed", progress: 100, output_resource_id: resource.id };
}

async function requiredH3Source(sourceResourceId: string) {
  const source = await resourceById(sourceResourceId);
  if (!source || source.type !== "video") throw new Error("FlashVSR 源视频不存在");
  if (source.metadata?.model !== "minimax-h3" && source.source !== "h3") throw new Error("FlashVSR 当前只支持 MiniMax H3 生成的视频");
  if (!source.metadata?.jobId) throw new Error("源视频缺少成都调度任务 ID，无法启动 FlashVSR");
  return source;
}

function normalizedFlashVsrJob(sourceResourceId: string, job: { job_id: string; status: string; stage?: string | null; progress?: number | null; error?: string | null }): FlashVsrEnhancement {
  const status = String(job.status || "");
  const normalizedStatus: FlashVsrEnhancement["status"] = status === "succeeded" || status === "failed" || status === "canceled"
    ? status
    : ["accepted", "preparing", "queued", "dispatching"].includes(status)
      ? "queued"
      : "running";
  return {
    id: job.job_id,
    source_resource_id: sourceResourceId,
    status: normalizedStatus,
    stage: String(job.stage || status || "queued"),
    progress: Math.max(0, Math.min(100, Number(job.progress) || 0)),
    error_message: job.error || null,
  };
}

async function resourceDataUri(id: string) {
  const resource = await resourceById(id);
  if (!resource) throw new Error(`参考资源不存在：${id}`);
  return `data:${resource.mimeType};base64,${(await readFile(safeResourcePath(resource.fileName))).toString("base64")}`;
}

export function buildH3JobPayload(input: { externalJobId: string; count: number; prompt: string; quality: string; duration: number; inputMode?: string; images: string[]; videos: string[]; audios: string[] }) {
  if (input.videos.length) throw new Error("当前 H3 Runtime 不支持参考视频；请仅连接图片或音频参考");
  const inputMode = String(input.inputMode || "text");
  if (inputMode === "text" && (input.images.length || input.audios.length)) throw new Error("H3 文生视频模式不接受参考图片或音频");
  if (inputMode === "firstFrame" && (input.images.length !== 1 || input.audios.length)) throw new Error("H3 首帧生视频需要且只接受一张首帧图片");
  if (inputMode === "firstLastFrame" && input.images.length !== 2) throw new Error("H3 首尾帧生视频需要按顺序连接两张图片");
  if (inputMode === "multimodal" && !input.images.length && !input.audios.length) throw new Error("H3 多模态参考至少需要一张图片或一段音频");
  const mode = inputMode === "firstFrame" ? "i2v" : inputMode === "text" ? "t2v" : "r2v";
  return {
    parameters: {
      mode,
      prompt: input.prompt,
      quality: input.quality,
      duration_seconds: input.duration,
    },
    inputs: [
      ...input.images.map((asset_id) => ({ role: mode === "i2v" ? "first_frame" : "reference_image", asset_id })),
      ...input.audios.map((asset_id) => ({ role: "reference_audio", asset_id })),
    ],
  };
}

export function formatH3ErrorDetail(payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : undefined;
  const detail = record?.detail;
  const messages = Array.isArray(detail)
    ? detail.map((item) => {
        if (!item || typeof item !== "object") return "";
        const issue = item as Record<string, unknown>;
        const location = Array.isArray(issue.loc) ? issue.loc.map(String).filter(Boolean).join(".") : "";
        const message = typeof issue.msg === "string" ? issue.msg : "";
        if (!message) return "";
        return `${location ? `${location}：` : ""}${issue.type === "extra_forbidden" ? "不支持的请求字段" : message}`;
      })
    : [typeof detail === "string" ? detail : typeof record?.message === "string" ? record.message : typeof record?.error === "string" ? record.error : ""];
  const safe = messages.filter(Boolean).join("；").replace(/\s+/g, " ").trim();
  return safe ? safe.slice(0, 500) : undefined;
}

function required(name: string) { const value = String(process.env[name] || "").trim(); if (!value) throw new Error(`请在 .env 中填写 ${name}`); return value; }
function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
async function downloadBinary(url: string, label: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`${label}下载失败（${response.status}）`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream" };
}
function extensionForMime(mimeType: string, fallback: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return fallback;
}
function mediaContent(mimeType: string, dataUrl: string) {
  if (mimeType.startsWith("video/")) return { type: "video_url", video_url: { url: dataUrl } };
  if (mimeType.startsWith("audio/")) return { type: "audio_url", audio_url: { url: dataUrl } };
  return { type: "image_url", image_url: { url: dataUrl } };
}
function resolveLlmDeployment(model: string) {
  const envByModel: Record<string, string> = {
    "doubao-seed-2-1-turbo-260628": "ARK_DOUBAO_TURBO_MODEL",
    "deepseek-v4-flash-ga-260731": "ARK_DEEPSEEK_V4_FLASH_MODEL",
    "deepseek-v4-pro-260425": "ARK_DEEPSEEK_V4_PRO_MODEL",
    "glm-5.2": "BIGMODEL_GLM_52_MODEL",
    "glm-5v-turbo": "BIGMODEL_GLM_5V_MODEL",
  };
  return String(process.env[envByModel[model]] || model).trim();
}
function modelAcceptsMimeType(model: string, mimeType: string) {
  if (models.runwareLlm.includes(model)) return /^(image|video|audio)\//.test(mimeType);
  if (model === "glm-5v-turbo") return /^(image|video)\//.test(mimeType);
  if (model === "doubao-seed-2-1-turbo-260628") return mimeType.startsWith("image/");
  return false;
}
async function responseError(response: Response, fallback: string) {
  const text = (await response.text()).trim();
  if (!text) return fallback;
  let message = "";
  try { message = String(JSON.parse(text)?.error?.message || fallback); } catch { message = text; }
  return message
    .replace(/https?:\/\/\S+/gi, "[临时素材 URL 已脱敏]")
    .replace(/(?:token|apikey|authorization)\s*[:=]?\s*[^\s,;]+/gi, "$1: ***")
    .slice(0, 400);
}
