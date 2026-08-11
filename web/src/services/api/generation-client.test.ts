import assert from "node:assert/strict";
import { FunctionsFetchError } from "@supabase/supabase-js";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({
    invokes: [] as Array<Record<string, unknown>>,
    invokeResults: [] as Array<{ data: unknown; error: unknown }>,
    recoveredJobs: [] as Array<Record<string, unknown> | null>,
}));

vi.mock("@/lib/supabase/client", () => ({
    supabase: {
        functions: {
            invoke: async (_name: string, options: Record<string, unknown>) => {
                state.invokes.push(options);
                return state.invokeResults.shift();
            },
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: state.recoveredJobs.shift() || null, error: null }),
                    }),
                }),
            }),
        }),
    },
}));

vi.mock("@/stores/use-config-store", () => ({
    decodeChannelModel: () => ({ channelId: "gemini-model-id" }),
}));

import { requestTextGeneration } from "./generation-client.ts";

beforeEach(() => {
    state.invokes.length = 0;
    state.invokeResults.length = 0;
    state.recoveredJobs.length = 0;
});

test("LLM generation recovers a job created before the Edge Function response was lost", async () => {
    state.invokeResults.push({ data: null, error: new FunctionsFetchError(new TypeError("network lost")) });
    state.recoveredJobs.push({ id: "job-1", status: "succeeded", output_text: "已找回结果" });

    const output = await requestTextGeneration({ model: "gemini", prompt: "测试" });

    assert.equal(output, "已找回结果");
    assert.equal(state.invokes.length, 1);
    const body = state.invokes[0].body as Record<string, unknown>;
    assert.match(String(body.clientRequestId), /^[0-9a-f-]{36}$/);
});

test("LLM generation safely retries with the same idempotency key when no job was created", async () => {
    state.invokeResults.push(
        { data: null, error: new FunctionsFetchError(new TypeError("network lost")) },
        { data: { job: { id: "job-2", status: "succeeded", output_text: "重试结果" } }, error: null },
    );
    state.recoveredJobs.push(null);

    const output = await requestTextGeneration({ model: "gemini", prompt: "测试" });

    assert.equal(output, "重试结果");
    assert.equal(state.invokes.length, 2);
    const requestIds = state.invokes.map((options) => String((options.body as Record<string, unknown>).clientRequestId));
    assert.equal(new Set(requestIds).size, 1);
});
