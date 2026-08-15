import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { addResource, fileSize, resourceById, safeResourcePath, writeGenerated } from "./storage";
import type { StoredResource } from "./types";
import { getSunoCallbackUrl } from "./suno-callback";
import { createModelAssetLease, type ModelAssetLease } from "./model-asset-url";
import { providerModels as models } from "./model-catalog";

export { models };

export async function generateText(prompt: string, requestedModel?: string, inputResourceIds: string[] = [], inputDataUrls: string[] = [], systemPrompt = "") {
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
      body: JSON.stringify({ model, messages, ...(logicalModel === "deepseek-v4-flash-ga-260731" ? { thinking: { type: "enabled" } } : {}), stream: false }),
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

export async function generateMusic(input: { prompt: string; model?: string; params?: Record<string, unknown> }) {
  const baseUrl = (process.env.SUNO_BASE_URL || "https://api.sunoapi.org").replace(/\/$/, "");
  const apiKey = required("SUNO_API_KEY");
  const params = input.params || {};
  const createResponse = await fetch(`${baseUrl}/api/v1/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      model: input.model || models.music,
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

export async function generateImage(input: { prompt: string; model: string; width?: number; height?: number; referenceResourceIds?: string[] }) {
  if (!models.image.includes(input.model)) throw new Error("只支持已配置的 Runware 图片模型");
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

export type H3GenerationProgress = {
  stage: "submitted" | "queued" | "running" | "completed";
  jobId: string;
  outputIndex: number;
  progress?: number;
  label: string;
};

export async function generateH3Video(input: { prompt: string; duration: number; quality?: string; count?: number; imageResourceIds?: string[]; videoResourceIds?: string[]; audioResourceIds?: string[]; onProgress?: (progress: H3GenerationProgress) => void | Promise<void> }) {
  const config = { baseUrl: required("H3_BASE_URL").replace(/\/$/, ""), apiKey: required("H3_API_KEY") };
  if (!Number.isInteger(input.duration) || input.duration < 3 || input.duration > 15) throw new Error("H3 时长必须为 3–15 秒整数");
  if (input.videoResourceIds?.length) throw new Error("当前 H3 Runtime 不支持参考视频；请仅连接图片或音频参考");
  const images = await Promise.all((input.imageResourceIds || []).slice(0, 9).map((id) => uploadH3Asset(config, id, "images")));
  const audios = await Promise.all((input.audioResourceIds || []).slice(0, 3).map((id) => uploadH3Asset(config, id, "audio")));
  await ensureH3Runtime(config);
  const externalJobId = randomUUID();
  const qualities = ["preview", "base_768p", "standard_480p", "standard_768p", "portrait_preview", "portrait_768p", "standard_portrait_480p", "standard_portrait_768p"];
  const quality = qualities.includes(String(input.quality)) ? String(input.quality) : "preview";
  const count = Math.max(1, Math.min(3, Number(input.count) || 1));
  const payload = buildH3JobPayload({ externalJobId, count, prompt: input.prompt, quality, duration: input.duration, images, videos: [], audios });
  const response = await h3Json(config, "/api/v1/h3/jobs/batch", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": externalJobId }, body: JSON.stringify(payload) });
  const jobIds = (response.items || []).map((item: any) => String(item.job_id || "")).filter(Boolean);
  if (!jobIds.length) throw new Error("H3 没有返回 Job ID");
  await Promise.allSettled(jobIds.map((jobId: string, outputIndex: number) => input.onProgress?.({ stage: "submitted", jobId, outputIndex, progress: 0, label: "MiniMax H3 任务已提交" })));
  return Promise.all(jobIds.map(async (jobId: string, outputIndex: number) => {
    let job: any;
    let previousProgressSignature = "";
    do {
      await wait(5000);
      job = await h3Json(config, `/api/v1/h3/jobs/${encodeURIComponent(jobId)}`);
      const stage = job.status === "queued" ? "queued" : job.status === "running" ? "running" : "completed";
      const progress = Number.isFinite(Number(job.progress)) ? Math.max(0, Math.min(100, Number(job.progress))) : undefined;
      const signature = `${stage}:${progress ?? ""}`;
      if (signature !== previousProgressSignature) {
        previousProgressSignature = signature;
        await input.onProgress?.({ stage, jobId, outputIndex, ...(progress != null ? { progress } : {}), label: stage === "queued" ? "MiniMax H3 排队中" : stage === "running" ? "MiniMax H3 生成中" : "MiniMax H3 正在保存结果" });
      }
    } while (["queued", "running"].includes(job.status));
    if (job.status !== "succeeded") throw new Error(job.error || `H3 任务状态：${job.status}`);
    const videoResponse = await fetch(`${config.baseUrl}/api/v1/h3/jobs/${encodeURIComponent(jobId)}/content`, { headers: auth(config) });
    if (!videoResponse.ok) throw new Error(`H3 视频下载失败（${videoResponse.status}）`);
    const stored = await writeGenerated("h3", "mp4", new Uint8Array(await videoResponse.arrayBuffer()));
    return addResource({ id: stored.id, name: `H3-${new Date().toLocaleString("zh-CN")}-${outputIndex + 1}.mp4`, type: "video", mimeType: "video/mp4", size: await fileSize(stored.target), fileName: stored.fileName, createdAt: new Date().toISOString(), source: "h3", metadata: { jobId, outputIndex, quality, duration: input.duration, width: job.width, height: job.height, seed: job.seed } });
  }));
}

async function resourceDataUri(id: string) {
  const resource = await resourceById(id);
  if (!resource) throw new Error(`参考资源不存在：${id}`);
  return `data:${resource.mimeType};base64,${(await readFile(safeResourcePath(resource.fileName))).toString("base64")}`;
}

async function uploadH3Asset(config: { baseUrl: string; apiKey: string }, id: string, kind: "images" | "videos" | "audio") {
  const resource = await resourceById(id);
  if (!resource) throw new Error(`H3 参考资源不存在：${id}`);
  const form = new FormData();
  form.append("file", new Blob([await readFile(safeResourcePath(resource.fileName))], { type: resource.mimeType }), path.basename(resource.fileName));
  const response = await fetch(`${config.baseUrl}/api/v1/h3/assets/${kind}`, { method: "POST", headers: auth(config), body: form });
  if (!response.ok) throw await h3ResponseError(response, "H3 素材上传失败");
  return ((await response.json()) as any).asset_id as string;
}

export function buildH3JobPayload(input: { externalJobId: string; count: number; prompt: string; quality: string; duration: number; images: string[]; videos: string[]; audios: string[] }) {
  if (input.videos.length) throw new Error("当前 H3 Runtime 不支持参考视频；请仅连接图片或音频参考");
  const mode = input.images.length || input.audios.length ? "r2v" : "t2v";
  return {
    external_job_id: input.externalJobId,
    count: input.count,
    request: {
      mode,
      prompt: input.prompt,
      quality: input.quality,
      duration_seconds: input.duration,
      steps: 20,
      ...(mode === "r2v" && input.images.length ? { reference_image_asset_ids: input.images } : {}),
      ...(mode === "r2v" && input.audios.length ? { reference_audio_asset_ids: input.audios } : {}),
      ref_image_size: "match",
    },
  };
}

async function ensureH3Runtime(config: { baseUrl: string; apiKey: string }) {
  const current = await h3Json(config, "/api/v1/gpu/runtime");
  if (current.active_runtime === "h3" && current.runtime_ready !== false && current.runtime_phase !== "warming") return;
  const response = await fetch(`${config.baseUrl}/api/v1/gpu/runtime/h3`, { method: "POST", headers: auth(config) });
  if (response.status === 409) throw new Error("GPU Runtime 忙碌，请等待活动任务结束后重试");
  if (!response.ok) throw await h3ResponseError(response, "H3 Runtime 切换失败");
  const result = await response.json() as any;
  if (result.active_runtime !== "h3" || result.runtime_ready === false) throw new Error("H3 Runtime 尚未就绪");
}

async function h3Json(config: { baseUrl: string; apiKey: string }, endpoint: string, init: RequestInit = {}) {
  const response = await fetch(`${config.baseUrl}${endpoint}`, { ...init, headers: { ...auth(config), ...init.headers } });
  if (!response.ok) throw await h3ResponseError(response, "H3 服务请求失败");
  return response.json() as Promise<any>;
}

async function h3ResponseError(response: Response, label: string) {
  const payload = await response.json().catch(() => undefined);
  const detail = formatH3ErrorDetail(payload);
  return new Error(`${label}（${response.status}）${detail ? `：${detail}` : ""}`);
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

function auth(config: { apiKey: string }) { return { Authorization: `Bearer ${config.apiKey}` }; }
function required(name: string) { const value = String(process.env[name] || "").trim(); if (!value) throw new Error(`请在 .env 中填写 ${name}`); return value; }
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
