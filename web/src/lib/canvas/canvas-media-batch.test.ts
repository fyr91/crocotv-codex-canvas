import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { remoteCancelableVideoJobIds } from "./canvas-media-batch";

function video(id: string, model: string, generationJobId?: string): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Video,
        title: id,
        position: { x: 0, y: 0 },
        width: 320,
        height: 180,
        metadata: { model, generationJobId },
    };
}

describe("remoteCancelableVideoJobIds", () => {
    it("deduplicates the H3 generation job shared by a batch", () => {
        const nodes = [
            video("root", "h3-model", "generation-1"),
            video("child-1", "h3-model", "generation-1"),
            video("child-2", "h3-model", "generation-1"),
            video("ltx", "ltx-model", "generation-2"),
        ];

        expect(remoteCancelableVideoJobIds(
            nodes,
            new Set(["root", "child-1", "child-2", "ltx"]),
            (model) => model === "h3-model",
        )).toEqual(["generation-1"]);
    });

    it("ignores unrelated, non-video, or not-yet-bound nodes", () => {
        const image = { ...video("image", "h3-model", "generation-2"), type: CanvasNodeType.Image };
        const nodes = [video("affected", "h3-model", "generation-1"), video("unaffected", "h3-model", "generation-2"), video("unbound", "h3-model"), image];

        expect(remoteCancelableVideoJobIds(nodes, new Set(["affected", "unbound", "image"]), (model) => model === "h3-model")).toEqual(["generation-1"]);
    });
});
