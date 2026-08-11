import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createSignedUrl: vi.fn(),
    single: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
    supabase: {
        from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
        storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
    },
}));

import { getCloudAsset } from "./cloud-assets";

beforeEach(() => {
    mocks.createSignedUrl.mockReset();
    mocks.single.mockReset();
    mocks.single.mockResolvedValue({
        data: {
            id: "asset-audio-1",
            kind: "audio",
            title: "口播音频",
            storage_path: "owner/asset/audio.wav",
            mime_type: "audio/wav",
            byte_size: 1024,
        },
        error: null,
    });
    mocks.createSignedUrl
        .mockResolvedValueOnce({ data: { signedUrl: "https://storage.test/audio.wav?token=first" }, error: null })
        .mockResolvedValueOnce({ data: { signedUrl: "https://storage.test/audio.wav?token=second" }, error: null });
});

describe("cloud asset URLs", () => {
    it("keeps one signed URL for repeated reads of the same unchanged asset", async () => {
        const first = await getCloudAsset("asset-audio-1");
        const second = await getCloudAsset("asset-audio-1");

        expect(first.url).toBe("https://storage.test/audio.wav?token=first");
        expect(second.url).toBe(first.url);
        expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    });
});
