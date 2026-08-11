import { supabase } from "@/lib/supabase/client";
import { getCloudAsset, type CloudAsset } from "./cloud-assets";
import { functionErrorMessage } from "./generation-client";

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
const MINIMAX_H3_ENHANCEMENT_PROFILE = "flashvsr_v1_1_tiny_long_native2x_hevc_crf26";

export function supportsMiniMaxH3HdRepair(providerId: string, quality?: string) {
    return providerId === "minimax_h3" && MINIMAX_H3_HD_QUALITIES.has(String(quality || ""));
}

export function supportsMiniMaxH3HdDimensions(providerId: string, width?: number, height?: number) {
    return providerId === "minimax_h3" && new Set(["864x480", "640x480", "480x864", "480x640"]).has(`${Number(width)}x${Number(height)}`);
}

export async function createMiniMaxH3Enhancement(sourceAssetId: string) {
    const { data, error } = await supabase.functions.invoke("minimax-h3-enhancement", { body: { action: "create", sourceAssetId } });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "高清修复启动失败");
    return data.enhancement as MiniMaxH3EnhancementJob;
}

export async function getMiniMaxH3Enhancement(sourceAssetId: string) {
    const { data, error } = await supabase.from("video_enhancement_jobs").select("*").eq("source_asset_id", sourceAssetId).eq("profile", MINIMAX_H3_ENHANCEMENT_PROFILE).maybeSingle();
    if (error) throw error;
    return data as MiniMaxH3EnhancementJob | null;
}

export async function waitForMiniMaxH3Enhancement(sourceAssetId: string, signal?: AbortSignal, onUpdate?: (job: MiniMaxH3EnhancementJob) => void): Promise<CloudAsset> {
    let realtimeJob: MiniMaxH3EnhancementJob | null = null;
    let wake: (() => void) | null = null;
    const channel = supabase.channel(`h3-enhancement-${crypto.randomUUID()}`).on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "video_enhancement_jobs",
        filter: `source_asset_id=eq.${sourceAssetId}`,
    }, (payload) => {
        realtimeJob = payload.new as MiniMaxH3EnhancementJob;
        wake?.();
    }).subscribe();
    try {
        for (let attempt = 0; attempt < 240; attempt += 1) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const job = realtimeJob || await getMiniMaxH3Enhancement(sourceAssetId);
            realtimeJob = null;
            if (!job) throw new Error("高清修复任务不存在");
            onUpdate?.(job);
            if (job.status === "failed" || job.status === "canceled") throw new Error(job.error_message || "高清修复失败");
            if (job.status === "succeeded") {
                if (!job.output_asset_id) throw new Error("高清修复完成，但没有返回视频素材");
                return getCloudAsset(job.output_asset_id);
            }
            await new Promise<void>((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    wake = null;
                    resolve();
                };
                const timer = window.setTimeout(finish, 3000);
                wake = finish;
                if (realtimeJob) finish();
            });
        }
        throw new Error("高清修复仍在后台执行，请稍后重试");
    } finally {
        await supabase.removeChannel(channel);
    }
}
