export function uploadProgress(uploadedBytes: number, totalBytes: number) {
    if (totalBytes <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)));
}
