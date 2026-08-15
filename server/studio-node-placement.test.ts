import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasOperation } from "./canvas-commands";
import { avoidStudioNodeOverlaps } from "./studio-node-placement";

test("Studio additions move down without moving existing nodes", () => {
  const existing = [{ id: "existing", type: "text", position: { x: 160, y: 160 }, width: 320, height: 240 }];
  const operations: CanvasOperation[] = [
    { op: "add_node", node: { id: "first", type: "text", position: { x: 160, y: 160 }, width: 320, height: 240 } },
    { op: "add_node", node: { id: "second", type: "text", position: { x: 160, y: 160 }, width: 320, height: 240 } },
  ];
  const placed = avoidStudioNodeOverlaps(existing, operations);
  assert.deepEqual(existing[0].position, { x: 160, y: 160 });
  assert.deepEqual(placed[0].op === "add_node" && placed[0].node.position, { x: 160, y: 440 });
  assert.deepEqual(placed[1].op === "add_node" && placed[1].node.position, { x: 160, y: 720 });
});

test("Studio placement leaves non-creation operations unchanged", () => {
  const operation: CanvasOperation = { op: "update_node", nodeId: "node-1", patch: { title: "新标题" } };
  assert.equal(avoidStudioNodeOverlaps([], [operation])[0], operation);
});
