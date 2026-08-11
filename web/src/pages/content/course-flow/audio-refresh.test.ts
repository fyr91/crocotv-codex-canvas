import { describe, expect, it } from "vitest";

import type { CourseFlowSegment } from "@/types/course-flow";
import { getCourseFlowAudioRefreshMode } from "./audio-refresh";

const segment: CourseFlowSegment = {
    id: "segment-1",
    position: 0,
    text: "更新后的课程文案",
    voiceDirection: "自然清晰",
    revision: 3,
    confirmedScriptRevision: null,
    confirmedPlanAudioId: null,
    selectedAudioId: null,
    audioVersions: [],
    ltxVideo: null,
    materialShots: [],
};

describe("course flow audio revision refresh", () => {
    it("generates audio when the segment has no audio", () => {
        expect(getCourseFlowAudioRefreshMode(segment)).toBe("missing");
    });

    it("clears and regenerates audio when every version belongs to older copy", () => {
        expect(getCourseFlowAudioRefreshMode({
            ...segment,
            audioVersions: [{
                id: "audio-old",
                version: 2,
                sourceSegmentRevision: 2,
                assetId: "asset-old",
                url: "/old.mp3",
                durationMs: 3000,
                status: "ready",
                errorMessage: null,
                played: true,
            }],
        })).toBe("stale");
    });

    it("does not launch another task when the current revision already has one", () => {
        expect(getCourseFlowAudioRefreshMode({
            ...segment,
            audioVersions: [{
                id: "audio-current",
                version: 3,
                sourceSegmentRevision: 3,
                assetId: null,
                url: "",
                durationMs: 0,
                status: "failed",
                errorMessage: "生成失败",
                played: false,
            }],
        })).toBeNull();
    });
});
