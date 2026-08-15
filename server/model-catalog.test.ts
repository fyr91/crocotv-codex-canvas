import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { getStudioModelCatalog } from "./model-catalog";

test("Studio 生成目录与服务端权威模型目录完全一致", async () => {
  const generated = JSON.parse(await readFile("studio/src/generated/modelCatalog.json", "utf8"));
  assert.deepEqual(generated, getStudioModelCatalog());
});

test("模型目录公开统一名称与 H3 四种输入模式", () => {
  const catalog = getStudioModelCatalog();
  assert.equal(catalog.models["google:4@1"].display_name, "Nano Banana");
  assert.equal(catalog.models["openai:gpt-image@2"].display_name, "GPT Image 02");
  assert.deepEqual(catalog.model_lines["minimax-h3"].modes, ["t2v", "i2v", "fl2v", "r2v"]);
  assert.equal(catalog.models["minimax-h3"].inputs.first_frame.ordered, true);
  assert.equal(catalog.models["minimax-h3"].inputs.last_frame.ordered, true);
});
