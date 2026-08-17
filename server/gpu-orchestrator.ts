import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resourceById, safeResourcePath } from "./storage";

export type GpuJobProgress = {
  stage: "submitted" | "queued" | "running" | "completed";
  jobId: string;
  outputIndex: number;
  progress?: number;
  label: string;
};

export type UnifiedGpuJob = {
  job_id: string;
  model_id: string;
  operation: string;
  status: string;
  terminal?: boolean;
  progress?: number | null;
  stage?: string | null;
  error?: string | null;
  parameters?: Record<string, unknown>;
};

type UnifiedGpuOutput = {
  output_id: string;
  output_type: string;
  media_type?: string | null;
  delivery_state: string;
  size_bytes?: number | null;
  metadata?: Record<string, unknown>;
  content_url?: string | null;
};

export function gpuApiConfigured() {
  return Boolean(gpuApiBaseUrl(false) && gpuApiToken(false));
}

export function gpuApiBaseUrl(required = true) {
  const value = String(process.env.GPU_API_BASE_URL || process.env.H3_BASE_URL || "").trim().replace(/\/$/, "");
  if (required && !value) throw new Error("请在 .codex/.env 中填写 GPU_API_BASE_URL");
  return value;
}

export function gpuApiToken(required = true) {
  const value = String(process.env.GPU_API_TOKEN || process.env.H3_API_KEY || "").trim();
  if (required && !value) throw new Error("请在 .codex/.env 中填写 GPU_API_TOKEN");
  return value;
}

export async function uploadGpuResource(resourceId: string, kind: "images" | "audio", signal?: AbortSignal) {
  const resource = await resourceById(resourceId);
  if (!resource) throw new Error(`GPU 参考资源不存在：${resourceId}`);
  const form = new FormData();
  form.append("file", new Blob([await readFile(safeResourcePath(resource.fileName))], { type: resource.mimeType }), path.basename(resource.fileName));
  const response = await gpuFetch(`/api/v2/assets/${kind}`, { method: "POST", body: form }, signal, 120_000);
  if (!response.ok) throw await gpuApiError(response, "GPU 素材上传失败");
  const payload = await response.json() as { asset_id?: string };
  if (!payload.asset_id) throw new Error("GPU 调度中心没有返回素材 ID");
  return payload.asset_id;
}

export async function submitUnifiedGpuJob(input: {
  modelId: "minimax-h3" | "minimax-music-3" | "ernie-image-turbo" | "ltx-2.5" | "flashvsr";
  operation: "image.generate" | "video.generate" | "video.enhance" | "audio.generate";
  contractVersion: "1" | "2";
  parameters: Record<string, unknown>;
  inputs?: Array<{ role: string; asset_id: string }>;
  clientJobId?: string;
  signal?: AbortSignal;
}) {
  const clientJobId = input.clientJobId || randomUUID();
  const response = await gpuFetch("/api/v2/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `croco:${clientJobId}`,
    },
    body: JSON.stringify({
      model_id: input.modelId,
      operation: input.operation,
      contract_version: input.contractVersion,
      client_job_id: clientJobId,
      parameters: input.parameters,
      inputs: input.inputs || [],
    }),
  }, input.signal, 35 * 60_000);
  if (!response.ok) throw await gpuApiError(response, `${modelDisplayName(input.modelId)} 提交失败`, input.modelId);
  const job = await response.json() as UnifiedGpuJob;
  if (!job.job_id) throw new Error(`${modelDisplayName(input.modelId)} 没有返回任务 ID`);
  gpuEvent("submitted", { job_id: job.job_id, model_id: input.modelId, operation: input.operation, status: job.status });
  return job;
}

export async function getUnifiedGpuJob(jobId: string, signal?: AbortSignal) {
  const response = await gpuFetch(`/api/v2/jobs/${encodeURIComponent(jobId)}`, {}, signal, 30_000);
  if (!response.ok) throw await gpuApiError(response, "GPU 任务查询失败");
  return response.json() as Promise<UnifiedGpuJob>;
}

