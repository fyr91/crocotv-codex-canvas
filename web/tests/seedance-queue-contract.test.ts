import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../supabase/migrations/20260715114439_seedance_fifo_dispatch.sql", import.meta.url), "utf8");

assert.match(migration, /alter column provider_task_id drop not null/i);
assert.match(migration, /add column phase text not null default 'poll'/i);
assert.match(migration, /add column submission_started_at timestamptz/i);
assert.match(migration, /create table public\.provider_queue_state/i);
assert.match(migration, /alter table public\.provider_queue_state enable row level security/i);
assert.match(migration, /create or replace function public\.claim_seedance_submission_task/i);
assert.match(migration, /order by j\.created_at, t\.id/i);
assert.match(migration, /for update of t skip locked/i);
assert.match(migration, /create or replace function public\.complete_seedance_submission/i);
assert.match(migration, /create or replace function public\.rate_limit_seedance_submission/i);
assert.match(migration, /t\.phase = 'poll'/i);
assert.match(migration, /t\.provider_task_id is not null/i);
assert.match(migration, /'crocotv-dispatch-video-generations'/i);
assert.match(migration, /'10 seconds'/i);
assert.match(migration, /timeout_milliseconds := 120000/i);

const generate = readFileSync(new URL("../../supabase/functions/generate/index.ts", import.meta.url), "utf8");
const dispatchUrl = new URL("../../supabase/functions/dispatch-video-generations/index.ts", import.meta.url);
const config = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
assert.match(generate, /phase: "submit"/);
assert.match(generate, /provider_task_id: null/);
assert.doesNotMatch(generate, /createArkVideoTask/);
assert.ok(existsSync(dispatchUrl), "dispatch-video-generations Edge Function exists");
const dispatch = readFileSync(dispatchUrl, "utf8");
assert.match(dispatch, /claim_seedance_submission_task/);
assert.match(dispatch, /AbortSignal\.timeout\(20_000\)/);
assert.match(dispatch, /error instanceof ProviderHttpError && error\.status === 429/);
assert.match(dispatch, /rate_limit_seedance_submission/);
assert.match(dispatch, /failJob/);
assert.match(config, /\[functions\.dispatch-video-generations\]/);

const poller = readFileSync(new URL("../../supabase/functions/poll-generations/index.ts", import.meta.url), "utf8");
const ark = readFileSync(new URL("../../supabase/functions/_shared/providers/ark.ts", import.meta.url), "utf8");
const cancelUrl = new URL("../../supabase/functions/cancel-generation/index.ts", import.meta.url);
assert.match(poller, /batch_size: 3/);
assert.match(poller, /getArkVideoTask\([^\n]+AbortSignal\.timeout\(12_000\)\)/);
assert.match(ark, /export async function getArkVideoTaskStatus/);
assert.match(ark, /export async function deleteArkVideoTask/);
assert.ok(existsSync(cancelUrl), "cancel-generation Edge Function exists");
const cancel = readFileSync(cancelUrl, "utf8");
assert.match(cancel, /job\.user_id !== profile\.id/);
assert.match(cancel, /submission_started_at/);
assert.match(cancel, /getArkVideoTaskStatus/);
assert.match(cancel, /deleteArkVideoTask/);
assert.match(cancel, /运行中的视频任务无法取消/);
assert.match(config, /\[functions\.cancel-generation\]/);

console.log("seedance queue contract tests passed");
