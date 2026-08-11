import { readFile } from "node:fs/promises";
import path from "node:path";

export function h3Config(env = process.env) {
    const maxConcurrency = Number(env.GENERATION_MAX_CONCURRENCY);
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) throw new Error("GENERATION_MAX_CONCURRENCY 必须是正整数");
    const config = { baseUrl: String(env.H3_BASE_URL || "").replace(/\/$/, ""), apiKey: String(env.H3_API_KEY || "").trim(), maxConcurrency };
    if (!config.baseUrl) throw new Error("请在 .codex/.env 中填写 H3_BASE_URL");
    if (!config.apiKey) throw new Error("请在 .codex/.env 中填写 H3_API_KEY");
    return config;
}

export function h3ProfileForAspect(aspectRatio) {
    const ratio = String(aspectRatio || "16:9").trim();
    if (ratio === "9:16") return { aspectRatio: ratio, quality: "portrait_preview", width: 480, height: 864 };
    if (ratio === "3:4") return { aspectRatio: ratio, quality: "standard_portrait_480p", width: 480, height: 640 };
    if (ratio === "4:3") return { aspectRatio: ratio, quality: "standard_480p", width: 640, height: 480 };
    if (ratio === "16:9") return { aspectRatio: ratio, quality: "preview", width: 864, height: 480 };
    throw new Error(`H3 不支持项目画幅：${ratio}`);
}

export function buildH3Request(input) {
    const duration = Number(input.durationSeconds);
    const images = input.imageAssetIds || [], audios = input.audioAssetIds || [];
    if (!Number.isInteger(duration) || duration < 3 || duration > 15) throw new Error("H3 时长必须为 3-15 秒整数");
    if (images.length > 9) throw new Error("H3 参考图片最多 9 张");
    if (audios.length > 3) throw new Error("H3 参考音频最多 3 段");
    if (String(input.prompt || "").length > 20000) throw new Error("H3 Prompt 不能超过 20000 字符");
    const mode = images.length || audios.length ? "r2v" : "t2v";
    return { external_job_id: input.externalJobId, count: 1, request: { mode, prompt: input.prompt, quality: String(input.quality || "preview"), duration_seconds: duration, steps: 20, ...(mode === "r2v" ? { reference_image_asset_ids: images, reference_audio_asset_ids: audios } : {}), ref_image_size: "match" } };
}

export async function ensureH3Runtime(config, dependencies = {}) {
    const fetcher = dependencies.fetcher || fetch;
    const current = await json(fetcher, config, "/api/v1/gpu/runtime");
    if (current.active_runtime === "h3" && current.runtime_ready !== false && current.runtime_phase !== "warming") return current;
    const response = await fetcher(`${config.baseUrl}/api/v1/gpu/runtime/h3`, { method: "POST", headers: auth(config) });
    if (response.status === 409) throw new Error("GPU Runtime 忙碌，请等待活动任务结束后重试");
    if (!response.ok) throw new Error(`H3 Runtime 切换失败（${response.status}）`);
    const value = await response.json();
    if (value.active_runtime !== "h3" || value.runtime_ready === false) throw new Error("H3 Runtime 尚未就绪");
    return value;
}

export async function uploadH3Asset({ config, kind, filePath }, dependencies = {}) {
    const form = new FormData();
    form.append("file", new Blob([await readFile(filePath)], { type: mediaType(filePath) }), path.basename(filePath));
    const response = await (dependencies.fetcher || fetch)(`${config.baseUrl}/api/v1/h3/assets/${kind}`, { method: "POST", headers: auth(config), body: form });
    if (!response.ok) throw new Error(`H3 素材上传失败（${response.status}）`);
    return (await response.json()).asset_id;
}

function mediaType(filePath) {
    return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4" })[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export async function submitH3Job({ config, request, idempotencyKey }, dependencies = {}) {
    return json(dependencies.fetcher || fetch, config, "/api/v1/h3/jobs/batch", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(request) });
}

export async function getH3Job({ config, jobId }, dependencies = {}) {
    return json(dependencies.fetcher || fetch, config, `/api/v1/h3/jobs/${encodeURIComponent(jobId)}`);
}

export async function downloadH3({ config, jobId, kind = "content" }, dependencies = {}) {
    const suffix = kind === "poster" ? "/poster" : "/content";
    const response = await (dependencies.fetcher || fetch)(`${config.baseUrl}/api/v1/h3/jobs/${encodeURIComponent(jobId)}${suffix}`, { headers: auth(config) });
    if (!response.ok) throw new Error(`H3 ${kind} 下载失败（${response.status}）`);
    return Buffer.from(await response.arrayBuffer());
}

function auth(config) { return { Authorization: `Bearer ${config.apiKey}` }; }
async function json(fetcher, config, endpoint, init = {}) {
    const response = await fetcher(`${config.baseUrl}${endpoint}`, { ...init, headers: { ...auth(config), ...(init.headers || {}) } });
    if (!response.ok) throw new Error(`H3 服务请求失败（${response.status}）`);
    return response.json();
}
