import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
    "../../supabase/migrations/20260730091114_preserve_koubo_audio_history.sql",
    import.meta.url,
);

assert.equal(existsSync(migrationUrl), true, "the Koubo audio history preservation migration must exist");
const sql = readFileSync(migrationUrl, "utf8");
const audioAssetBranch = sql.match(/if new\.kind = 'audio' then([\s\S]*?)elsif new\.kind = 'image' then/i)?.[1] || "";

assert.match(audioAssetBranch, /update public\.koubo_audio_nodes/i);
assert.doesNotMatch(
    audioAssetBranch,
    /delete from public\.koubo_audio_nodes/i,
    "finishing a new text-generated audio must not delete existing root audio nodes",
);

console.log("koubo audio history migration contract test passed");
