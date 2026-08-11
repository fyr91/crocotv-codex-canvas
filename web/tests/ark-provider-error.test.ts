import assert from "node:assert/strict";

import { ProviderHttpError, providerHttpError } from "../../supabase/functions/_shared/providers/types.ts";

const limited = await providerHttpError(new Response('{"error":{"message":"请求过快"}}', {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "120" },
}), "视频任务创建失败");
assert.ok(limited instanceof ProviderHttpError);
assert.equal(limited.message, "请求过快");
assert.equal(limited.status, 429);
assert.equal(limited.retryAfterSeconds, 120);

const retryAt = new Date(Date.now() + 120_000).toUTCString();
const dated = await providerHttpError(new Response("busy", { status: 429, headers: { "Retry-After": retryAt } }), "视频任务创建失败");
assert.ok(Number(dated.retryAfterSeconds) >= 118 && Number(dated.retryAfterSeconds) <= 120);

const serverError = await providerHttpError(new Response("upstream failed", { status: 500 }), "视频任务创建失败");
assert.equal(serverError.status, 500);
assert.equal(serverError.retryAfterSeconds, null);

console.log("ark provider error tests passed");
