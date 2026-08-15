import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDirectory = "";
let projectId = "";
let strategyModule: typeof import("./studio-prompt-strategy");
let registryModule: typeof import("./prompt-registry");

before(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "croco-project-prompt-"));
  process.env.CROCO_DATA_DIR = testDirectory;
  process.env.CROCO_PROMPT_REGISTRY_PATH = path.join(testDirectory, "prompt-registry.json");
  const storage = await import("./storage");
  const studioCommands = await import("./studio-commands");
  strategyModule = await import("./studio-prompt-strategy");
  registryModule = await import("./prompt-registry");
  await storage.ensureStorage();
  const project = await studioCommands.createStudioProject({ title: "Prompt strategy", text: "第一幕", workflow_mode: "r2v" }, "test");
  projectId = project.id;
});

after(async () => {
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
});

test("项目 Prompt 版本不可变保留并可切换全局、锁定和项目绑定", async () => {
  let strategy = await strategyModule.getStudioPromptStrategy(projectId);
  let operation = strategy.operations.find((item) => item.operation === "storyboard_polish")!;
  assert.equal(operation.binding.source, "builtin");
  const global = await registryModule.getPromptTemplate(operation.templateKey, operation.effective.templateVersion);

  strategy = await strategyModule.createStudioProjectPromptVersion(projectId, "storyboard_polish", {
    baseVersion: global.templateVersion,
    systemPrompt: `${global.systemPrompt}\n项目版本一`,
    expectedVersion: strategy.projectVersion,
  }, "test");
  operation = strategy.operations.find((item) => item.operation === "storyboard_polish")!;
  const firstVersion = operation.binding.templateVersion!;
  assert.equal(operation.binding.source, "project");
  assert.equal(operation.projectVersions.length, 1);

  strategy = await strategyModule.createStudioProjectPromptVersion(projectId, "storyboard_polish", {
    baseVersion: firstVersion,
    systemPrompt: `${operation.projectVersions[0].systemPrompt}\n项目版本二`,
    expectedVersion: strategy.projectVersion,
  }, "test");
  operation = strategy.operations.find((item) => item.operation === "storyboard_polish")!;
  const secondVersion = operation.binding.templateVersion!;
  assert.notEqual(secondVersion, firstVersion);
  assert.deepEqual(new Set(operation.projectVersions.map((item) => item.templateVersion)), new Set([firstVersion, secondVersion]));

  strategy = await strategyModule.setStudioPromptBinding(projectId, "storyboard_polish", { mode: "follow_global", expectedVersion: strategy.projectVersion }, "test");
  operation = strategy.operations.find((item) => item.operation === "storyboard_polish")!;
  assert.equal(operation.binding.source, "builtin");
  assert.equal(operation.projectVersions.length, 2);

  strategy = await strategyModule.setStudioPromptBinding(projectId, "storyboard_polish", { mode: "pin_global", templateVersion: global.templateVersion, expectedVersion: strategy.projectVersion }, "test");
  operation = strategy.operations.find((item) => item.operation === "storyboard_polish")!;
  assert.equal(operation.binding.source, "global-pinned");

  strategy = await strategyModule.setStudioPromptBinding(projectId, "storyboard_polish", { mode: "project", templateVersion: firstVersion, expectedVersion: strategy.projectVersion }, "test");
  operation = strategy.operations.find((item) => item.operation === "storyboard_polish")!;
  assert.equal(operation.binding.source, "project");
  assert.equal(operation.binding.templateVersion, firstVersion);
  assert.equal(operation.projectVersions.length, 2);

  const concurrentResults = await Promise.allSettled([
    strategyModule.createStudioProjectPromptVersion(projectId, "storyboard_polish", {
      baseVersion: global.templateVersion,
      systemPrompt: `${global.systemPrompt}\n并发版本甲`,
    }, "test-a"),
    strategyModule.createStudioProjectPromptVersion(projectId, "storyboard_polish", {
      baseVersion: global.templateVersion,
      systemPrompt: `${global.systemPrompt}\n并发版本乙`,
    }, "test-b"),
  ]);
  assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
  const conflict = concurrentResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.equal(conflict?.reason?.statusCode, 409);
  strategy = await strategyModule.getStudioPromptStrategy(projectId);
  operation = strategy.operations.find((item) => item.operation === "storyboard_polish")!;
  assert.equal(operation.projectVersions.length, 3);
  assert.equal(new Set(operation.projectVersions.map((item) => item.templateVersion)).size, 3);
});
