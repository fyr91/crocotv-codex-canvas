import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function isMediaBatchRoot(node?: CanvasNodeData | null) {
    return Boolean(node && isMedia(node) && node.metadata?.isBatchRoot && (node.metadata.batchChildIds?.length || 0) > 1);
}

export function isMediaBatchChild(node?: CanvasNodeData | null) {
    return Boolean(node && isMedia(node) && node.metadata?.batchRootId);
}

export function mediaBatchKind(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Video ? "video" : "image";
}

export function horizontalBatchResultPosition(
    source: Pick<CanvasNodeData, "position" | "width">,
    index: number,
    resultWidth: number,
    options: { startGap?: number; gap?: number; y?: number } = {},
) {
    return {
        x: source.position.x + source.width + (options.startGap ?? 96) + index * (resultWidth + (options.gap ?? 36)),
        y: options.y ?? source.position.y,
    };
}

export function mediaBatchChildPosition(root: CanvasNodeData, index: number, childWidth: number) {
    return horizontalBatchResultPosition(root, index, childWidth, { startGap: 120 });
}

export function videoBatchOutputIndex(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    if (Number.isInteger(node.metadata?.videoOutputIndex)) return Number(node.metadata?.videoOutputIndex);
    const root = node.metadata?.batchRootId ? nodes.find((item) => item.id === node.metadata?.batchRootId) : node.metadata?.isBatchRoot ? node : null;
    if (!root) return 0;
    const resultId = node.metadata?.batchRootId ? node.id : root.metadata?.primaryResultId || root.metadata?.batchChildIds?.[0];
    return Math.max(0, root.metadata?.batchChildIds?.indexOf(resultId || "") ?? 0);
}

export function cancelableQueuedLtxJobIds(nodes: CanvasNodeData[], deletedIds: Set<string>, isLtxModel: (model: string) => boolean) {
    const remainingJobIds = new Set(nodes.flatMap((node) => !deletedIds.has(node.id) && node.metadata?.generationJobId ? [node.metadata.generationJobId] : []));
    return Array.from(new Set(nodes.flatMap((node) => {
        const metadata = node.metadata;
        if (!deletedIds.has(node.id) || node.type !== CanvasNodeType.Video || metadata?.generationState !== "queued" || !metadata.generationJobId || !isLtxModel(metadata.model || "") || remainingJobIds.has(metadata.generationJobId)) return [];
        return [metadata.generationJobId];
    })));
}

export function remoteCancelableVideoJobIds(nodes: CanvasNodeData[], affectedIds: Set<string>, isRemoteCancelableModel: (model: string) => boolean) {
    return Array.from(new Set(nodes.flatMap((node) => {
        const metadata = node.metadata;
        if (!affectedIds.has(node.id) || node.type !== CanvasNodeType.Video || !metadata?.generationJobId || !isRemoteCancelableModel(metadata.model || "")) return [];
        return [metadata.generationJobId];
    })));
}

function isMedia(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video;
}
