import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { canvasNodeRenderDetail, canvasViewportBounds, connectionIntersectsCanvasBounds, nodeIntersectsCanvasBounds, shouldUseCanvasOverview } from "./canvas-viewport-virtualization";

function node(id: string, x: number, y: number, width = 320, height = 240): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x, y }, width, height };
}

describe("canvas viewport virtualization", () => {
    it("keeps a stable screen-space overscan at every zoom level", () => {
        expect(canvasViewportBounds({ x: 0, y: 0, k: 1 }, 1_000, 600, 500)).toEqual({ left: -500, top: -500, right: 1_500, bottom: 1_100 });
        expect(canvasViewportBounds({ x: 0, y: 0, k: 0.1 }, 1_000, 600, 500)).toEqual({ left: -5_000, top: -5_000, right: 15_000, bottom: 11_000 });
    });

    it("culls nodes and bezier connections outside the expanded viewport", () => {
        const bounds = { left: 0, top: 0, right: 1_000, bottom: 800 };
        const visible = node("visible", 200, 200);
        const near = node("near", 900, 300);
        const far = node("far", 4_000, 4_000);
        expect(nodeIntersectsCanvasBounds(visible, bounds)).toBe(true);
        expect(nodeIntersectsCanvasBounds(far, bounds)).toBe(false);
        expect(connectionIntersectsCanvasBounds(visible, near, bounds)).toBe(true);
        expect(connectionIntersectsCanvasBounds(near, far, bounds)).toBe(false);
    });

    it("reduces detail by projected size and visible-node pressure", () => {
        const image = node("image", 0, 0);
        expect(canvasNodeRenderDetail(image, 1, 100)).toBe("full");
        expect(canvasNodeRenderDetail(image, 0.4, 100)).toBe("compact");
        expect(canvasNodeRenderDetail(image, 0.1, 100)).toBe("outline");
        expect(canvasNodeRenderDetail(image, 1, 1_300)).toBe("outline");
        expect(shouldUseCanvasOverview(1_800)).toBe(false);
        expect(shouldUseCanvasOverview(1_801)).toBe(true);
    });
});
