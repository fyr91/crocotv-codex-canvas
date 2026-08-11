import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const generate = read("../../supabase/functions/generate/index.ts");
const dispatch = read("../../supabase/functions/dispatch-video-generations/index.ts");
const admin = read("../../supabase/functions/admin-providers/index.ts");

assert.doesNotMatch(generate, /getLtxCapabilities/);
assert.doesNotMatch(dispatch, /getLtxCapabilities/);
assert.match(generate, /readLtxCapabilities/);
assert.match(dispatch, /readLtxCapabilities/);
assert.match(admin, /sync-ltx-capabilities/);
assert.match(admin, /getLtxCapabilities/);

console.log("ltx fixed capabilities contract tests passed");
