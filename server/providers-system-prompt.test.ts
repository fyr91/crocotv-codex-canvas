import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText } from "./providers";

test("文本 Provider 保留 System Prompt 完整字节", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.CODING_PLAN_API_KEY;
  const systemPrompt = "  system prompt 首部空白\n尾部空白  \n";
  let requestBody: any;
  process.env.CODING_PLAN_API_KEY = "test-key";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.equal(await generateText("user", "glm-5.3", [], [], systemPrompt), "ok");
    assert.equal(requestBody.system, systemPrompt);
    assert.deepEqual(requestBody.messages, [{ role: "user", content: "user" }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CODING_PLAN_API_KEY;
    else process.env.CODING_PLAN_API_KEY = originalKey;
  }
});

test("DeepSeek thinking 模式按调用参数显式传递", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.CODING_PLAN_API_KEY;
  const requestBodies: any[] = [];
  process.env.CODING_PLAN_API_KEY = "test-key";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body || "{}")));
    return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await generateText("extract", "deepseek-v4-flash", [], [], "", { thinking: "disabled" });
    await generateText("default", "deepseek-v4-flash");
    assert.deepEqual(requestBodies[0].thinking, { type: "disabled" });
    assert.deepEqual(requestBodies[1].thinking, { type: "enabled" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CODING_PLAN_API_KEY;
    else process.env.CODING_PLAN_API_KEY = originalKey;
  }
});
