import { useEffect, useRef } from "react";

import { commentColorSurface } from "@/lib/canvas/canvas-comment";
import { canvasThemes } from "@/lib/canvas-theme";
import { canvasNodeImagePreviewUrl } from "@/lib/canvas/canvas-viewport-virtualization";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";

type OverviewImageEntry = { image: HTMLImageElement; listeners: Set<() => void> };
const overviewImageCache = new Map<string, OverviewImageEntry>();
const OVERVIEW_IMAGE_CACHE_LIMIT = 2_500;

export function CanvasOverviewLayer({ nodes, connections, nodeById, viewport, width, height, selectedNodeIds }: { nodes: CanvasNodeData[]; connections: CanvasConnection[]; nodeById: Map<string, CanvasNodeData>; viewport: ViewportTransform; width: number; height: number; selectedNodeIds: Set<string> }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const themeKey = useThemeStore((state) => state.theme);
    const theme = canvasThemes[themeKey];

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context || width <= 0 || height <= 0) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const imageUnsubscribers: Array<() => void> = [];
        const observedImages = new Set<string>();
        let drawFrame: number | null = null;
        let disposed = false;

        const requestDraw = () => {
            if (disposed || drawFrame != null) return;
            drawFrame = requestAnimationFrame(() => {
                drawFrame = null;
                draw();
            });
        };

        const draw = () => {
            canvas.width = Math.max(1, Math.round(width * ratio));
            canvas.height = Math.max(1, Math.round(height * ratio));
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            context.clearRect(0, 0, width, height);
            context.translate(viewport.x, viewport.y);
            context.scale(viewport.k, viewport.k);

            context.strokeStyle = theme.node.muted;
            context.globalAlpha = 0.35;
            context.lineWidth = Math.max(1 / viewport.k, 1);
            context.beginPath();
            connections.forEach((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                if (!from || !to) return;
                const startX = from.position.x + from.width;
                const startY = from.position.y + from.height / 2;
                const endX = to.position.x;
                const endY = to.position.y + to.height / 2;
                const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
                context.moveTo(startX, startY);
                context.bezierCurveTo(startX + curvature, startY, endX - curvature, endY, endX, endY);
            });
            context.stroke();

            context.globalAlpha = 1;
            nodes.forEach((node) => drawNode(context, node, viewport.k, selectedNodeIds.has(node.id), themeKey, theme, requestDraw, observedImages, imageUnsubscribers));
        };

        draw();
        return () => {
            disposed = true;
            if (drawFrame != null) cancelAnimationFrame(drawFrame);
            imageUnsubscribers.forEach((unsubscribe) => unsubscribe());
        };
    }, [connections, height, nodeById, nodes, selectedNodeIds, theme, themeKey, viewport.k, viewport.x, viewport.y, width]);

    return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[1]" style={{ width, height }} aria-hidden="true" />;
}

function drawNode(context: CanvasRenderingContext2D, node: CanvasNodeData, zoom: number, selected: boolean, themeKey: "light" | "dark", theme: (typeof canvasThemes)[keyof typeof canvasThemes], requestDraw: () => void, observedImages: Set<string>, unsubscribers: Array<() => void>) {
    const isGroup = node.type === CanvasNodeType.Group || node.type === CanvasNodeType.WorkflowGroup;
    const commentSurface = node.type === CanvasNodeType.Comment ? commentColorSurface(node.metadata?.commentColor, themeKey === "dark") : null;
    const hasVideo = node.type === CanvasNodeType.Video && Boolean(node.metadata?.content);
    const imageUrl = node.type === CanvasNodeType.Image && node.metadata?.storageKey ? canvasNodeImagePreviewUrl(node, 64) : "";
    context.fillStyle = isGroup ? theme.toolbar.panel : commentSurface?.background || (hasVideo ? "#000000" : theme.node.fill);
    context.fillRect(node.position.x, node.position.y, node.width, node.height);

    if (imageUrl) {
        const entry = observeOverviewImage(imageUrl, requestDraw, observedImages, unsubscribers);
        if (entry.image.complete && entry.image.naturalWidth > 0) drawContainedImage(context, entry.image, node);
    }

    const remoteOperationActive = Boolean(node.metadata?.remoteOperationActive);
    context.save();
    context.strokeStyle = remoteOperationActive ? "#22c55e" : selected ? theme.node.activeStroke : commentSurface?.border || theme.node.stroke;
    context.lineWidth = (remoteOperationActive || selected ? 3 : 2) / zoom;
    if (remoteOperationActive) {
        context.shadowColor = "rgba(34,197,94,.72)";
        context.shadowBlur = 16 / zoom;
    }
    if (isGroup) context.setLineDash([12 / zoom, 8 / zoom]);
    context.strokeRect(node.position.x, node.position.y, node.width, node.height);
    context.restore();
}

function drawContainedImage(context: CanvasRenderingContext2D, image: HTMLImageElement, node: CanvasNodeData) {
    const scale = Math.min(node.width / image.naturalWidth, node.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, node.position.x + (node.width - width) / 2, node.position.y + (node.height - height) / 2, width, height);
}

function observeOverviewImage(url: string, onLoad: () => void, observed: Set<string>, unsubscribers: Array<() => void>) {
    let entry = overviewImageCache.get(url);
    if (!entry) {
        if (overviewImageCache.size >= OVERVIEW_IMAGE_CACHE_LIMIT) overviewImageCache.delete(overviewImageCache.keys().next().value as string);
        const image = new Image();
        entry = { image, listeners: new Set() };
        overviewImageCache.set(url, entry);
        image.onload = () => {
            entry?.listeners.forEach((listener) => listener());
            entry?.listeners.clear();
        };
        image.src = url;
    }
    if (!entry.image.complete && !observed.has(url)) {
        observed.add(url);
        entry.listeners.add(onLoad);
        unsubscribers.push(() => entry?.listeners.delete(onLoad));
    }
    return entry;
}
