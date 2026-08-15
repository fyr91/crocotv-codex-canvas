import assert from "node:assert/strict";
import test from "node:test";
import { avoidMcpNodeOverlaps } from "./node-placement";

test("MCP additions minimally shift right when an explicit anchor overlaps", () => {
  const existing = [{ id: "existing", type: "text", position: { x: 160, y: 160 }, width: 320, height: 240 }];
  const result = avoidMcpNodeOverlaps(existing, [{ op: "add_node", node: { id: "new", type: "image", position: { x: 160, y: 160 } } }]) as any[];
  assert.deepEqual(result[0].node.position, { x: 544, y: 160 });
  assert.deepEqual(existing[0].position, { x: 160, y: 160 });
});

test("MCP additions without coordinates receive sequential collision-free positions", () => {
  const result = avoidMcpNodeOverlaps([], [
    { op: "add_node", ref: "first", node: { type: "text" } },
    { op: "add_node", ref: "second", node: { type: "text" } },
  ]) as any[];
  assert.deepEqual(result[0].node.position, { x: 160, y: 160 });
  assert.deepEqual(result[1].node.position, { x: 544, y: 160 });
});

test("MCP group children may occupy their parent while still avoiding siblings", () => {
  const result = avoidMcpNodeOverlaps([], [
    { op: "add_node", node: { id: "group", type: "group", position: { x: 160, y: 160 }, width: 720, height: 520 } },
    { op: "add_node", node: { id: "child-a", type: "text", position: { x: 200, y: 220 }, metadata: { groupId: "group" } } },
    { op: "add_node", node: { id: "child-b", type: "text", position: { x: 200, y: 220 }, metadata: { groupId: "group" } } },
  ]) as any[];
  assert.deepEqual(result[1].node.position, { x: 200, y: 220 });
  assert.equal(result[2].node.position.y > result[1].node.position.y, true);
});
