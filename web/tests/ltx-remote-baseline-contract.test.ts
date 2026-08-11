import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const files = [
    "../../supabase/migrations/20260722075712_add_ltx_video_provider.sql",
    "../../supabase/migrations/20260722084043_fix_video_submission_provider_reference.sql",
    "../../supabase/functions/_shared/providers/ltx.ts",
];

files.forEach((file) => assert.equal(existsSync(new URL(file, import.meta.url)), true, `${file} must exist`));

const generate = readFileSync(new URL("../../supabase/functions/generate/index.ts", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../../supabase/functions/dispatch-video-generations/index.ts", import.meta.url), "utf8");

assert.match(generate, /normalizeLtxGenerationParams/);
assert.match(dispatch, /createLtxJobs/);
assert.match(dispatch, /claim_video_submission_task/);

console.log("ltx remote baseline contract tests passed");
