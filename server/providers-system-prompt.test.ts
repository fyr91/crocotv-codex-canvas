import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText } from "./providers";

const artDirectionSchema = {
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

test("Doubao 风格分析通过无 Web Search 的 Responses API 应用 JSON Schema", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ARK_API_KEY;
  const originalBaseUrl = process.env.ARK_BASE_URL;
  const originalModel = process.env.ARK_DOUBAO_TURBO_MODEL;
  let requestBody: any;
  const structuredResult = {
    options: [
      { name: "风格一", description: "说明一", image_prompt: "图像一", video_prompt: "视频一" },
      { name: "风格二", description: "说明二", image_prompt: "图像二", video_prompt: "视频二" },
      { name: "风格三", description: "说明三", image_prompt: "图像三", video_prompt: "视频三" },
    ],
  };
  process.env.ARK_API_KEY = "test-key";
  process.env.ARK_BASE_URL = "https://ark.example/api/v3";
  process.env.ARK_DOUBAO_TURBO_MODEL = "doubao-seed-2-1-turbo-test";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://ark.example/api/v3/responses");
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(structuredResult) }] }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const text = await generateText("提取风格", "doubao-seed-2.1-turbo", [], [], "system", {
      outputSchema: artDirectionSchema,
      outputSchemaName: "art_direction_options",
      responseApi: "ark-responses",
    });
    assert.deepEqual(JSON.parse(text), structuredResult);
    assert.equal(requestBody.model, "doubao-seed-2-1-turbo-test");
    assert.equal(requestBody.instructions, "system");
    assert.deepEqual(requestBody.input, [{ role: "user", content: "提取风格" }]);
    assert.equal(requestBody.tools, undefined);
    assert.deepEqual(requestBody.text, { format: { type: "json_schema", name: "art_direction_options", schema: artDirectionSchema, strict: false } });
    assert.equal(requestBody.store, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ARK_API_KEY; else process.env.ARK_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.ARK_BASE_URL; else process.env.ARK_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.ARK_DOUBAO_TURBO_MODEL; else process.env.ARK_DOUBAO_TURBO_MODEL = originalModel;
  }
});

test("Coding Plan 不使用 Tool Call 模拟原生结构化输出", { concurrency: false }, async () => {
  await assert.rejects(
    () => generateText("提取风格", "doubao-seed-2.1-turbo", [], [], "system", { outputSchema: artDirectionSchema, outputSchemaName: "art_direction_options" }),
    /不支持原生 JSON Schema 输出，请使用 Ark Responses/,
  );
});
