import { readImageMeta } from "@/lib/image-utils";
import { prepareUserImageUpload } from "@/lib/user-image-compression";
import { cloudAssetForUrl, deleteCloudAssets, getCloudAsset, uploadCloudAsset } from "@/services/api/cloud-assets";

export type UploadedImage = { url: string; storageKey: string; width: number; height: number; bytes: number; mimeType: string };

export async function uploadImage(input: string | Blob, options: { compress?: boolean; onProgress?: (uploadedBytes: number, totalBytes: number) => void } = {}): Promise<UploadedImage> {
    const existing = typeof input === "string" ? cloudAssetForUrl(input) : undefined;
    if (existing) {
        const meta = await readImageMeta(input);
        return { url: input, storageKey: existing.id, width: existing.width || meta.width, height: existing.height || meta.height, bytes: existing.byte_size || 0, mimeType: existing.mime_type || meta.mimeType };
    }
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const localUrl = URL.createObjectURL(blob);
    try {
        const metaPromise = readImageMeta(localUrl);
        const prepared = options.compress === true ? await prepareUserImageUpload(blob) : { blob, metadata: null };
        const [asset, meta] = await Promise.all([
            uploadCloudAsset(prepared.blob, "image", "上传图片", prepared.metadata ? { metadata: { imageCompression: prepared.metadata } } : {}, { onProgress: options.onProgress }),
            metaPromise,
        ]);
        return { url: asset.url || "", storageKey: asset.id, width: meta.width, height: meta.height, bytes: prepared.blob.size, mimeType: prepared.blob.type || meta.mimeType };
    } finally {
        URL.revokeObjectURL(localUrl);
    }
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    try { return (await getCloudAsset(storageKey)).url || fallback; } catch { return fallback; }
}

export async function getImageBlob(storageKey: string) {
    const asset = await getCloudAsset(storageKey);
    return asset.url ? (await fetch(asset.url)).blob() : null;
}

export async function setImageBlob(_storageKey: string, blob: Blob) {
    return (await uploadImage(blob, { compress: false })).url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    return image.dataUrl || await resolveImageUrl(image.storageKey, image.url || "");
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await deleteCloudAssets(Array.from(new Set(keys)));
}

export async function cleanupUnusedImages(_usedData: unknown) {}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string") keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}
