export const USER_IMAGE_WEBP_QUALITY = 0.94;
export const USER_IMAGE_MIN_SAVING_RATIO = 0.08;

export type UserImageCompressionMetadata = {
    applied: boolean;
    quality?: number;
    originalMimeType: string;
    originalBytes: number;
    storedMimeType: string;
    storedBytes: number;
    savedBytes: number;
    savingRatio: number;
};

type UserImageEncoder = (blob: Blob) => Promise<Blob>;

const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareUserImageUpload(blob: Blob, encoder: UserImageEncoder = encodeWebp) {
    if (!supportedMimeTypes.has(blob.type) || !blob.size) return compressionResult(blob, blob, false);
    try {
        const compressed = await encoder(blob);
        if (compressed.type !== "image/webp" || compressed.size > blob.size * (1 - USER_IMAGE_MIN_SAVING_RATIO)) return compressionResult(blob, blob, false);
        return compressionResult(blob, compressed, true);
    } catch {
        return compressionResult(blob, blob, false);
    }
}

function compressionResult(original: Blob, stored: Blob, applied: boolean) {
    const savedBytes = Math.max(0, original.size - stored.size);
    return {
        blob: stored,
        metadata: {
            applied,
            quality: applied ? USER_IMAGE_WEBP_QUALITY : undefined,
            originalMimeType: original.type,
            originalBytes: original.size,
            storedMimeType: stored.type,
            storedBytes: stored.size,
            savedBytes,
            savingRatio: original.size ? Number((savedBytes / original.size).toFixed(4)) : 0,
        } satisfies UserImageCompressionMetadata,
    };
}

async function encodeWebp(blob: Blob) {
    const { default: Compressor } = await import("compressorjs");
    return new Promise<Blob>((resolve, reject) => {
        new Compressor(blob, {
            quality: USER_IMAGE_WEBP_QUALITY,
            mimeType: "image/webp",
            retainExif: false,
            checkOrientation: true,
            strict: false,
            success: resolve,
            error: reject,
        });
    });
}
