import { describe, expect, it } from "vitest";
import type { KouboWorkspace } from "@/types/koubo-video";
import { deriveKouboStatus, kouboRefetchInterval, kouboVisibleStages, segmentsNeedingTts, segmentsNeedingVideo, summarizeKouboGroup } from "./workflow";

const base: KouboWorkspace = {
    projectId: "p",
    title: "口播视频",
    status: "draft",
    selectedImageResultId: null,
    exportedAt: null,
    noticeUnread: false,
    latestMessage: null,
    scriptGroups: [{ id: "g1", projectId: "p", sourceType: "ai", sourceInput: "主题", promptVersion: "1", revision: 1, generationId: null, modelPromptBinding: {} }],
    segments: [
        { id: "s1", projectId: "p", scriptGroupId: "g1", position: 0, text: "第一段", voiceDirection: "自然", revision: 2, generationId: null, modelPromptBinding: {} },
        { id: "s2", projectId: "p", scriptGroupId: "g1", position: 1, text: "第二段", voiceDirection: "坚定", revision: 1, generationId: null, modelPromptBinding: {} },
    ],
    audioNodes: [],
    imageResults: [],
    videoCandidates: [],
    compositions: [],
};

describe("koubo workflow state", () => {
    it("only fills segments without a current ready generated Audio Node", () => {
        const workspace = {
            ...base,
            audioNodes: [
                { id: "a1", projectId: "p", segmentId: "s1", parentAudioNodeId: null, segmentationRunId: null, segmentIndex: null, assetId: "asset", durationMs: 10_000, sourceType: "generated" as const, sourceStartMs: null, sourceEndMs: null, sourceSegmentRevision: 2, status: "ready" as const, imageResultId: null },
                { id: "a2", projectId: "p", segmentId: "s2", parentAudioNodeId: null, segmentationRunId: null, segmentIndex: null, assetId: null, durationMs: null, sourceType: "generated" as const, sourceStartMs: null, sourceEndMs: null, sourceSegmentRevision: 1, status: "failed" as const, imageResultId: null },
            ],
        };
        expect(segmentsNeedingTts(workspace).map((segment) => segment.id)).toEqual(["s2"]);
    });

    it("keeps video generation paused even when audio and image are ready", () => {
        expect(segmentsNeedingVideo(base)).toEqual([]);
        const workspace: KouboWorkspace = {
            ...base,
            selectedImageResultId: "i1",
            imageResults: [{ id: "i1", projectId: "p", sourceType: "upload", assetId: "image", prompt: "", aspectRatio: "16:9", status: "ready" }],
            audioNodes: [{ id: "a1", projectId: "p", segmentId: "s1", parentAudioNodeId: null, segmentationRunId: null, segmentIndex: null, assetId: "audio", durationMs: 19_999, sourceType: "generated", sourceStartMs: null, sourceEndMs: null, sourceSegmentRevision: 2, status: "ready", imageResultId: "i1" }],
        };
        expect(segmentsNeedingVideo(workspace)).toEqual([]);
    });

    it("summarizes visible state without reopening the paused video workflow", () => {
        expect(summarizeKouboGroup([{ status: "ready" }, { status: "running" }, { status: "failed" }])).toEqual({ completed: 1, total: 3, running: 1, failed: 1 });
        const workspace: KouboWorkspace = {
            ...base,
            selectedImageResultId: "i1",
            videoCandidates: base.segments.map((segment) => ({ id: `v-${segment.id}`, projectId: "p", segmentId: segment.id, audioNodeId: `a-${segment.id}`, imageResultId: "i1", assetId: "video", sourceSegmentRevision: segment.revision, status: "ready", selected: true })),
        };
        expect(deriveKouboStatus(workspace)).toBe("preparing_assets");
        expect(deriveKouboStatus({ ...workspace, exportedAt: "2026-07-29T00:00:00Z" })).toBe("exported");
    });

    it("keeps polling while a composition still needs recovery", () => {
        expect(kouboRefetchInterval({ ...base, compositions: [{ id: "c1", orderedCandidateIds: ["v1"], status: "queued", assetId: null }] })).toBe(3_000);
        expect(kouboRefetchInterval(base)).toBe(15_000);
    });

    it("reveals only stages whose prerequisites exist", () => {
        expect(kouboVisibleStages({ ...base, scriptGroups: [], segments: [] })).toEqual(["start"]);
        expect(kouboVisibleStages(base)).toEqual(["start", "script", "audio"]);
        expect(kouboVisibleStages({ ...base, audioNodes: [{ id: "a1", projectId: "p", segmentId: "s1", parentAudioNodeId: null, segmentationRunId: null, segmentIndex: null, assetId: "audio", durationMs: 1000, sourceType: "generated", sourceStartMs: null, sourceEndMs: null, sourceSegmentRevision: 2, status: "ready", imageResultId: null }] })).toEqual(["start", "script", "audio"]);
        expect(kouboVisibleStages({ ...base, segments: base.segments.map((segment) => ({ ...segment, voiceDirection: "原始音频" })) })).toEqual(["start", "audio"]);
    });
});
