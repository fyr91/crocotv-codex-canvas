import { describe, expect, it } from "vitest";

import { CanvasNodeType } from "../../types/canvas";
import { canConnectCanvasNodes, commentColorSurface, filterCanvasCommentConnections, pickCommentModel } from "./canvas-comment";

describe("pickCommentModel", () => {
    it("prefers an enabled GLM 5.2 model", () => {
        expect(pickCommentModel(["channel-a::gpt-5", "channel-b::glm-5.2"], "channel-a::gpt-5")).toBe("channel-b::glm-5.2");
    });

    it("falls back to the configured text model and then the first enabled model", () => {
        expect(pickCommentModel(["a", "b"], "b")).toBe("b");
        expect(pickCommentModel(["a"], "missing")).toBe("a");
        expect(pickCommentModel([], "missing")).toBe("");
    });
});

describe("canConnectCanvasNodes", () => {
    it("rejects comment endpoints and keeps normal nodes connectable", () => {
        expect(canConnectCanvasNodes(CanvasNodeType.Comment, CanvasNodeType.Image)).toBe(false);
        expect(canConnectCanvasNodes(CanvasNodeType.Image, CanvasNodeType.Comment)).toBe(false);
        expect(canConnectCanvasNodes(CanvasNodeType.Text, CanvasNodeType.Image)).toBe(true);
    });

    it("removes persisted connections that contain a comment node", () => {
        const nodes = [{ id: "comment", type: CanvasNodeType.Comment }, { id: "text", type: CanvasNodeType.Text }, { id: "image", type: CanvasNodeType.Image }];
        const connections = [
            { id: "a", fromNodeId: "comment", toNodeId: "image" },
            { id: "b", fromNodeId: "text", toNodeId: "image" },
            { id: "c", fromNodeId: "image", toNodeId: "comment" },
        ];
        expect(filterCanvasCommentConnections(nodes, connections)).toEqual([connections[1]]);
    });
});

describe("commentColorSurface", () => {
    it("uses a deep high-contrast green surface", () => {
        expect(commentColorSurface("green", false)).toEqual({ background: "#166534", border: "#22c55e" });
        expect(commentColorSurface("green", true)).toEqual({ background: "#14532d", border: "#22c55e" });
    });
});
