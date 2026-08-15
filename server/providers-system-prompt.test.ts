import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText } from "./providers";

test("文本 Provider 保留 System Prompt 完整字节", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.BIGMODEL_API_KEY;
  const systemPrompt = "  system prompt 首部空白\n尾部空白  \n";
  let requestBody: any;
  process.env.BIGMODEL_API_KEY = "test-key";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.equal(await generateText("user", "glm-5.2", [], [], systemPrompt), "ok");
    assert.equal(requestBody.messages[0].role, "system");
    assert.equal(requestBody.messages[0].content, systemPrompt);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BIGMODEL_API_KEY;
    else process.env.BIGMODEL_API_KEY = originalKey;
  }
});
