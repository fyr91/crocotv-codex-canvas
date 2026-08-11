import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generate = readFileSync(new URL("../../supabase/functions/generate/index.ts", import.meta.url), "utf8");
const bigmodel = readFileSync(new URL("../../supabase/functions/_shared/providers/bigmodel.ts", import.meta.url), "utf8");
const gemini = readFileSync(new URL("../../supabase/functions/_shared/providers/gemini.ts", import.meta.url), "utf8");

test("backend validates model input modalities before calling a provider", () => {
    assert.match(generate, /validateLlmInputModalities/);
    assert.match(generate, /inputModalities/);
    assert.match(generate, /body\.capability === "llm" \? AbortSignal\.timeout\(300_000\)/);
});

test("GLM sends image and video content parts with JSON object output", () => {
    assert.match(bigmodel, /type: "image_url"/);
    assert.match(bigmodel, /type: "video_url"/);
    assert.match(bigmodel, /response_format/);
});

test("Gemini uploads media files, requests structured output, and deletes temporary files", () => {
    assert.match(gemini, /X-Goog-Upload-Protocol/);
    assert.match(gemini, /responseMimeType: "application\/json"/);
    assert.match(gemini, /responseJsonSchema: schema/);
    assert.doesNotMatch(gemini, /responseFormat:/);
    assert.match(gemini, /fileData/);
    assert.match(gemini, /method: "DELETE"/);
});
