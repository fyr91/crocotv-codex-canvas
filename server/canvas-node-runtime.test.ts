import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDataDir = "";
let projectId = "";
let storage: typeof import("./storage");
let commands: typeof import("./canvas-commands");
let runtime: typeof import("./canvas-node-runtime");

before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "croco-canvas-node-runtime-"));
  process.env.CROCO_DATA_DIR = testDataDir;
  storage = await import("./storage");
  commands = await import("./canvas-commands");
  runtime = await import("./canvas-node-runtime");
  await storage.ensureStorage();
  const base = await storage.createProject("Generation placeholder");
  projectId = String(base.id);
  await commands.applyCanvasOperations(projectId, [{
    op: "add_node",
    node: {
      id: "config-1",
      type: "config",
      title: "生成模组",
      position: { x: 100, y: 100 },
      width: 400,
      height: 300,
      metadata: {
        generationMode: "video",
        model: "minimax-h3",
        composerContent: "三个角色旋转合并成一个",
        videoInputMode: "text",
        videoPromptEnhance: true,
        prompt_extend: true,
        videoCount: 1,
      },
    },
  }], Number(base.version));
});

after(async () => {
  if (testDataDir) await rm(testDataDir, { recursive: true, force: true });
});

test("publishes a loading output node before H3 prompt optimization completes", async () => {
  let enterOptimizer!: () => void;
  let releaseOptimizer!: (value: {
    draftPrompt: string;
    prompt: string;
    optimized: boolean;
    inputMode: string;
    resourceRoles: [];
  }) => void;
  const optimizerEntered = new Promise<void>((resolve) => { enterOptimizer = resolve; });
  const optimizerGate = new Promise<{
    draftPrompt: string;
    prompt: string;
    optimized: boolean;
    inputMode: string;
    resourceRoles: [];
  }>((resolve) => { releaseOptimizer = resolve; });
  const controller = new AbortController();

  const running = runtime.runCanvasConfigNodes({
    projectId,
    configNodeIds: ["config-1"],
    concurrency: 1,
    originClientId: "canvas-test",
    remoteOperation: true,
    operationId: "canvas-job-1",
    operationOrigin: "canvas",
    signal: controller.signal,
    dependencies: {
      prepareH3Prompt: async () => {
        enterOptimizer();
        return optimizerGate;
      },
    },
  });

  await optimizerEntered;
  const project = await storage.readProject(projectId) as Record<string, any>;
  const config = project.nodes.find((node: Record<string, any>) => node.id === "config-1");
  const output = project.nodes.find((node: Record<string, any>) => node.metadata?.sourceConfigNodeId === "config-1");
  assert.ok(output, "the result placeholder should exist while prompt optimization is pending");
  assert.equal(output.type, "video");
  assert.equal(output.metadata.status, "loading");
  assert.equal(output.metadata.generationState, "running");
  assert.equal(output.metadata.remoteOperationId, "canvas-job-1");
  assert.equal(output.metadata.remoteOperationOrigin, "canvas");
  assert.equal(config.metadata.remoteOperationLabel, "正在执行生成模组");
  assert.ok(project.connections.some((connection: Record<string, any>) => connection.fromNodeId === "config-1" && connection.toNodeId === output.id));

  controller.abort(new Error("test complete"));
  releaseOptimizer({
    draftPrompt: "三个角色旋转合并成一个",
    prompt: "optimized prompt",
    optimized: true,
    inputMode: "text",
    resourceRoles: [],
  });
  await running;
  const cancelled = await storage.readProject(projectId) as Record<string, any>;
  const cancelledOutput = cancelled.nodes.find((node: Record<string, any>) => node.metadata?.sourceConfigNodeId === "config-1");
  assert.equal(cancelledOutput.metadata.remoteOperationLabel, "生成已取消");
  assert.equal(cancelledOutput.metadata.remoteOperationOrigin, null);
});
