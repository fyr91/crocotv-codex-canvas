import { describe, expect, it, vi } from "vitest";

import { isUploadableAssetFile, runAssetUploadBatch } from "./asset-upload-batch";

function file(name: string, type: string) {
    return new File(["content"], name, { type });
}

describe("asset upload batch", () => {
    it("accepts image, video and audio files but rejects packages and documents", () => {
        expect(isUploadableAssetFile(file("frame.png", "image/png"))).toBe(true);
        expect(isUploadableAssetFile(file("clip.mp4", "video/mp4"))).toBe(true);
        expect(isUploadableAssetFile(file("voice.wav", "audio/wav"))).toBe(true);
        expect(isUploadableAssetFile(file("backup.zip", "application/zip"))).toBe(false);
        expect(isUploadableAssetFile(file("notes.pdf", "application/pdf"))).toBe(false);
    });

    it("uploads every supported file and reports partial failures without stopping the batch", async () => {
        const files = [file("frame.png", "image/png"), file("clip.mp4", "video/mp4"), file("notes.pdf", "application/pdf")];
        const upload = vi.fn(async (item: File) => {
            if (item.name === "clip.mp4") throw new Error("upload failed");
        });

        await expect(runAssetUploadBatch(files, upload)).resolves.toEqual({
            total: 3,
            accepted: 2,
            uploaded: 1,
            failed: 1,
            unsupported: 1,
        });
        expect(upload.mock.calls.map(([item]) => item.name)).toEqual(["frame.png", "clip.mp4"]);
    });
});
