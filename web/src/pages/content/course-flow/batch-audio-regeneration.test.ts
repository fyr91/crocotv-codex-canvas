import { describe, expect, it, vi } from "vitest";

import { runCourseBatchAudioRegeneration } from "./batch-audio-regeneration";

describe("runCourseBatchAudioRegeneration", () => {
    it("starts every segment concurrently with its existing voice direction", async () => {
        const resolvers = new Map<string, () => void>();
        const generate = vi.fn((segmentId: string) => new Promise<void>((resolve) => resolvers.set(segmentId, resolve)));
        const task = runCourseBatchAudioRegeneration([
            { id: "segment-1", voiceDirection: "自然清晰" },
            { id: "segment-2", voiceDirection: "轻快、有停顿" },
        ], { speed: "1.25", volume: "1.5", pitch: "2", format: "wav" }, generate);

        expect(generate).toHaveBeenCalledTimes(2);
        expect(generate).toHaveBeenNthCalledWith(1, "segment-1", { voiceDirection: "自然清晰", speed: "1.25", volume: "1.5", pitch: "2", format: "wav" });
        expect(generate).toHaveBeenNthCalledWith(2, "segment-2", { voiceDirection: "轻快、有停顿", speed: "1.25", volume: "1.5", pitch: "2", format: "wav" });

        resolvers.get("segment-1")?.();
        resolvers.get("segment-2")?.();
        await task;
    });
});
