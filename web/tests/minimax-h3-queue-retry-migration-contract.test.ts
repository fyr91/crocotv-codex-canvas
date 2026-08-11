import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
    "../../supabase/migrations/20260805083613_allow_minimax_h3_video_retry_queue.sql",
    import.meta.url,
);

assert.equal(existsSync(migrationUrl), true, "the MiniMax H3 retry queue migration must exist");

const sql = readFileSync(migrationUrl, "utf8");

assert.match(sql, /create or replace function public\.rate_limit_video_submission/i);
assert.match(
    sql,
    /provider_id not in \('ark', 'ltx', 'happyhorse', 'minimax_h3'\)/i,
    "all video providers must be accepted by the shared retry queue function",
);
assert.match(
    sql,
    /grant execute on function public\.rate_limit_video_submission\([\s\S]*?\) to service_role/i,
    "the internal retry queue function must remain callable by the service role",
);

console.log("MiniMax H3 retry queue migration contract test passed");
