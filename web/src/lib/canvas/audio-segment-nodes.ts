import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export type CanvasAudioSegmentAsset = {
    storageKey: string;
    url: string;
    mimeType: string;
    bytes: number;
    durationMs: number;
    index: number;
    startMs: number;
    endMs: number;
};

export function replaceCanvasAudioSegmentNodes({
    nodes,
    connections,
    parentNodeId,
    segmentationRunId,
    assets,
}: {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    parentNodeId: string;
    segmentationRunId: string;
    assets: CanvasAudioSegmentAsset[];
}) {
    const parent = nodes.find((node) => node.id === parentNodeId);
    if (!parent) return { nodes, connections };
    const removedIds = descendantIds(
        nodes.filter((node) => node.metadata?.parentAudioNodeId === parentNodeId).map((node) => node.id),
        connections,
    );
    const keptNodes = nodes.filter((node) => !removedIds.has(node.id));
    const keptConnections = connections.filter((connection) => !removedIds.has(connection.fromNodeId) && !removedIds.has(connection.toNodeId));
    const ordered = [...assets].sort((a, b) => a.index - b.index);
    const size = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
    const centerY = parent.position.y + parent.height / 2;
    const step = size.height + 40;
    const children = ordered.map((asset, itemIndex): CanvasNodeData => ({
        id: `${parentNodeId}-segment-${segmentationRunId}-${asset.index}`,
        type: CanvasNodeType.Audio,
        position: {
            x: parent.position.x + parent.width + 120,
            y: centerY + (itemIndex - (ordered.length - 1) / 2) * step - size.height / 2,
        },
        ...size,
        title: `${parent.title || "音频"} · 片段 ${asset.index + 1}`,
        metadata: {
            content: asset.url,
            storageKey: asset.storageKey,
            mimeType: asset.mimeType,
            bytes: asset.bytes,
            durationMs: asset.durationMs,
            status: "success",
            audioSourceType: "segment",
            parentAudioNodeId: parentNodeId,
            segmentationRunId,
            segmentIndex: asset.index,
            sourceStartMs: asset.startMs,
            sourceEndMs: asset.endMs,
        },
    }));
    return {
        nodes: [...keptNodes, ...children],
        connections: [
            ...keptConnections,
            ...children.map((child): CanvasConnection => ({
                id: `${parentNodeId}-${child.id}`,
                fromNodeId: parentNodeId,
                toNodeId: child.id,
            })),
        ],
    };
}

function descendantIds(rootIds: string[], connections: CanvasConnection[]) {
    const result = new Set(rootIds);
    const queue = [...rootIds];
    while (queue.length) {
        const current = queue.shift()!;
        for (const connection of connections) {
            if (connection.fromNodeId !== current || result.has(connection.toNodeId)) continue;
            result.add(connection.toNodeId);
            queue.push(connection.toNodeId);
        }
    }
    return result;
}
