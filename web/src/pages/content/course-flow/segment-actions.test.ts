import { describe, expect, it } from "vitest";

import type { CourseFlowSegment } from "@/types/course-flow";
import { courseSegmentConfirmationFields, courseSegmentDividerKey, isCoursePlanConfirmed, isCourseScriptConfirmed, removeCourseSegment, restoreCourseSegment } from "./segment-actions";

const segment = (id: string, position: number): CourseFlowSegment => ({
    id,
    position,
    text: `片段 ${position + 1}`,
    voiceDirection: "自然清晰",
    revision: 3,
    confirmedScriptRevision: null,
    confirmedPlanAudioId: null,
    selectedAudioId: null,
    audioVersions: [],
    ltxVideo: null,
    materialShots: [],
});

describe("Course Flow segment actions", () => {
    it("keeps script confirmation until the segment revision changes", () => {
        expect(isCourseScriptConfirmed({ ...segment("one", 0), confirmedScriptRevision: 3 })).toBe(true);
        expect(isCourseScriptConfirmed({ ...segment("one", 0), revision: 4, confirmedScriptRevision: 3 })).toBe(false);
    });

    it("keeps plan confirmation until the selected Audio version changes", () => {
        expect(isCoursePlanConfirmed({ ...segment("one", 0), selectedAudioId: "audio-2", confirmedPlanAudioId: "audio-2" })).toBe(true);
        expect(isCoursePlanConfirmed({ ...segment("one", 0), selectedAudioId: "audio-3", confirmedPlanAudioId: "audio-2" })).toBe(false);
    });

    it("removes any segment including the last one and reindexes the survivors", () => {
        expect(removeCourseSegment([segment("one", 0)], "one")).toEqual([]);
        expect(removeCourseSegment([segment("one", 0), segment("two", 1), segment("three", 2)], "two").map(({ id, position }) => ({ id, position }))).toEqual([
            { id: "one", position: 0 },
            { id: "three", position: 1 },
        ]);
    });

    it("rolls back only the failed deletion without reviving another optimistically deleted segment", () => {
        const first = segment("one", 0);
        const second = segment("two", 1);
        const third = segment("three", 2);
        const current = removeCourseSegment(removeCourseSegment([first, second, third], "one"), "two");

        expect(restoreCourseSegment(current, second, "one", "three").map(({ id, position }) => ({ id, position }))).toEqual([
            { id: "two", position: 0 },
            { id: "three", position: 1 },
        ]);
    });

    it("builds a stable key for one exact divider", () => {
        expect(courseSegmentDividerKey("segment-1", "segment-2")).toBe("segment-1:segment-2");
    });

    it("maps persisted confirmation values without turning missing values into zero", () => {
        expect(courseSegmentConfirmationFields({ confirmed_script_revision: 3, confirmed_plan_audio_id: "audio-2" })).toEqual({ confirmedScriptRevision: 3, confirmedPlanAudioId: "audio-2" });
        expect(courseSegmentConfirmationFields({ confirmed_script_revision: null, confirmed_plan_audio_id: null })).toEqual({ confirmedScriptRevision: null, confirmedPlanAudioId: null });
    });
});
