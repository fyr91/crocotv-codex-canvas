import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../supabase/migrations/20260715112323_shared_readonly_canvases.sql", import.meta.url), "utf8");
const softDeleteFix = readFileSync(new URL("../../supabase/migrations/20260715120956_fix_canvas_soft_delete_policy.sql", import.meta.url), "utf8");
const roleVisibility = readFileSync(new URL("../../supabase/migrations/20260715122841_hide_superuser_canvases.sql", import.meta.url), "utf8");
const restrictedVisibility = readFileSync(new URL("../../supabase/migrations/20260717075315_restrict_canvas_visibility.sql", import.meta.url), "utf8");

assert.match(sql, /alter table public\.canvas_projects add column deleted_at timestamptz/);
assert.match(sql, /alter table public\.assets add column deleted_at timestamptz/);
assert.match(sql, /create or replace function public\.list_canvas_projects\(\)/);
assert.match(sql, /create or replace function private\.list_canvas_projects\(\)/);
assert.match(sql, /c\.deleted_at is null/);
assert.match(sql, /revoke delete on public\.assets, public\.canvas_projects from authenticated/);
assert.match(sql, /drop policy if exists "storage_delete_own"/);
assert.match(sql, /create policy "storage_read_internal"/);
assert.match(softDeleteFix, /drop policy if exists "canvas_read_internal"/);
assert.match(softDeleteFix, /create policy "canvas_read_internal"/);
assert.match(softDeleteFix, /deleted_at is null or \(select auth\.uid\(\)\) = user_id/);
assert.match(roleVisibility, /create or replace function private\.list_canvas_projects\(\)/);
assert.match(roleVisibility, /p\.role <> 'superuser' or \(select private\.is_superuser\(\)\)/);
assert.match(roleVisibility, /c\.deleted_at is null/);
assert.match(roleVisibility, /p\.status = 'active'/);
assert.match(restrictedVisibility, /create policy "canvas_read_own_or_superuser"/);
assert.match(restrictedVisibility, /\(select auth\.uid\(\)\) = user_id/);
assert.match(restrictedVisibility, /\(select private\.is_superuser\(\)\)/);
assert.match(restrictedVisibility, /c\.user_id = \(select auth\.uid\(\)\)/);

console.log("shared canvas migration tests passed");
