import assert from "node:assert/strict";
import { test } from "vitest";

import { duplicateCanvasNode } from "../src/lib/canvas/canvas-node-duplicate.ts";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas.ts";

function node(id: string, x: number): CanvasNodeData {
    return { id, type: CanvasNodeType.Text, title: id, position: { x, y: 20 }, width: 240, height: 160, metadata: { content: id, status: "success" } };
}

test("copying from a multi-selection duplicates every selected node and their connection", () => {
    const nodes = [node("a", 10), node("b", 300), node("outside", -300)];
    const connections: CanvasConnection[] = [
        { id: "internal", fromNodeId: "a", toNodeId: "b" },
        { id: "incoming", fromNodeId: "outside", toNodeId: "a" },
    ];
    let nextId = 0;

    const copy = duplicateCanvasNode(new Set(["a", "b"]) as unknown as string, nodes, connections, () => `copy-${++nextId}`);

    assert.ok(copy);
    assert.equal(copy.nodes.length, 2);
    assert.deepEqual(copy.nodes.map((item) => item.position), [{ x: 46, y: 56 }, { x: 336, y: 56 }]);
    assert.equal(copy.connections.some((connection) => copy.nodes.some((item) => item.id === connection.fromNodeId) && copy.nodes.some((item) => item.id === connection.toNodeId)), true);
    assert.equal(copy.connections.some((connection) => connection.fromNodeId === "outside" && copy.nodes.some((item) => item.id === connection.toNodeId)), true);
});
