import { describe, expect, it } from "vitest";

import type { ContentNode } from "@/types/content-production";
import { contentAudioSegmentChildIds, contentAudioSegmentNodeInputs } from "./audio-segment-nodes";

const parent: ContentNode = {
    id: "audio-1",
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: "script-1",
    nodeType: "tts",
    title: "角色语音",
    summary: "",
    sortOrder: 0,
    data: { url: "parent.wav" },
    status: "succeeded",
    revision: 1,
    createdBy: "owner-1",
    hiddenAt: null,
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
};

describe("content audio segment nodes", () => {
    it("builds ready audio children with source ranges", () => {
        expect(contentAudioSegmentNodeInputs(parent, "owner-1", "run-1", [
            { assetId: "asset-2", url: "2.wav", mimeType: "audio/wav", bytes: 20, durationMs: 500, index: 1, startMs: 500, endMs: 1000 },
            { assetId: "asset-1", url: "1.wav", mimeType: "audio/wav", bytes: 10, durationMs: 500, index: 0, startMs: 0, endMs: 500 },
        ])).toEqual([
            expect.objectContaining({
                parentId: "audio-1",
                nodeType: "tts",
                title: "角色语音 · 片段 1",
                sortOrder: 0,
                status: "succeeded",
                data: expect.objectContaining({
                    assetId: "asset-1",
                    sourceType: "segment",
                    parentAudioNodeId: "audio-1",
                    segmentationRunId: "run-1",
                    segmentIndex: 0,
                    sourceStartMs: 0,
                    sourceEndMs: 500,
                }),
            }),
            expect.objectContaining({ title: "角色语音 · 片段 2", sortOrder: 1 }),
        ]);
    });

    it("finds only direct segment children from the parent", () => {
        const other = { ...parent, id: "other" };
        const child = { ...parent, id: "child", parentId: parent.id, data: { parentAudioNodeId: parent.id, sourceType: "segment" } };
        const grandchild = { ...child, id: "grandchild", parentId: child.id, data: { parentAudioNodeId: child.id, sourceType: "segment" } };
        expect(contentAudioSegmentChildIds([parent, other, child, grandchild], parent.id)).toEqual(["child"]);
    });
});
