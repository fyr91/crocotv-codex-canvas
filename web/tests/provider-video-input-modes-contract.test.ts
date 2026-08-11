import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/admin/providers/index.tsx", import.meta.url), "utf8");
const edge = readFileSync(new URL("../../supabase/functions/admin-providers/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260717061623_video_input_modes.sql", import.meta.url), "utf8");

test("Superuser configures supported video input modes separately from JSON", () => {
    assert.match(page, /支持的视频输入模式/);
    assert.match(page, /videoInputModes/);
    assert.match(page, /videoInputModeOptions/);
    assert.match(page, /values\.capability === "video"/);
});

test("admin provider endpoint validates video input modes", () => {
    assert.match(edge, /capability === "video"/);
    assert.match(edge, /videoInputModes/);
    assert.match(edge, /firstFrame/);
    assert.match(edge, /firstLastFrame/);
    assert.match(edge, /multimodal/);
});

test("existing Seedance 2.0 models receive all three video modes", () => {
    assert.match(migration, /doubao-seedance-2-0-260128/);
    assert.match(migration, /doubao-seedance-2-0-fast-260128/);
    assert.match(migration, /firstFrame/);
    assert.match(migration, /firstLastFrame/);
    assert.match(migration, /multimodal/);
});
