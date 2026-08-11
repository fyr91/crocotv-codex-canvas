import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL("../../supabase/migrations/20260715210000_shared_assets.sql", import.meta.url);
assert.ok(existsSync(migrationUrl), "shared assets migration is missing");

const sql = readFileSync(migrationUrl, "utf8");
const api = readFileSync(new URL("../src/services/api/cloud-assets.ts", import.meta.url), "utf8");

assert.match(sql, /add column shared_at timestamptz/);
assert.match(sql, /where shared_at is not null and deleted_at is null/);
assert.match(api, /export async function listSharedCloudAssets/);
assert.match(api, /\.not\("shared_at", "is", null\)\.is\("deleted_at", null\)/);
assert.match(api, /export async function setCloudAssetShared/);
assert.match(api, /eq\("user_id", user\.user\.id\)/);

console.log("shared assets cloud contract tests passed");
