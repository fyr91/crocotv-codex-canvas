import { deleteCloudAssets, getCloudAsset, uploadCloudAsset } from "@/services/api/cloud-assets";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

export async function uploadMediaFile(input: string | Blob, prefix = "file", options: { onProgress?: (uploadedBytes: number, totalBytes: number) => void } = {}): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const kind = prefix === "video" ? "video" : prefix === "audio" ? "audio" : "file";
    const localUrl = URL.createObjectURL(blob);
    try {
        const metaPromise = blob.type.startsWith("video/") ? readVideoMeta(localUrl) : blob.type.startsWith("audio/") ? readAudioMeta(localUrl) : Promise.resolve({});
        const [asset, meta] = await Promise.all([
            uploadCloudAsset(blob, kind, kind === "video" ? "上传视频" : kind === "audio" ? "上传音频" : "上传文件", {}, { onProgress: options.onProgress }),
            metaPromise,
        ]);
        return { url: asset.url || "", storageKey: asset.id, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
    } finally {
        URL.revokeObjectURL(localUrl);
    }
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    try { return (await getCloudAsset(storageKey)).url || fallback; } catch { return fallback; }
}

export async function getMediaBlob(storageKey: string) {
    const url = await resolveMediaUrl(storageKey);
    return url ? (await fetch(url)).blob() : null;
}

export async function setMediaBlob(_storageKey: string, blob: Blob) {
    return (await uploadMediaFile(blob)).url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await deleteCloudAssets(Array.from(new Set(keys)));
}

export async function cleanupUnusedMedia(_usedData: unknown) {}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string") keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done; video.onerror = done; video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done; audio.onerror = done; audio.src = url;
    });
}