export async function waitForUnifiedGpuJob(input: {
  job: UnifiedGpuJob;
  outputIndex?: number;
  signal?: AbortSignal;
  onProgress?: (progress: GpuJobProgress) => void | Promise<void>;
}) {
  const outputIndex = input.outputIndex || 0;
  let job = input.job;
  let signature = "";
  while (!isTerminalGpuStatus(job.status)) {
    input.signal?.throwIfAborted();
    const state = gpuProgressState(job);
    const nextSignature = `${state.stage}:${state.progress ?? ""}:${state.label}`;
    if (nextSignature !== signature) {
      signature = nextSignature;
      await input.onProgress?.({ jobId: job.job_id, outputIndex, ...state });
    }
    await wait(3000, input.signal);
    job = await getUnifiedGpuJob(job.job_id, input.signal);
  }
  if (job.status !== "succeeded") {
    gpuEvent("terminal", { job_id: job.job_id, model_id: job.model_id, status: job.status });
    throw new Error(job.error || `${modelDisplayName(job.model_id)} 任务状态：${job.status}`);
  }
  gpuEvent("terminal", { job_id: job.job_id, model_id: job.model_id, status: job.status });
  await input.onProgress?.({ jobId: job.job_id, outputIndex, stage: "completed", progress: 100, label: `${modelDisplayName(job.model_id)} 正在保存结果` });
  return job;
}

export async function listUnifiedGpuOutputs(jobId: string, signal?: AbortSignal) {
  const response = await gpuFetch(`/api/v2/jobs/${encodeURIComponent(jobId)}/outputs`, {}, signal, 30_000);
  if (!response.ok) throw await gpuApiError(response, "GPU 任务产物查询失败");
  const payload = await response.json() as { items?: UnifiedGpuOutput[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function downloadUnifiedGpuOutput(jobId: string, outputId: string, signal?: AbortSignal) {
  const response = await gpuFetch(`/api/v2/jobs/${encodeURIComponent(jobId)}/outputs/${encodeURIComponent(outputId)}/content`, {}, signal, 10 * 60_000);
  if (!response.ok) throw await gpuApiError(response, "GPU 任务产物下载失败");
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream",
  };
}

export async function cancelUnifiedGpuJob(jobId: string) {
  const response = await gpuFetch(`/api/v2/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }, undefined, 30_000);
  if (!response.ok && response.status !== 404 && response.status !== 409) throw await gpuApiError(response, "GPU 任务取消失败");
}

export async function cancelH3GpuJob(jobId: string) {
  return cancelUnifiedGpuJob(jobId);
}

export function gpuProgressState(job: Pick<UnifiedGpuJob, "model_id" | "status" | "stage" | "progress">): Omit<GpuJobProgress, "jobId" | "outputIndex"> {
  const name = modelDisplayName(job.model_id);
  const status = String(job.status || "").toLowerCase();
  const progress = Number.isFinite(Number(job.progress)) ? Math.max(0, Math.min(100, Number(job.progress))) : undefined;
  if (["accepted", "preparing", "queued", "dispatching"].includes(status)) return { stage: "queued", progress, label: `${name} 排队或准备中` };
  if (["running", "canceling", "unknown"].includes(status)) return { stage: "running", progress, label: `${name} 生成中` };
  return { stage: "completed", progress, label: `${name} 正在保存结果` };
}

export function modelDisplayName(modelId: string) {
  return ({
    "minimax-h3": "MiniMax H3",
    "minimax-music-3": "MiniMax Music 3",
    "ltx-2.5": "LTX 2.5",
    "ernie-image-turbo": "ERNIE Image Turbo",
    flashvsr: "FlashVSR",
  } as Record<string, string>)[modelId] || modelId;
}

function isTerminalGpuStatus(status: string) {
  return ["succeeded", "failed", "canceled", "blocked"].includes(String(status || "").toLowerCase());
}

async function gpuFetch(endpoint: string, init: RequestInit = {}, signal?: AbortSignal, timeoutMs = 30_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return fetch(`${gpuApiBaseUrl()}${endpoint}`, {
    ...init,
    headers: { Authorization: `Bearer ${gpuApiToken()}`, ...init.headers },
    signal: combinedSignal,
  });
}

async function gpuApiError(response: Response, label: string, modelId?: string) {
  const payload = await response.json().catch(() => undefined) as any;
  const detail = payload?.detail;
  const code = typeof detail === "object" ? String(detail?.code || "") : "";
  const message = typeof detail === "object"
    ? String(detail?.message || "")
    : typeof detail === "string"
      ? detail
      : String(payload?.message || payload?.error || "");
  const model = modelDisplayName(modelId || "模型");
  if (code === "MODEL_DISABLED") return new Error(`${model} 当前已在 GPU 调度台关闭`);
  if (code === "MODEL_UNAVAILABLE") return new Error(`${model} 当前没有可用的 GPU 实例`);
  if (code === "MODEL_NOT_FOUND" || code === "MODEL_CONTRACT_NOT_FOUND") return new Error(`${model} 尚未在 GPU 调度中心配置`);
  const safe = message.replace(/\s+/g, " ").trim().slice(0, 500);
  return new Error(`${label}（${response.status}）${safe ? `：${safe}` : ""}`);
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function gpuEvent(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "gpu-v2", event, ...fields }));
}
