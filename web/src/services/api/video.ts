import type { UploadedFile } from "@/services/file-storage";
import { modelOptionName, providerIdForModel, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { CloudAsset } from "./cloud-assets";
import { watchDirectGenerationProgress } from "./direct-generation-progress";

type RequestOptions = { signal?: AbortSignal; clientRequestId?: string; ltxFrames?: unknown; onJobCreated?: (jobId: string, outputIndex?: number) => void; onStatusChange?: (status: "queued" | "running" | "succeeded" | "failed" | "canceled", outputIndex?: number) => void; onProgress?: (progress: number, stage?: string, outputIndex?: number, label?: string) => void; onResult?: (result: VideoGenerationResult) => void; onArchived?: (result: VideoGenerationResult) => void; onReviewReady?: (review: never) => void };
export type VideoGenerationResult = { outputIndex: number; blob?: Blob; url?: string; mimeType?: string; storageKey?: string; bytes?: number; width?: number; height?: number; durationMs?: number; isTemporaryPreview?: boolean };
export type VideoGenerationTask = { id: string; provider: string; model: string; expectedCount: number; reviewMode: "none" };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult[]> {
    const selectedModel = config.videoModel || config.model;
    const provider = providerIdForModel(selectedModel) || "minimax_h3";
    const providerLabel = provider === "ltx" ? "LTX 2.5" : provider === "happyhorse" ? "Happy Horse" : "MiniMax H3";
    const clientRequestId = options?.clientRequestId || crypto.randomUUID();
    const progress = watchDirectGenerationProgress(clientRequestId, {
        onJobCreated: (jobId, outputIndex) => options?.onJobCreated?.(jobId, outputIndex),
        onStatusChange: (status, outputIndex) => options?.onStatusChange?.(status, outputIndex),
        onProgress: (value, stage, outputIndex, label) => options?.onProgress?.(value, stage, outputIndex, label),
    });
    try {
        const response = await fetch("/api/generate/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        model: modelOptionName(selectedModel),
        prompt,
        optimizePrompt: config.videoPromptEnhance !== "false",
        inputMode: config.videoInputMode,
        duration: Number(config.videoSeconds) || 6,
        quality: config.vquality,
        ratio: config.size,
        count: Number(config.videoCount) || 1,
        watermark: config.videoWatermark === "true",
        audioSetting: config.videoAudioSetting,
        imageResourceIds: references.map((item) => item.storageKey).filter(Boolean),
        videoResourceIds: videoReferences.map((item) => item.storageKey).filter(Boolean),
        audioResourceIds: audioReferences.map((item) => item.storageKey).filter(Boolean),
        clientRequestId,
        }), signal: options?.signal });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error || `${providerLabel} 生成失败`);
        await progress.finish();
        const results: VideoGenerationResult[] = (payload.resources || []).map((resource: any, outputIndex: number) => ({ outputIndex, url: resource.url, storageKey: resource.id, mimeType: resource.mimeType, bytes: resource.size, width: Number(resource.metadata?.width) || 864, height: Number(resource.metadata?.height) || 480, durationMs: Number(resource.metadata?.duration || config.videoSeconds) * 1000 }));
        if (!results.length) throw new Error(`${providerLabel} 没有返回视频`);
        results.forEach((result) => options?.onResult?.(result)); return results;
    } catch (error) {
        progress.stop();
        throw error;
    }
}
export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videos: ReferenceVideo[] = [], audios: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> { let schedulerJobId = ""; await requestVideoGeneration(config, prompt, references, videos, audios, { ...options, onJobCreated: (jobId, outputIndex) => { schedulerJobId ||= jobId; options?.onJobCreated?.(jobId, outputIndex); } }); return { id: schedulerJobId || options?.clientRequestId || crypto.randomUUID(), provider: providerIdForModel(config.videoModel || config.model) || "minimax_h3", model: modelOptionName(config.videoModel || config.model), expectedCount: Number(config.videoCount) || 1, reviewMode: "none" }; }
export async function pollVideoGenerationTask(_config?: AiConfig, _task?: VideoGenerationTask, _options?: RequestOptions): Promise<VideoGenerationTaskState> { return { status: "pending" }; }
export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> { if (!result.url || !result.storageKey) throw new Error("视频资源没有写入本地资源库"); return { url: result.url, storageKey: result.storageKey, bytes: result.bytes || 0, mimeType: result.mimeType || "video/mp4", width: result.width, height: result.height, durationMs: result.durationMs }; }
export function videoResultsFromAssets(assets: CloudAsset[]): VideoGenerationResult[] { return assets.filter((item) => item.kind === "video" && item.url).map((item, outputIndex) => ({ outputIndex, url: item.url, storageKey: item.id, mimeType: item.mime_type || "video/mp4", bytes: item.byte_size || 0, width: item.width || undefined, height: item.height || undefined, durationMs: item.duration_seconds ? item.duration_seconds * 1000 : undefined })); }
export async function resumeVideoGeneration(_jobId: string, _outputIndex: number, _options?: RequestOptions) { return; }
