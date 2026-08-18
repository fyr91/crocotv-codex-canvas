import { getCloudAsset, type CloudAsset } from "./cloud-assets";

export type MiniMaxH3EnhancementJob = {
    id: string;
    source_asset_id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "canceled";
    stage: string;
    progress: number;
    output_asset_id?: string | null;
    error_message?: string | null;
};

export const MINIMAX_H3_HD_QUALITIES = new Set(["preview", "standard_480p", "portrait_preview", "standard_portrait_480p"]);

export function supportsMiniMaxH3HdRepair(providerId: string, quality?: string) {
    return providerId === "minimax_h3" && MINIMAX_H3_HD_QUALITIES.has(String(quality || ""));
}

export function supportsMiniMaxH3HdDimensions(providerId: string, width?: number, height?: number) {
    return providerId === "minimax_h3" && new Set(["864x480", "640x480", "480x864", "480x640"]).has(`${Number(width)}x${Number(height)}`);
}

export async function createMiniMaxH3Enhancement(sourceAssetId: string) {
    const payload = await localEnhancementRequest<{ enhancement: LocalEnhancementJob }>("/api/gpu/enhancements", { method: "POST", body: JSON.stringify({ sourceResourceId: sourceAssetId }) });
    return normalizeJob(payload.enhancement);
}

export async function getMiniMaxH3Enhancement(sourceAssetId: string) {
    const payload = await localEnhancementRequest<{ enhancement: LocalEnhancementJob | null }>(`/api/gpu/enhancements/${encodeURIComponent(sourceAssetId)}`);
    return payload.enhancement ? normalizeJob(payload.enhancement) : null;
}

export async function waitForMiniMaxH3Enhancement(sourceAssetId: string, signal?: AbortSignal, onUpdate?: (job: MiniMaxH3EnhancementJob) => void): Promise<CloudAsset> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
        signal?.throwIfAborted();
        const job = await getMiniMaxH3Enhancement(sourceAssetId);
        if (!job) throw new Error("高清修复任务不存在");
        onUpdate?.(job);
        if (job.status === "failed" || job.status === "canceled") throw new Error(job.error_message || "高清修复失败");
        if (job.status === "succeeded") {
            if (!job.output_asset_id) throw new Error("高清修复完成，但没有返回视频素材");
            return getCloudAsset(job.output_asset_id);
        }
        await wait(3000, signal);
    }
    throw new Error("高清修复仍在后台执行，请稍后重试");
}

type LocalEnhancementJob = { id: string; source_resource_id: string; status: MiniMaxH3EnhancementJob["status"]; stage: string; progress: number; output_resource_id?: string | null; error_message?: string | null };
function normalizeJob(job: LocalEnhancementJob): MiniMaxH3EnhancementJob { return { id: job.id, source_asset_id: job.source_resource_id, status: job.status, stage: job.stage, progress: job.progress, output_asset_id: job.output_resource_id, error_message: job.error_message }; }
async function localEnhancementRequest<T>(url: string, init: RequestInit = {}): Promise<T> { const response = await fetch(url, { ...init, headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || `高清修复请求失败（${response.status}）`); return payload as T; }
function wait(ms: number, signal?: AbortSignal) { return new Promise<void>((resolve, reject) => { if (signal?.aborted) return reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError")); const onAbort = () => { clearTimeout(timer); reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError")); }; const timer = window.setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms); signal?.addEventListener("abort", onAbort, { once: true }); }); }
