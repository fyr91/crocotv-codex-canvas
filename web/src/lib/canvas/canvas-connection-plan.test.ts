import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ConnectionHandle } from "@/types/canvas";
import { connectionHandlesForSelection, planCanvasConnections } from "./canvas-connection-plan";

function node(id: string, type: CanvasNodeType): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 320, height: 240, metadata: { status: "idle" } };
}

describe("canvas connection plan", () => {
    it("expands a selected anchor to every connectable selected node in stable order", () => {
        const nodes = [
            node("a", CanvasNodeType.Image),
            node("comment", CanvasNodeType.Comment),
            node("b", CanvasNodeType.Video),
            node("group", CanvasNodeType.Group),
            node("workflow", CanvasNodeType.WorkflowGroup),
        ];
        const handles = connectionHandlesForSelection(
            { nodeId: "b", handleType: "source" },
            new Set(["a", "comment", "b", "group", "workflow"]),
            nodes,
        );

        expect(handles).toEqual([
            { nodeId: "b", handleType: "source" },
            { nodeId: "a", handleType: "source", port: undefined },
            { nodeId: "workflow", handleType: "source", port: "workflow-output" },
        ]);
    });

    it("keeps a single anchor when the dragged node is not part of the selection", () => {
        const anchor = { nodeId: "outside", handleType: "target" as const };
        expect(connectionHandlesForSelection(anchor, new Set(["a", "b"]), [node("a", CanvasNodeType.Image), node("b", CanvasNodeType.Video)])).toEqual([anchor]);
    });

    it("plans only new compatible connections and reports skipped handles", () => {
        const handles: ConnectionHandle[] = [
            { nodeId: "a", handleType: "source" },
            { nodeId: "b", handleType: "source" },
            { nodeId: "bad", handleType: "source" },
        ];
        const existing: CanvasConnection[] = [{ id: "existing", fromNodeId: "a", toNodeId: "target" }];
        let nextId = 0;
        const result = planCanvasConnections(
            handles,
            "target",
            existing,
            (handle, targetNodeId) => handle.nodeId === "bad" ? null : { fromNodeId: handle.nodeId, toNodeId: targetNodeId },
            () => `conn-${++nextId}`,
        );

        expect(result).toEqual({
            connections: [{ id: "conn-1", fromNodeId: "b", toNodeId: "target" }],
            skipped: 2,
        });
    });
});
