// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));
vi.mock("./generation-client", () => ({
    createGeneration: vi.fn().mockResolvedValue({
        job: { id: "job-1" },
        assets: [{ id: "asset-1", url: "/generated.mp3", byte_size: 12, mime_type: "audio/mpeg", duration_seconds: null }],
    }),
    waitForGeneration: vi.fn(),
}));

import { requestAudioGeneration, storeGeneratedAudio } from "./audio";

afterEach(() => vi.unstubAllGlobals());

describe("generated audio metadata", () => {
    it("decodes duration when the generated cloud asset does not provide it", async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: async () => blob }));
        vi.stubGlobal("AudioContext", class {
            decodeAudioData = vi.fn().mockResolvedValue({ duration: 3.2, numberOfChannels: 1, getChannelData: () => new Float32Array([0, 1]) });
            close = vi.fn();
        });

        const generated = await requestAudioGeneration({ model: "speech-model" } as never, "课程音频");
        const stored = await storeGeneratedAudio(generated);

        expect(stored.durationMs).toBe(3200);
    });
});
