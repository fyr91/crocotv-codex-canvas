import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../../supabase/functions/_shared/generations.ts", import.meta.url), "utf8");
const imageDispatch = readFileSync(new URL("../../supabase/functions/dispatch-image-generations/index.ts", import.meta.url), "utf8");
const videoDispatch = readFileSync(new URL("../../supabase/functions/dispatch-video-generations/index.ts", import.meta.url), "utf8");
const ltxExecutor = readFileSync(new URL("../../supabase/functions/ltx-executor/index.ts", import.meta.url), "utf8");

assert.match(shared, /export async function loadAccessibleAssets/);
assert.match(shared, /from\("asset_access_grants"\)/);
assert.match(shared, /\(asset\.user_id === userId && !asset\.deleted_at\) \|\| grantedIds\.has\(asset\.id\)/);
assert.match(shared, /const data = await loadAccessibleAssets\(admin, userId, assetIds\)/);
assert.match(imageDispatch, /loadAccessibleAssets\(admin, job\.user_id, inputIds\)/);
assert.match(videoDispatch, /loadAccessibleAssets\(admin, job\.user_id, inputIds\)/);
assert.match(ltxExecutor, /loadAccessibleAssets\(ctx\.supabaseAdmin, job\.user_id, inputIds\)/);

console.log("generation asset access contract test passed");
