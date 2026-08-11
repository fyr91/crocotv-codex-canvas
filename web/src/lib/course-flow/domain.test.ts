import { describe, expect, it } from "vitest";

import { materialShotCount, parseCourseFlowSegments } from "../../../../supabase/functions/content-orchestrate/course-flow-contract";

describe("Course Flow segmentation", () => {
    it("accepts schema-valid pasted segments without comparing them to the source text", () => {
        expect(parseCourseFlowSegments({ segments: [
            { text: "生成式 AI 可以创作。", voiceDirection: "清晰陈述" },
            { text: "也需要认真核验。", voiceDirection: "略作强调" },
        ] })).toEqual([
            { text: "生成式 AI 可以创作。", voiceDirection: "清晰陈述" },
            { text: "也需要认真核验。", voiceDirection: "略作强调" },
        ]);
    });
});

describe("Course Flow material video planning", () => {
    it.each([
        [1, 1],
        [15_000, 1],
        [15_001, 2],
        [22_000, 2],
    ])("plans %i ms as %i material shot(s)", (durationMs, expected) => {
        expect(materialShotCount(durationMs)).toBe(expected);
    });
});
