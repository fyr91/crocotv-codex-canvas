import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { replaceCanvasAudioSegmentNodes } from "./audio-segment-nodes";

const parent: CanvasNodeData = {
    id: "audio-parent",
    type: CanvasNodeType.Audio,
    title: "完整音频",
    position: { x: 100, y: 200 },
    width: 340,
    height: 120,
    metadata: { content: "/parent.wav", status: "success" },
};
const oldChild: CanvasNodeData = {
    id: "old-child",
    type: CanvasNodeType.Audio,
    title: "旧片段",
    position: { x: 560, y: 200 },
    width: 340,
    height: 120,
    metadata: { content: "/old.wav", status: "success", audioSourceType: "segment", parentAudioNodeId: parent.id },
};
const oldGrandchild: CanvasNodeData = {
    id: "old-grandchild",
    type: CanvasNodeType.Audio,
    title: "旧子片段",
    position: { x: 1020, y: 200 },
    width: 340,
    height: 120,
    metadata: { content: "/old-child.wav", status: "success", audioSourceType: "segment", parentAudioNodeId: oldChild.id },
};
const unrelated: CanvasNodeData = {
    id: "unrelated",
    type: CanvasNodeType.Text,
    title: "不相关节点",
    position: { x: 0, y: 0 },
    width: 280,
    height: 224,
};
const connections: CanvasConnection[] = [
    { id: "parent-old", fromNodeId: parent.id, toNodeId: oldChild.id },
    { id: "old-grandchild", fromNodeId: oldChild.id, toNodeId: oldGrandchild.id },
    { id: "unrelated-parent", fromNodeId: unrelated.id, toNodeId: parent.id },
];

describe("Canvas Audio Segment nodes", () => {
    it("atomically replaces the previous segment subtree and preserves unrelated graph state", () => {
        const result = replaceCanvasAudioSegmentNodes({
            nodes: [parent, oldChild, oldGrandchild, unrelated],
            connections,
            parentNodeId: parent.id,
            segmentationRunId: "run-2",
            assets: [
                { storageKey: "asset-1", url: "/one.wav", mimeType: "audio/wav", bytes: 10, durationMs: 800, index: 0, startMs: 0, endMs: 800 },
                { storageKey: "asset-2", url: "/two.wav", mimeType: "audio/wav", bytes: 12, durationMs: 1000, index: 1, startMs: 1000, endMs: 2000 },
            ],
        });

        expect(result.nodes.map((node) => node.id)).toEqual([
            parent.id,
            unrelated.id,
            "audio-parent-segment-run-2-0",
            "audio-parent-segment-run-2-1",
        ]);
        expect(result.nodes.find((node) => node.id === parent.id)).toEqual(parent);
        expect(result.nodes.find((node) => node.id === unrelated.id)).toEqual(unrelated);
        expect(result.nodes.find((node) => node.id.endsWith("-0"))).toEqual(expect.objectContaining({
            type: CanvasNodeType.Audio,
            metadata: expect.objectContaining({
                content: "/one.wav",
                storageKey: "asset-1",
                audioSourceType: "segment",
                parentAudioNodeId: parent.id,
                segmentationRunId: "run-2",
                segmentIndex: 0,
                sourceStartMs: 0,
                sourceEndMs: 800,
            }),
        }));
        expect(result.connections).toEqual([
            { id: "unrelated-parent", fromNodeId: unrelated.id, toNodeId: parent.id },
            { id: "audio-parent-audio-parent-segment-run-2-0", fromNodeId: parent.id, toNodeId: "audio-parent-segment-run-2-0" },
            { id: "audio-parent-audio-parent-segment-run-2-1", fromNodeId: parent.id, toNodeId: "audio-parent-segment-run-2-1" },
        ]);
        const children = result.nodes.filter((node) => node.metadata?.parentAudioNodeId === parent.id);
        expect(children[0].position.x).toBeGreaterThan(parent.position.x);
        expect(children[0].position.y).toBeLessThan(children[1].position.y);
    });
});
