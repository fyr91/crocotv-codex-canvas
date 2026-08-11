import { describe, expect, it, vi } from "vitest";

import type { CourseFlowSegment } from "@/types/course-flow";
import { runSegmentRegeneration } from "./segment-regeneration";

const previous = {
    id: "segment-1", position: 0, text: "原文案", voiceDirection: "原语气", revision: 1,
    confirmedScriptRevision: null, confirmedPlanAudioId: null,
    selectedAudioId: "audio-1", audioVersions: [], ltxVideo: null, materialShots: [],
} satisfies CourseFlowSegment;

describe("segment regeneration", () => {
    it("replaces only the regenerated fields after success", async () => {
        const apply = vi.fn();
        await runSegmentRegeneration({
            previous,
            request: async () => ({ text: "新文案", voiceDirection: "新语气", revision: 2, selectedAudioId: null }),
            isCurrent: () => true,
            apply,
        });

        expect(apply).toHaveBeenCalledOnce();
        expect(apply).toHaveBeenCalledWith({ text: "新文案", voiceDirection: "新语气", revision: 2, selectedAudioId: null });
    });

    it("restores the complete previous segment after failure", async () => {
        const apply = vi.fn();
        const failure = new Error("生成失败");

        await expect(runSegmentRegeneration({
            previous,
            request: async () => { throw failure; },
            isCurrent: () => true,
            apply,
        })).rejects.toBe(failure);

        expect(apply).toHaveBeenCalledWith(previous);
    });

    it("does not let a stale request replace or restore newer state", async () => {
        const apply = vi.fn();

        await runSegmentRegeneration({
            previous,
            request: async () => ({ text: "过期文案", voiceDirection: "过期语气", revision: 2, selectedAudioId: null }),
            isCurrent: () => false,
            apply,
        });

        expect(apply).not.toHaveBeenCalled();
    });
});
