import { analyzeAudioSource } from "@/lib/audio/waveform";
import type { UploadedFile } from "@/services/file-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { CloudAsset } from "./cloud-assets";

type RequestOptions = { signal?: AbortSignal; onJobCreated?: (jobId: string) => void };
const generatedAssets = new WeakMap<Blob, CloudAsset>();

export async function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<Blob> {
    options?.onJobCreated?.(crypto.randomUUID());
    const response = await fetch("/api/generate/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: prompt, voiceId: config.audioVoice, direction: config.audioInstructions }), signal: options?.signal });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "火山引擎语音生成失败");
    const blob = await (await fetch(payload.resource.url, { signal: options?.signal })).blob();
    generatedAssets.set(blob, { id: payload.resource.id, kind: "audio", title: payload.resource.name, storage_path: payload.resource.fileName, mime_type: payload.resource.mimeType, byte_size: payload.resource.size, url: payload.resource.url, metadata: payload.resource.metadata });
    return blob;
}
export async function storeGeneratedAudio(blob: Blob): Promise<UploadedFile> { const existing = generatedAssets.get(blob); if (!existing?.url) throw new Error("语音资源没有写入本地资源库"); return { url: existing.url, storageKey: existing.id, bytes: existing.byte_size || blob.size, mimeType: existing.mime_type || "audio/mpeg", durationMs: (await analyzeAudioSource(blob, 0)).durationMs }; }
