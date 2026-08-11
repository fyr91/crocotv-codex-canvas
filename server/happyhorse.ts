import { readFile } from "node:fs/promises";
import { createModelAssetLease, type ModelAssetLease } from "./model-asset-url";
import { getTemporaryPublicResourceUrl } from "./suno-callback";
import { addResource, fileSize, resourceById, safeResourcePath, writeGenerated } from "./storage";
import type { StoredResource } from "./types";

export type HappyHorseInputMode = "text" | "firstFrame" | "referenceImages" | "videoEdit";

export type HappyHorseGenerationProgress = {
  stage: "submitted" | "queued" | "running" | "completed";
  jobId: string;
  outputIndex: 0;
  progress?: number;
  label: string;
};

export type HappyHorseVideoInput = {
  prompt: string;
  inputMode: HappyHorseInputMode;
  duration?: number;
  quality?: string;
  ratio?: string;
  watermark?: boolean;
  audioSetting?: "auto" | "origin";
  imageResourceIds?: string[];
  videoResourceIds?: string[];
  onProgress?: (progress: HappyHorseGenerationProgress) => void | Promise<void>;
};

export const happyHorseModels: Record<HappyHorseInputMode, string> = {
  text: "happyhorse-1.1-t2v",
  firstFrame: "happyhorse-1.1-i2v",
  referenceImages: "happyhorse-1.1-r2v",
  videoEdit: "happyhorse-1.0-video-edit",
};

