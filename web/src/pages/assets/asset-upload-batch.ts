export type AssetUploadBatchResult = {
    total: number;
    accepted: number;
    uploaded: number;
    failed: number;
    unsupported: number;
};

const mediaExtensionPattern = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp|m4v|mkv|mov|mp4|webm|aac|flac|m4a|mp3|ogg|opus|wav)$/i;

export function isUploadableAssetFile(file: File) {
    return file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/") || (!file.type && mediaExtensionPattern.test(file.name));
}
export async function runAssetUploadBatch(files: File[], upload: (file: File) => Promise<unknown>): Promise<AssetUploadBatchResult> {
    const acceptedFiles = files.filter(isUploadableAssetFile);
    const settled = await Promise.allSettled(acceptedFiles.map(upload));
    const uploaded = settled.filter((item) => item.status === "fulfilled").length;
    return {
        total: files.length,
        accepted: acceptedFiles.length,
        uploaded,
        failed: settled.length - uploaded,
        unsupported: files.length - acceptedFiles.length,
    };
}
