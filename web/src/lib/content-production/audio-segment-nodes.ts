import type { ContentNode } from "@/types/content-production";

export type ContentAudioSegmentAsset = {
    assetId: string;
    url: string;
    mimeType: string;
    bytes: number;
    durationMs: number;
    index: number;
    startMs: number;
    endMs: number;
};

export function contentAudioSegmentNodeInputs(
    parent: ContentNode,
    ownerId: string,
    segmentationRunId: string,
    assets: ContentAudioSegmentAsset[],
): Array<Omit<ContentNode, "id" | "revision" | "hiddenAt" | "createdAt" | "updatedAt">> {
    return [...assets].sort((a, b) => a.index - b.index).map((asset) => ({
        topicId: parent.topicId,
        attemptId: parent.attemptId,
        parentId: parent.id,
        nodeType: "tts",
        title: `${parent.title || "音频"} · 片段 ${asset.index + 1}`,
        summary: `${formatTime(asset.startMs)} – ${formatTime(asset.endMs)}`,
        sortOrder: asset.index,
        data: {
            assetId: asset.assetId,
            url: asset.url,
            mimeType: asset.mimeType,
            bytes: asset.bytes,
            durationMs: asset.durationMs,
            sourceType: "segment",
            parentAudioNodeId: parent.id,
            segmentationRunId,
            segmentIndex: asset.index,
            sourceStartMs: asset.startMs,
            sourceEndMs: asset.endMs,
        },
        status: "succeeded",
        createdBy: ownerId,
    }));
}

export function contentAudioSegmentChildIds(nodes: ContentNode[], parentNodeId: string) {
    return nodes
        .filter((node) => node.parentId === parentNodeId && node.data.parentAudioNodeId === parentNodeId && node.data.sourceType === "segment")
        .map((node) => node.id);
}

function formatTime(valueMs: number) {
    const seconds = valueMs / 1000;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}
