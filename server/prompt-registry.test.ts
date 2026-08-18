import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDirectory = "";
let registry: typeof import("./prompt-registry");

before(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "croco-prompt-registry-"));
  process.env.CROCO_PROMPT_REGISTRY_PATH = path.join(testDirectory, "registry.json");
  registry = await import("./prompt-registry");
});

after(async () => {
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
});

test("Prompt Registry 暴露全部九个激活模板且版本唯一", async () => {
  const templates = await registry.listPromptTemplates();
  assert.equal(templates.length, 9);
  assert.equal(new Set(templates.map((template) => `${template.templateKey}@${template.templateVersion}`)).size, 9);
  assert.ok(templates.every((template) => template.active && !template.legacy));
});

test("读取 Prompt 时保留源文件完整字节并校验哈希", async () => {
  const template = await registry.getPromptTemplate("croco.p4.shot-revision");
  const source = await readFile(path.resolve("plugins/croco-video-factory/skills/croco-video-factory/references", template.sourceFile), "utf8");
  assert.equal(template.systemPrompt, source);
  assert.ok(template.systemPrompt.startsWith("---\n"));
  assert.ok(template.systemPrompt.endsWith("\n"));
});

test("艺术方向模板固定使用 Doubao Responses 并声明候选字段 Schema", async () => {
  const template = await registry.getPromptTemplate("croco.p3.art-direction-options");
  assert.deepEqual(template.modelPolicy, {
    defaultModel: "doubao-seed-2.1-turbo",
    modelFamily: "ark_responses",
    allowOverride: false,
  });
  assert.match(template.systemPrompt, /生成恰好 3 个/);
  assert.deepEqual(template.outputSchema, artDirectionOutputSchema());
});

test("实体提取作为独立模板进入全局 Registry 并保留旧模板兼容读取", async () => {
  const active = await registry.getPromptTemplate("croco.p3.entity-extraction");
  assert.equal(active.title, "实体提取");
  assert.equal(active.templateVersion, "1.0.0");
  const legacy = await registry.getPromptTemplate("croco.p3.production-design");
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.active, false);
  assert.ok(!(await registry.listPromptTemplates()).some((template) => template.templateKey === legacy.templateKey));
});

test("未知 Prompt 返回可识别的 404 错误", async () => {
  await assert.rejects(() => registry.getPromptTemplate("croco.p9.missing"), (error: any) => error?.statusCode === 404);
});

test("全局 Prompt 版本只追加且可在历史版本之间切换激活", async () => {
  const original = await registry.getPromptTemplate("croco.p4.shot-revision");
  const custom = await registry.createGlobalPromptVersion({
    templateKey: original.templateKey,
    baseVersion: original.templateVersion,
    systemPrompt: `${original.systemPrompt}\n项目外全局版本测试`,
    activate: false,
  });
  assert.equal(custom.templateVersion, "1.0.1");
  assert.equal((await registry.getPromptTemplate(original.templateKey)).templateVersion, original.templateVersion);
  await registry.activateGlobalPromptVersion(original.templateKey, custom.templateVersion);
  assert.equal((await registry.getPromptTemplate(original.templateKey)).templateVersion, custom.templateVersion);
  await registry.activateGlobalPromptVersion(original.templateKey, original.templateVersion);
  const all = (await registry.listPromptTemplates({ includeInactive: true })).filter((item) => item.templateKey === original.templateKey);
  assert.deepEqual(new Set(all.map((item) => item.templateVersion)), new Set([original.templateVersion, custom.templateVersion]));
  assert.equal(all.find((item) => item.active)?.templateVersion, original.templateVersion);
});

function artDirectionOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["options"],
    properties: {
      options: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["image_prompt", "video_prompt"],
          properties: {
            name: { type: "string", minLength: 1 },
            description: { type: "string", minLength: 1 },
            image_prompt: { type: "string", minLength: 1 },
            video_prompt: { type: "string", minLength: 1 },
          },
        },
      },
    },
  };
}
