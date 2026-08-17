import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDataDir = "";
let projectId = "";
let commands: typeof import("./studio-commands");
let workflow: typeof import("./studio-workflow");

before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "croco-derivation-baselines-"));
  process.env.CROCO_DATA_DIR = testDataDir;
  const storage = await import("./storage");
  commands = await import("./studio-commands");
  workflow = await import("./studio-workflow");
  await storage.ensureStorage();
  const project = await commands.createStudioProject({ title: "Derivation baselines", text: "第一版剧本", workflow_mode: "r2v" }, "test");
  projectId = project.id;
});

after(async () => {
  if (testDataDir) await rm(testDataDir, { recursive: true, force: true });
});

test("实体与分镜基线只在用户确认派生结果时更新", async () => {
  const extracted = await workflow.applyStudioEntityExtraction(projectId, "第一版剧本", {
    characters: [{ id: "lead", name: "主角", description: "" }],
    scenes: [],
    props: [],
  }, "test-extraction");
  assert.equal(extracted.entity_extraction_stale, false);

  const storyboard = await workflow.replaceStudioStoryboard(projectId, [{
    id: "shot-1",
    title: "镜头 1",
    prompt: "主角进入房间",
    order: 0,
  }], "test-storyboard");
  assert.equal(storyboard.storyboard_stale, false);

  const edited = await commands.updateStudioScript(projectId, { text: "第二版剧本：主角进入房间后拿起钥匙" }, "test-edit");
  assert.equal(edited.entity_extraction_stale, true);
  assert.equal(edited.storyboard_stale, true);

  const stored = await commands.getStudioBackedProject(projectId);
  assert.equal(stored.studio.derivationBaselines.entityExtraction?.sourceText, "第一版剧本");
  assert.equal(stored.studio.frames[0]?.id, "shot-1");
});
