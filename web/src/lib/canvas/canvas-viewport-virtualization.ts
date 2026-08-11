import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasRenderDetail = "full" | "compact" | "outline";

export type CanvasWorldBounds = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

const DEFAULT_OVERSCAN_PX = 520;
const FULL_DETAIL_MIN_PX = 150;
const COMPACT_DETAIL_MIN_PX = 48;
const COMPACT_VISIBLE_LIMIT = 500;
const OUTLINE_VISIBLE_LIMIT = 1_200;
export const CANVAS_OVERVIEW_NODE_LIMIT = 1_800;

export function canvasViewportBounds(viewport: ViewportTransform, width: number, height: number, overscanPx = DEFAULT_OVERSCAN_PX): CanvasWorldBounds {
    const scale = Math.max(viewport.k, 0.01);
    const overscan = overscanPx / scale;
    const left = -viewport.x / scale;
    const top = -viewport.y / scale;
    return {
        left: left - overscan,
        top: top - overscan,
        right: left + width / scale + overscan,
        bottom: top + height / scale + overscan,
    };
}

export function nodeIntersectsCanvasBounds(node: CanvasNodeData, bounds: CanvasWorldBounds) {
    return node.position.x + node.width > bounds.left
        && node.position.x < bounds.right
        && node.position.y + node.height > bounds.top
        && node.position.y < bounds.bottom;
}

export function canvasNodeRenderDetail(node: CanvasNodeData, zoom: number, visibleNodeCount: number): CanvasRenderDetail {
    if (visibleNodeCount > OUTLINE_VISIBLE_LIMIT) return "outline";
    const projectedMinEdge = Math.min(node.width, node.height) * Math.max(zoom, 0.01);
    if (visibleNodeCount <= COMPACT_VISIBLE_LIMIT && projectedMinEdge >= FULL_DETAIL_MIN_PX) return "full";
    if (projectedMinEdge >= COMPACT_DETAIL_MIN_PX) return "compact";
    return "outline";
}

export function shouldUseCanvasOverview(visibleNodeCount: number) {
    return visibleNodeCount > CANVAS_OVERVIEW_NODE_LIMIT;
}

export function canvasNodeImagePreviewUrl(node: CanvasNodeData, size: 64 | 256 | 512 | 1024 = 512) {
    const storageKey = node.metadata?.storageKey;
    if (storageKey) return `/files/by-id/${encodeURIComponent(storageKey)}/thumbnail?size=${size}`;
    return node.metadata?.content || "";
}

export function connectionIntersectsCanvasBounds(from: CanvasNodeData, to: CanvasNodeData, bounds: CanvasWorldBounds) {
    const startX = from.position.x + from.width;
    const startY = from.position.y + from.height / 2;
    const endX = to.position.x;
    const endY = to.position.y + to.height / 2;
    const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
    const minX = Math.min(startX, startX + curvature, endX - curvature, endX);
    const maxX = Math.max(startX, startX + curvature, endX - curvature, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    return maxX > bounds.left && minX < bounds.right && maxY > bounds.top && minY < bounds.bottom;
}
