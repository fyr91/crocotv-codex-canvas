import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDataDir = "";
let projectId = "";
let storage: typeof import("./storage");
let commands: typeof import("./canvas-commands");

before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "croco-studio-protection-"));
  process.env.CROCO_DATA_DIR = testDataDir;
  storage = await import("./storage");
  commands = await import("./canvas-commands");
  const { newStudioProjectState } = await import("./studio-schemas");
  const { studioScriptMappingOperations } = await import("./studio-canvas-mapping");
  await storage.ensureStorage();
  const base = await storage.createProject("Studio protection");
  projectId = String(base.id);
  const state = newStudioProjectState("原始剧本", "r2v");
  await commands.applyCanvasOperations(projectId, [
    { op: "set_studio_state", state },
    ...studioScriptMappingOperations({ projectId, state, nodes: [] }),
  ], Number(base.version), { allowStudioManagedWrites: true });
});

after(async () => {
  if (testDataDir) await rm(testDataDir, { recursive: true, force: true });
});

test("generic Canvas operations cannot change Studio-managed semantics or connections", async () => {
  const project = await storage.readProject(projectId) as Record<string, any>;
  const textNode = project.nodes.find((node: Record<string, any>) => node.metadata?.studioRole === "source-text");
  await assert.rejects(
    commands.applyCanvasOperations(projectId, [{ op: "update_node", nodeId: textNode.id, patch: { metadata: { content: "绕过 Studio" } } }], project.version),
    /Studio 结构化命令/,
  );
  const withFreeNode = await commands.applyCanvasOperations(projectId, [{ op: "add_node", node: { type: "comment", title: "自由节点" } }], project.version);
  const freeNode = (withFreeNode.project as Record<string, any>).nodes.find((node: Record<string, any>) => node.type === "comment");
  await assert.rejects(
    commands.applyCanvasOperations(projectId, [{ op: "connect", from: freeNode.id, to: textNode.id }], Number((withFreeNode.project as Record<string, any>).version)),
    /Studio 托管节点的连接/,
  );
});

test("full Canvas saves preserve Studio state and managed semantics while accepting visual geometry", async () => {
  const project = await storage.readProject(projectId) as Record<string, any>;
  const textNode = project.nodes.find((node: Record<string, any>) => node.metadata?.studioRole === "source-text");
  const groupNode = project.nodes.find((node: Record<string, any>) => node.metadata?.studioRole === "stage-group");
  const incoming = structuredClone(project);
  incoming.studio.originalText = "不应写入";
  incoming.nodes = incoming.nodes
    .filter((node: Record<string, any>) => node.id !== groupNode.id)
    .map((node: Record<string, any>) => node.id === textNode.id
      ? { ...node, position: { x: 888, y: 999 }, title: "不应写入", metadata: { ...node.metadata, content: "不应写入" } }
      : node);
  incoming.nodes.push({ id: "forged-studio-node", type: "text", title: "伪造托管节点", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { studioManaged: true } });
  const saved = await storage.saveProject(projectId, incoming, project.version) as Record<string, any>;
  const savedText = saved.nodes.find((node: Record<string, any>) => node.id === textNode.id);
  assert.equal(saved.studio.originalText, "原始剧本");
  assert.equal(savedText.metadata.content, "原始剧本");
  assert.equal(savedText.title, textNode.title);
  assert.deepEqual(savedText.position, { x: 888, y: 999 });
  assert.equal(saved.nodes.some((node: Record<string, any>) => node.id === groupNode.id), true);
  assert.equal(saved.nodes.some((node: Record<string, any>) => node.id === "forged-studio-node"), false);
});