export async function generateHappyHorseVideo(input: HappyHorseVideoInput): Promise<StoredResource[]> {
  validateHappyHorseInput(input);
  const config = happyHorseConfig();
  const leases: ModelAssetLease[] = [];
  try {
    const videos = await leaseVideoResources(input.videoResourceIds || [], leases);
    const images = await imageDataUrls(input.imageResourceIds || []);
    const requestBody = happyHorseRequestBody(input, videos.map((lease) => lease.url), images);
    const response = await fetch(`${config.baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60_000),
    });
    const created = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new Error(happyHorseError(created, `Happy Horse 视频任务创建失败（${response.status}）`));
    const taskId = String(created.output?.task_id || "").trim();
    if (!taskId) throw new Error("Happy Horse 没有返回任务 ID");
    await input.onProgress?.({ stage: "submitted", jobId: taskId, outputIndex: 0, progress: 0, label: "Happy Horse 任务已提交" });

    const completed = await pollHappyHorseTask(config, taskId, input.onProgress);
    const videoUrl = String(completed.output?.video_url || "").trim();
    if (!videoUrl) throw new Error("Happy Horse 任务成功，但没有返回视频地址");
    const video = await fetch(videoUrl, { signal: AbortSignal.timeout(180_000) });
    if (!video.ok) throw new Error(`Happy Horse 视频下载失败（${video.status}）`);
    const stored = await writeGenerated("happyhorse", "mp4", new Uint8Array(await video.arrayBuffer()));
    const duration = Number(completed.usage?.output_video_duration ?? completed.usage?.duration ?? input.duration);
    const resource = await addResource({
      id: stored.id,
      name: `HappyHorse-${new Date().toLocaleString("zh-CN")}.mp4`,
      type: "video",
      mimeType: video.headers.get("content-type")?.split(";")[0] || "video/mp4",
      size: await fileSize(stored.target),
      fileName: stored.fileName,
      createdAt: new Date().toISOString(),
      source: "happyhorse",
      metadata: {
        taskId,
        model: happyHorseModels[input.inputMode],
        inputMode: input.inputMode,
        quality: normalizedQuality(input.quality, input.inputMode),
        ratio: input.inputMode === "text" || input.inputMode === "referenceImages" ? normalizedRatio(input.ratio) : undefined,
        duration: Number.isFinite(duration) ? duration : undefined,
      },
    });
    return [resource];
  } finally {
    await Promise.allSettled(leases.map((lease) => lease.release()));
  }
}

export function happyHorseRequestBody(input: HappyHorseVideoInput, videoUrls: string[], imageUrls: string[]) {
  validateHappyHorseInput(input);
  const mode = input.inputMode;
  const media = mode === "firstFrame"
    ? imageUrls.map((url) => ({ type: "first_frame", url }))
    : mode === "referenceImages"
      ? imageUrls.map((url) => ({ type: "reference_image", url }))
      : mode === "videoEdit"
        ? [...videoUrls.map((url) => ({ type: "video", url })), ...imageUrls.map((url) => ({ type: "reference_image", url }))]
        : [];
  const common = {
    resolution: normalizedQuality(input.quality, mode),
    watermark: input.watermark === true,
  };
  const parameters = mode === "videoEdit"
    ? { ...common, audio_setting: input.audioSetting === "origin" ? "origin" : "auto" }
    : {
        ...common,
        ...(mode === "text" || mode === "referenceImages" ? { ratio: normalizedRatio(input.ratio) } : {}),
        duration: Number(input.duration),
      };
  return {
    model: happyHorseModels[mode],
    input: { prompt: input.prompt, ...(media.length ? { media } : {}) },
    parameters,
  };
}

export function validateHappyHorseInput(input: HappyHorseVideoInput) {
  const images = input.imageResourceIds || [];
  const videos = input.videoResourceIds || [];
  if (!input.prompt.trim()) throw new Error("Happy Horse Prompt 不能为空");
  if (!(input.inputMode in happyHorseModels)) throw new Error("Happy Horse 不支持当前视频输入模式");
  if (input.inputMode === "text" && (images.length || videos.length)) throw new Error("Happy Horse 文生视频不接受媒体输入");
  if (input.inputMode === "firstFrame" && (images.length !== 1 || videos.length)) throw new Error("Happy Horse 首帧生视频需要且只接受一张图片");
  if (input.inputMode === "referenceImages" && (images.length < 1 || images.length > 9 || videos.length)) throw new Error("Happy Horse 参考图生视频需要 1 至 9 张图片");
  if (input.inputMode === "videoEdit" && (videos.length !== 1 || images.length > 5)) throw new Error("Happy Horse 视频编辑需要一条视频，且最多支持 5 张参考图片");
  if (input.inputMode !== "videoEdit") {
    const duration = Number(input.duration);
    if (!Number.isInteger(duration) || duration < 3 || duration > 15) throw new Error("Happy Horse 时长必须为 3–15 秒整数");
  }
  const imageReference = Array.from(input.prompt.matchAll(/\[Image\s+(\d+)\]/gi), (match) => Number(match[1]));
  if ((input.inputMode === "referenceImages" || input.inputMode === "videoEdit") && imageReference.length && Math.max(...imageReference) > images.length) {
    throw new Error("Happy Horse 提示词引用了不存在的参考图片");
  }
}

async function leaseVideoResources(resourceIds: string[], leases: ModelAssetLease[]) {
  const created: ModelAssetLease[] = [];
  for (const resourceId of resourceIds) {
    const resource = await resourceById(resourceId);
    if (!resource || !resource.mimeType.startsWith("video/")) throw new Error("Happy Horse 待编辑视频的资源类型不正确");
    if (resource.size > 100 * 1024 * 1024) throw new Error("Happy Horse 待编辑视频不能超过 100 MB");
    const lease = resource.size <= 10 * 1024 * 1024
      ? await createModelAssetLease(resourceId)
      : { mimeType: resource.mimeType, url: await getTemporaryPublicResourceUrl(resourceId, 60 * 60_000), release: async () => undefined };
    leases.push(lease);
    created.push(lease);
  }
  return created;
}

async function imageDataUrls(resourceIds: string[]) {
  return Promise.all(resourceIds.map(async (resourceId) => {
    const resource = await resourceById(resourceId);
    if (!resource || !["image/jpeg", "image/png", "image/webp"].includes(resource.mimeType)) throw new Error("Happy Horse 图片只支持 JPEG、PNG 或 WEBP");
    if (resource.size > 20 * 1024 * 1024) throw new Error("Happy Horse 单张参考图片不能超过 20 MB");
    const bytes = await readFile(safeResourcePath(resource.fileName));
    return `data:${resource.mimeType};base64,${bytes.toString("base64")}`;
  }));
}

async function pollHappyHorseTask(
  config: { baseUrl: string; apiKey: string },
  taskId: string,
  onProgress?: HappyHorseVideoInput["onProgress"],
) {
  const deadline = Date.now() + 30 * 60_000;
  let previousStatus = "";
  while (Date.now() < deadline) {
    await wait(15_000);
    const response = await fetch(`${config.baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new Error(happyHorseError(payload, `Happy Horse 任务查询失败（${response.status}）`));
    const status = String(payload.output?.task_status || "").toUpperCase();
    if (status !== previousStatus) {
      previousStatus = status;
      if (["PENDING", "QUEUED"].includes(status)) await onProgress?.({ stage: "queued", jobId: taskId, outputIndex: 0, label: "Happy Horse 排队中" });
      if (status === "RUNNING") await onProgress?.({ stage: "running", jobId: taskId, outputIndex: 0, label: "Happy Horse 生成中" });
    }
    if (status === "SUCCEEDED") {
      await onProgress?.({ stage: "completed", jobId: taskId, outputIndex: 0, progress: 100, label: "Happy Horse 正在保存结果" });
      return payload;
    }
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(status)) {
      const fallback = status === "UNKNOWN" ? "任务不存在或已超过 24 小时有效期" : `Happy Horse 视频生成失败（${status}）`;
      throw new Error(happyHorseError(payload, fallback));
    }
  }
  throw new Error("Happy Horse 视频生成超时，请稍后重试");
}

function happyHorseConfig() {
  const baseUrl = String(process.env.HAPPYHORSE_BASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = String(process.env.HAPPYHORSE_API_KEY || process.env.DASHSCOPE_API_KEY || "").trim();
  if (!baseUrl) throw new Error("请在 .env 中填写 HAPPYHORSE_BASE_URL（阿里云百炼 Workspace Endpoint）");
  if (!apiKey) throw new Error("请在 .env 中填写 HAPPYHORSE_API_KEY 或 DASHSCOPE_API_KEY");
  return { baseUrl, apiKey };
}

function normalizedQuality(value: unknown, mode: HappyHorseInputMode) {
  const allowed = mode === "videoEdit" ? ["720P", "1080P"] : ["480P", "720P", "1080P"];
  const quality = String(value || "720P").toUpperCase();
  return allowed.includes(quality) ? quality : "720P";
}

function normalizedRatio(value: unknown) {
  const ratios = ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"];
  const ratio = String(value || "16:9");
  return ratios.includes(ratio) ? ratio : "16:9";
}

function happyHorseError(payload: any, fallback: string) {
  return String(payload?.output?.message || payload?.message || payload?.error?.message || fallback)
    .replace(/https?:\/\/\S+/gi, "[供应商 URL 已脱敏]")
    .replace(/(?:token|apikey|authorization)\s*[:=]?\s*[^\s,;]+/gi, "$1: ***")
    .slice(0, 400);
}

function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
