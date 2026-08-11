import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../supabase/migrations/20260716043441_image_size_presets.sql", import.meta.url), "utf8");

test("Seedream image models receive their supported resolutions", () => {
    assert.match(sql, /doubao-seedream-4-5-251128/);
    assert.match(sql, /doubao-seedream-5-0-260128/);
    assert.match(sql, /"2K"/);
    assert.match(sql, /"3K"/);
    assert.match(sql, /"4K"/);
    assert.match(sql, /imageSizePresets/);
});
