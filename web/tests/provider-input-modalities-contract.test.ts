import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/admin/providers/index.tsx", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../../supabase/functions/admin-providers/index.ts", import.meta.url), "utf8");

test("superuser can set LLM input modalities without replacing other config", () => {
    assert.match(page, /inputModalities/);
    assert.match(page, /支持解析的输入/);
    assert.match(page, /mode="multiple"/);
    assert.match(page, /\.\.\.config, inputModalities/);
});

test("provider admin validates LLM input modalities", () => {
    assert.match(endpoint, /validateModelConfig/);
    assert.match(endpoint, /文字、图片、视频或音频/);
});
