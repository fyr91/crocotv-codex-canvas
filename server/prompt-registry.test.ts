import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPromptTemplate, listPromptTemplates } from "./prompt-registry";

test("Prompt Registry 暴露全部九个激活模板且版本唯一", async () => {
  const templates = await listPromptTemplates();
  assert.equal(templates.length, 9);
  assert.equal(new Set(templates.map((template) => `${template.templateKey}@${template.templateVersion}`)).size, 9);
  assert.ok(templates.every((template) => template.active && !template.legacy));
});

test("读取 Prompt 时保留源文件完整字节并校验哈希", async () => {
  const template = await getPromptTemplate("croco.p4.shot-revision");
  const source = await readFile(path.resolve("plugins/croco-video-factory/skills/croco-video-factory/references", template.sourceFile), "utf8");
  assert.equal(template.systemPrompt, source);
  assert.ok(template.systemPrompt.startsWith("---\n"));
  assert.ok(template.systemPrompt.endsWith("\n"));
});

test("未知 Prompt 返回可识别的 404 错误", async () => {
  await assert.rejects(() => getPromptTemplate("croco.p9.missing"), (error: any) => error?.statusCode === 404);
});
