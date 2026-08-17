import assert from "node:assert/strict";
import test from "node:test";
import { newStudioProjectState } from "./studio-schemas";
import { stableStudioNodeId, studioMappingOperations } from "./studio-canvas-mapping";
import { translateStudioCanvasEdits } from "./studio-canvas-translation";
import type { StudioBackedProject, StudioProjectState } from "./studio-types";

function mappedProject(projectId: string, state: StudioProjectState): StudioBackedProject {
  const operations = studioMappingOperations({ projectId, state, nodes: [], connections: [] });
  const nodes = operations.flatMap((operation) => operation.op === "add_node" ? [{
    id: String(operation.node.id),
    type: String(operation.node.type),
    title: String(operation.node.title),
    position: operation.node.position || { x: 0, y: 0 },
    width: Number(operation.node.width) || 320,
    height: Number(operation.node.height) || 240,
    metadata: operation.node.metadata,
  }] : []);
  const connections = operations.flatMap((operation, index) => operation.op === "connect" ? [{
    id: `connection-${index}`,
    fromNodeId: operation.from,
    toNodeId: operation.to,
    fromPort: operation.fromPort,
    toPort: operation.toPort,
  }] : []);
  return {
    id: projectId,
    title: "Studio 测试项目",
    version: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes,
    connections,
    studio: state,
  } as StudioBackedProject;
}

test("Canvas edits update Studio frame content and title through Studio state", () => {
  const projectId = "studio-translation-update";
  const state = {
    ...newStudioProjectState("第一幕"),
    frames: [{ id: "shot-1", title: "旧标题", prompt: "旧提示词", order: 0 }],
    assembly: { orderedFrameIds: ["shot-1"] },
  };
  const project = mappedProject(projectId, state);
  const promptNodeId = stableStudioNodeId(projectId, "frame", "shot-1", "prompt");
  const next = translateStudioCanvasEdits(state, project, [{ op: "update_node", nodeId: promptNodeId, title: "新标题", content: "新提示词" }]);
  assert.equal(next.frames[0]?.title, "新标题");
  assert.equal(next.frames[0]?.prompt, "新提示词");
});

test("deleting a Studio entity node removes the entity and its user bindings", () => {
  const projectId = "studio-translation-delete";
  const state = {
    ...newStudioProjectState("第一幕"),
    characters: [{ id: "character-1", name: "林舟", description: "侦探" }],
  };
  const project = mappedProject(projectId, state);
  const characterNodeId = stableStudioNodeId(projectId, "character", "character-1", "description");
  const externalNode = { id: "free-node", type: "text", title: "自由节点", position: { x: 0, y: 0 }, width: 320, height: 240, metadata: {} };
  project.nodes.push(externalNode);
  state.canvasBindings = [{ id: "binding-1", fromNodeId: externalNode.id, toNodeId: characterNodeId }];
  const next = translateStudioCanvasEdits(state, project, [{ op: "delete_node", nodeId: characterNodeId }]);
  assert.deepEqual(next.characters, []);
  assert.deepEqual(next.canvasBindings, []);
});

test("connections touching managed nodes persist as Studio canvas bindings", () => {
  const projectId = "studio-translation-connect";
  const state = newStudioProjectState("第一幕");
  const project = mappedProject(projectId, state);
  const scriptNodeId = stableStudioNodeId(projectId, "script", projectId, "source-text");
  project.nodes.push({ id: "free-node", type: "text", title: "自由节点", position: { x: 0, y: 0 }, width: 320, height: 240, metadata: {} });
  const next = translateStudioCanvasEdits(state, project, [{ op: "connect", fromNodeId: "free-node", toNodeId: scriptNodeId, fromPort: "node", toPort: "node" }]);
  assert.equal(next.canvasBindings.length, 1);
  assert.deepEqual(next.canvasBindings[0] && { ...next.canvasBindings[0], id: "stable" }, { id: "stable", fromNodeId: "free-node", toNodeId: scriptNodeId, fromPort: "node", toPort: "node" });
  const mapped = studioMappingOperations({ projectId, state: next, nodes: project.nodes, connections: project.connections });
  assert.ok(mapped.some((operation) => operation.op === "connect" && operation.from === "free-node" && operation.to === scriptNodeId && operation.fromPort === "node" && operation.toPort === "node"));
});

test("fixed Studio workflow connections cannot be disconnected from Canvas", () => {
  const projectId = "studio-translation-fixed-edge";
  const state = newStudioProjectState("第一幕");
  const project = mappedProject(projectId, state);
  const fixed = project.connections[0];
  assert.ok(fixed);
  assert.throws(
    () => translateStudioCanvasEdits(state, project, [{ op: "disconnect", connectionId: fixed.id }]),
    /基础流程连接不能直接断开/,
  );
});

test("Canvas config choices persist as typed Studio node overrides", () => {
  const projectId = "studio-translation-config";
  const state = newStudioProjectState("第一幕");
  const project = mappedProject(projectId, state);
  const configNodeId = stableStudioNodeId(projectId, "script", projectId, "entity-analysis-config");
  const next = translateStudioCanvasEdits(state, project, [{ op: "update_node", nodeId: configNodeId, metadata: { model: "glm-5.3", count: 2, studioRole: "tampered" } }]);
  assert.deepEqual(next.canvasNodeOverrides, [{ nodeId: configNodeId, metadata: { model: "glm-5.3", count: 2 } }]);
  const mapped = studioMappingOperations({ projectId, state: next, nodes: project.nodes, connections: project.connections });
  const update = mapped.find((operation) => operation.op === "update_node" && operation.nodeId === configNodeId);
  assert.equal(update?.op, "update_node");
  assert.equal(update.patch.metadata?.model, "glm-5.3");
  assert.equal(update.patch.metadata?.studioRole, "entity-analysis-config");
});
