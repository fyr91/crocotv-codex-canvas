import { describe, expect, it } from "vitest";

import type { KouboWorkspace } from "@/types/koubo-video";
import { kouboCascadeSelectionIds, kouboDownloadSelection, kouboGroupSelectionIds } from "./node-selection";

const workspace: KouboWorkspace = {
    projectId: "p",
    title: "口播",
    status: "preparing_assets",
    selectedImageResultId: null,
    exportedAt: null,
    noticeUnread: false,
    latestMessage: null,
    scriptGroups: [{ id: "g1", projectId: "p", sourceType: "ai", sourceInput: "主题", promptVersion: "1", revision: 1, generationId: null, modelPromptBinding: {} }],
    segments: [
        { id: "s1", projectId: "p", scriptGroupId: "g1", position: 0, text: "第一段", voiceDirection: "自然", revision: 1, generationId: null, modelPromptBinding: {} },
        { id: "s2", projectId: "p", scriptGroupId: "g1", position: 1, text: "第二段", voiceDirection: "坚定", revision: 1, generationId: null, modelPromptBinding: {} },
    ],
    audioNodes: [
        { id: "a1", projectId: "p", segmentId: "s1", parentAudioNodeId: null, segmentationRunId: null, segmentIndex: null, assetId: "asset-a1", durationMs: 8_000, sourceType: "generated", sourceStartMs: null, sourceEndMs: null, sourceSegmentRevision: 1, status: "ready", imageResultId: null },
        { id: "a2", projectId: "p", segmentId: "s1", parentAudioNodeId: "a1", segmentationRunId: "run", segmentIndex: 0, assetId: "asset-a2", durationMs: 4_000, sourceType: "segment", sourceStartMs: 0, sourceEndMs: 4_000, sourceSegmentRevision: 1, status: "ready", imageResultId: null },
    ],
    imageResults: [],
    videoCandidates: [{ id: "v1", projectId: "p", segmentId: "s1", audioNodeId: "a1", imageResultId: "image", assetId: "asset-v1", sourceSegmentRevision: 1, status: "ready", selected: true }],
    compositions: [],
};

describe("koubo node selection", () => {
    it("expands every selected node through all downstream canvas connections", () => {
        expect([...kouboCascadeSelectionIds(new Set([
            "koubo-segment-s1",
            "koubo-segment-s2",
        ]), [
            { id: "s1-a1", fromNodeId: "koubo-segment-s1", toNodeId: "koubo-audio-a1" },
            { id: "a1-v1", fromNodeId: "koubo-audio-a1", toNodeId: "koubo-video-v1" },
            { id: "s2-a2", fromNodeId: "koubo-segment-s2", toNodeId: "koubo-audio-a2" },
            { id: "other", fromNodeId: "koubo-segment-s3", toNodeId: "koubo-audio-a3" },
        ])]).toEqual([
            "koubo-segment-s1",
            "koubo-segment-s2",
            "koubo-audio-a1",
            "koubo-audio-a2",
            "koubo-video-v1",
        ]);
    });

    it("selecting a group expands to every text, audio and video node in that group", () => {
        expect([...kouboGroupSelectionIds(workspace, "g1")]).toEqual([
            "koubo-script-group-g1",
            "koubo-segment-s1",
            "koubo-segment-s2",
            "koubo-audio-a1",
            "koubo-audio-a2",
            "koubo-video-v1",
        ]);
    });

    it("exports selected text and only downloadable ready audio", () => {
        expect(kouboDownloadSelection(workspace, new Set([
            "koubo-segment-s1",
            "koubo-segment-s2",
            "koubo-audio-a1",
            "koubo-audio-a2",
        ]))).toEqual({
            texts: [
                { id: "s1", title: "文案 1", text: "第一段" },
                { id: "s2", title: "文案 2", text: "第二段" },
            ],
            audios: [
                { id: "a1", title: "音频 1", assetId: "asset-a1" },
                { id: "a2", title: "音频 1 · 片段 1", assetId: "asset-a2" },
            ],
        });
    });
});
