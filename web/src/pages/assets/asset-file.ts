import { prepareUserImageUpload } from "@/lib/user-image-compression";
import { uploadCloudAsset, type CloudAsset } from "@/services/api/cloud-assets";

type UploadableAssetKind = Extract<CloudAsset["kind"], "image" | "video" | "audio">;

export async function uploadAssetFile(file: File) {
    const kind = kindForFile(file);
    if (!kind) throw new Error(`不支持的文件类型：${file.name}`);
    const metadata = await readAssetFileMeta(file, kind);
    const prepared = kind === "image" ? await prepareUserImageUpload(file) : null;
    return uploadCloudAsset(prepared?.blob || file, kind, file.name, {
        ...metadata,
        metadata: { source: "手动上传", originalName: file.name, tags: [], coverUrl: "", ...(prepared ? { imageCompression: prepared.metadata } : {}) },
    });
}

function kindForFile(file: File): UploadableAssetKind | null {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return null;
}

function readAssetFileMeta(file: File, kind: UploadableAssetKind) {
    if (kind === "image") return readImageMeta(file);
    return readTimedMediaMeta(file, kind);
}

function readImageMeta(file: File) {
    return new Promise<{ width?: number; height?: number }>((resolve) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        const done = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined }); };
        image.onload = done;
        image.onerror = done;
        image.src = url;
    });
}

function readTimedMediaMeta(file: File, kind: "video" | "audio") {
    return new Promise<{ width?: number; height?: number; duration_seconds?: number }>((resolve) => {
        const url = URL.createObjectURL(file);
        const media = document.createElement(kind);
        const done = () => {
            URL.revokeObjectURL(url);
            const video = kind === "video" ? media as HTMLVideoElement : null;
            resolve({ width: video?.videoWidth || undefined, height: video?.videoHeight || undefined, duration_seconds: Number.isFinite(media.duration) ? media.duration : undefined });
        };
        media.onloadedmetadata = done;
        media.onerror = done;
        media.preload = "metadata";
        media.src = url;
    });
}
