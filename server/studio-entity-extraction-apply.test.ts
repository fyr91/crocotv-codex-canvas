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
  testDataDir = await mkdtemp(path.join(tmpdir(), "croco-entity-apply-"));
  process.env.CROCO_DATA_DIR = testDataDir;
  const storage = await import("./storage");
  commands = await import("./studio-commands");
  workflow = await import("./studio-workflow");
  await storage.ensureStorage();
  const project = await commands.createStudioProject({ title: "Entity apply", text: "旧剧本", workflow_mode: "r2v" }, "test");
  projectId = project.id;
});

after(async () => {
  if (testDataDir) await rm(testDataDir, { recursive: true, force: true });
});

test("确认实体预览增量追加结果并记录提取基线，不再次运行模型", async () => {
  const applied = await workflow.applyStudioEntityExtraction(projectId, "新剧本", {
    characters: [{ id: "xiaoming", name: "小明", description: "主角" }],
    scenes: [{ id: "office", name: "办公室", description: "白天" }],
    props: [{ id: "key", name: "钥匙", description: "银色" }],
  }, "test-apply");

  assert.equal(applied.original_text, "新剧本");
  assert.deepEqual(applied.characters.map((item: { name: string }) => item.name), ["小明"]);
  assert.deepEqual(applied.scenes.map((item: { name: string }) => item.name), ["办公室"]);
  assert.deepEqual(applied.props.map((item: { name: string }) => item.name), ["钥匙"]);
  const stored = await commands.getStudioBackedProject(projectId);
  assert.equal(stored.studio.generationExecutions.length, 0);
  assert.equal(stored.studio.derivationBaselines.entityExtraction?.sourceText, "新剧本");
  assert.equal(stored.studio.derivationBaselines.entityExtraction?.sourceHash.length, 64);
});

test("后续确认只追加新实体，不替换或重复已有实体", async () => {
  const applied = await workflow.applyStudioEntityExtraction(projectId, "新剧本增加小红", {
    characters: [
      { id: "duplicate-xiaoming", name: "小明", description: "不应覆盖原描述" },
      { id: "xiaohong", name: "小红", description: "新角色" },
    ],
    scenes: [{ id: "office-again", name: "办公室", description: "不应重复" }],
    props: [],
  }, "test-incremental-apply");

  assert.deepEqual(applied.characters.map((item: { name: string }) => item.name), ["小明", "小红"]);
  assert.equal(applied.characters[0].description, "主角");
  assert.deepEqual(applied.scenes.map((item: { name: string }) => item.name), ["办公室"]);
  assert.equal(applied.entity_extraction_stale, false);
});

test("缺失实体数组的确认请求不会清空正式实体", async () => {
  await assert.rejects(
    workflow.applyStudioEntityExtraction(projectId, "无效请求", { characters: [] }, "test-invalid"),
    /必须包含 characters、scenes 和 props 数组/,
  );
  const stored = await commands.getStudioProject(projectId);
  assert.deepEqual(stored.characters.map((item: { name: string }) => item.name), ["小明", "小红"]);
  assert.deepEqual(stored.scenes.map((item: { name: string }) => item.name), ["办公室"]);
  assert.deepEqual(stored.props.map((item: { name: string }) => item.name), ["钥匙"]);
  assert.equal(stored.original_text, "新剧本增加小红");
});
