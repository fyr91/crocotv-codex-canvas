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
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "positive_prompt", "negative_prompt"],
        properties: {
          name: { type: "string", minLength: 1 },
          positive_prompt: { type: "string", minLength: 1 },
          negative_prompt: { type: "string", minLength: 1 },
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

test("Doubao 风格分析通过强制工具调用应用 JSON Schema", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.CODING_PLAN_API_KEY;
  let requestBody: any;
  const structuredResult = {
    options: [
      { name: "风格一", positive_prompt: "正向一", negative_prompt: "负向一" },
      { name: "风格二", positive_prompt: "正向二", negative_prompt: "负向二" },
      { name: "风格三", positive_prompt: "正向三", negative_prompt: "负向三" },
    ],
  };
  process.env.CODING_PLAN_API_KEY = "test-key";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "art_direction_options", input: structuredResult }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const text = await generateText("提取风格", "doubao-seed-2.1-turbo", [], [], "system", {
      outputSchema: artDirectionSchema,
      outputSchemaName: "art_direction_options",
    });
    assert.deepEqual(JSON.parse(text), structuredResult);
    assert.equal(requestBody.model, "doubao-seed-2.1-turbo");
    assert.deepEqual(requestBody.tools, [{
      name: "art_direction_options",
      description: "Return the final structured result. Do not emit prose.",
      input_schema: artDirectionSchema,
    }]);
    assert.deepEqual(requestBody.tool_choice, { type: "tool", name: "art_direction_options" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CODING_PLAN_API_KEY;
    else process.env.CODING_PLAN_API_KEY = originalKey;
  }
});

test("Schema 模式不接受 Coding Plan 的普通文本回退", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.CODING_PLAN_API_KEY;
  process.env.CODING_PLAN_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: "```json\n{}\n```" }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    await assert.rejects(
      () => generateText("提取风格", "doubao-seed-2.1-turbo", [], [], "system", { outputSchema: artDirectionSchema, outputSchemaName: "art_direction_options" }),
      /没有返回符合 Schema 的结构化结果/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CODING_PLAN_API_KEY;
    else process.env.CODING_PLAN_API_KEY = originalKey;
  }
});
