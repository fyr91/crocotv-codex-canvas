import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL("../../supabase/migrations/20260726000000_copy_canvas_assets.sql", import.meta.url);

assert.equal(existsSync(migrationUrl), true, "copy-canvas asset migration must exist");
const sql = readFileSync(migrationUrl, "utf8");

assert.match(sql, /create or replace function public\.copy_canvas_project/);
assert.match(sql, /security definer/);
assert.match(sql, /private\.is_active_user\(\)/);
assert.match(sql, /private\.is_superuser\(\)/);
assert.match(sql, /create table public\.asset_access_grants/);
assert.match(sql, /insert into public\.asset_access_grants/);
assert.match(sql, /position\(assets\.id::text in source_project\.document::text\) > 0/);
assert.match(sql, /insert into public\.canvas_projects/);
assert.doesNotMatch(sql, /insert into public\.assets/);
assert.doesNotMatch(sql, /storage_path/);
assert.match(sql, /revoke all on function public\.copy_canvas_project\(uuid, uuid\) from public, anon, authenticated/);
assert.match(sql, /grant execute on function public\.copy_canvas_project\(uuid, uuid\) to authenticated/);

console.log("copy canvas assets migration test passed");
