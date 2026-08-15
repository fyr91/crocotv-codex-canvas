import assert from "node:assert/strict";
import test from "node:test";
import { newStudioProjectState } from "./studio-schemas";
import { stableStudioNodeId, studioScriptMappingOperations } from "./studio-canvas-mapping";

test("Studio mapping IDs are stable and bounded", () => {
  const first = stableStudioNodeId("project-1", "script", "script-1", "source-text");
  const second = stableStudioNodeId("project-1", "script", "script-1", "source-text");
  const different = stableStudioNodeId("project-1", "script", "script-1", "stage-group");
  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.match(first, /^[A-Za-z0-9_-]{1,80}$/);
});

test("rich Studio stages project assets, shots, takes, and assembly into one managed graph", () => {
  const projectId = "project-rich";
  const state = {
    ...newStudioProjectState("雨夜车站"),
    characters: [{ id: "lin-zhou", name: "林舟", description: "青年侦探", image_asset: { selected_id: "portrait-1", variants: [{ id: "portrait-1", url: "/files/by-id/image-1", resource_id: "image-1", created_at: 1 }] } }],
    frames: [{ id: "shot-1", title: "镜头一", prompt: "雨夜远景", order: 0, selected_video_id: "take-1" }],
    videoTasks: [{ id: "take-1", project_id: projectId, frame_id: "shot-1", status: "completed", prompt: "雨夜远景", image_url: "/files/by-id/image-1", created_at: 2, resource_id: "video-1", video_url: "/files/by-id/video-1" }],
    assembly: { orderedFrameIds: ["shot-1"] },
  };
  const operations = studioScriptMappingOperations({ projectId, state, nodes: [], connections: [] });
  const nodes = operations.flatMap((operation) => operation.op === "add_node" ? [operation.node] : []);
  assert.equal(nodes.filter((node) => node.type === "group").length, 5);
  assert.ok(nodes.some((node) => node.metadata?.studioRole === "image-output-portrait-1" && node.metadata.storageKey === "image-1"));
  assert.ok(nodes.some((node) => node.metadata?.studioRole === "video-output" && node.metadata.storageKey === "video-1"));
  assert.ok(nodes.some((node) => node.metadata?.studioRole === "visual-context-config" && node.metadata.artifactType === "studio-visual-context-config"));
  assert.ok(nodes.some((node) => node.metadata?.studioRole === "prompt-revision-config" && node.metadata.artifactType === "studio-shot-revision-config"));
  assert.ok(nodes.some((node) => node.metadata?.studioEntityId === projectId && node.metadata.artifactType === "studio-video-prompt-config"));
  assert.ok(operations.some((operation) => operation.op === "connect" && operation.to === stableStudioNodeId(projectId, "assembly", projectId, "timeline")));
  const leaves = nodes.filter((node) => node.type !== "group");
  for (let left = 0; left < leaves.length; left += 1) for (let right = left + 1; right < leaves.length; right += 1) {
    const a = leaves[left];
    const b = leaves[right];
    const overlaps = a.position!.x < b.position!.x + b.width! && a.position!.x + a.width! > b.position!.x
      && a.position!.y < b.position!.y + b.height! && a.position!.y + a.height! > b.position!.y;
    assert.equal(overlaps, false, `${a.title} overlaps ${b.title}`);
  }
});

test("Studio full mapping becomes updates when managed nodes already exist", () => {
  const projectId = "project-1";
  const state = newStudioProjectState("第一场");
  const created = studioScriptMappingOperations({ projectId, state, nodes: [] });
  assert.ok(created.filter((operation) => operation.op === "add_node").length >= 10);
  const nodes = created.flatMap((operation) => operation.op === "add_node" ? [{ id: String(operation.node.id), type: String(operation.node.type), metadata: operation.node.metadata }] : []);
  const updated = studioScriptMappingOperations({ projectId, state: newStudioProjectState("第二场"), nodes });
  assert.equal(updated.some((operation) => operation.op === "add_node" || operation.op === "delete_node"), false);
  const text = updated.find((operation) => operation.op === "update_node" && operation.nodeId === stableStudioNodeId(projectId, "script", projectId, "source-text"));
  assert.ok(text);
  assert.equal(text.op, "update_node");
  assert.equal(text.patch.metadata?.content, "第二场");
});
