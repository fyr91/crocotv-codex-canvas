import assert from "node:assert/strict";
import test from "node:test";

import {
    buildRunwareImageRequest,
    GPT_IMAGE_02_MODEL,
    NANO_BANANA_LITE_MODEL,
} from "./runware-client.mjs";

test("Croco image requests default to Nano Banana Lite", () => {
    const request = buildRunwareImageRequest({ prompt: "test", width: 1024, height: 1024 }, "task-lite");
    assert.equal(request.model, NANO_BANANA_LITE_MODEL);
    assert.deepEqual(request.safety, { checkContent: true });
    assert.equal(request.providerSettings, undefined);
});

test("GPT Image 02 requests use OpenAI provider settings", () => {
    const request = buildRunwareImageRequest({ prompt: "test", model: GPT_IMAGE_02_MODEL }, "task-gpt");
    assert.equal(request.model, GPT_IMAGE_02_MODEL);
    assert.deepEqual(request.providerSettings, { openai: { quality: "auto", moderation: "low" } });
    assert.equal(request.safety, undefined);
});

test("Croco flow rejects ordinary Nano Banana without removing it from Canvas runtime", () => {
    assert.throws(
        () => buildRunwareImageRequest({ prompt: "test", model: "google:4@1" }, "task-nano"),
        /Croco Video Factory 图像路由不支持模型/,
    );
});
