import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLtxGenerationRequest } from "./providers";

test("LTX 2.5 固定适配器区分文生视频、首帧与 Ingredients", () => {
  const base = { prompt: "A paper boat crosses a quiet lake", size: "1280x704", duration: 5, optimizePrompt: true, referenceStrength: 1, seed: 42 };
  const text = buildLtxGenerationRequest({ ...base, inputMode: "text", hasImage: false });
  assert.equal(text.workflowId, "ltx25_distilled_t2v_v1");
  assert.equal(text.inputRole, undefined);
  assert.equal(text.numFrames, 121);
  assert.equal(text.parameters.fps, 24);

  const firstFrame = buildLtxGenerationRequest({ ...base, inputMode: "firstFrame", hasImage: true });
  assert.equal(firstFrame.workflowId, "ltx25_distilled_i2v_v1");
  assert.equal(firstFrame.inputRole, "first_frame");

  const ingredients = buildLtxGenerationRequest({ ...base, inputMode: "multimodal", hasImage: true });
  assert.equal(ingredients.workflowId, "ltx25_ic_lora_ingredients_v1");
  assert.equal(ingredients.inputRole, "reference_sheet");
});

test("LTX 2.5 固定适配器阻止超出像素帧预算的请求", () => {
  assert.throws(() => buildLtxGenerationRequest({ prompt: "A valid prompt", size: "4096x2304", duration: 20, inputMode: "text", optimizePrompt: true, referenceStrength: 1, hasImage: false, seed: 42 }), /像素帧预算/);
});
