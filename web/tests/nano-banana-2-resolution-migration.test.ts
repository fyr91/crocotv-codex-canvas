import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../supabase/migrations/20260729180000_nano_banana_2_high_resolutions.sql", import.meta.url), "utf8");

test("Nano Banana 2 receives its official 2K and 4K resolutions", () => {
    assert.match(sql, /'google:4@3'/);
    assert.match(sql, /"2K"/);
    assert.match(sql, /"4K"/);
    assert.match(sql, /"2752x1536"/);
    assert.match(sql, /"5504x3072"/);
    assert.doesNotMatch(sql, /google:nano-banana@2-lite/);
});
