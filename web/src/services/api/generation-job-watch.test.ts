import { beforeEach, describe, expect, test, vi } from "vitest";

const realtime = vi.hoisted(() => {
    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    return { channel, createChannel: vi.fn(() => channel), removeChannel: vi.fn() };
});

vi.mock("@/lib/supabase/client", () => ({
    supabase: { channel: realtime.createChannel, removeChannel: realtime.removeChannel },
}));

import {
    mergeGenerationJobUpdate,
    nextReasoningSnapshot,
    watchGenerationJobs,
} from "./generation-job-watch.ts";

beforeEach(() => {
    realtime.createChannel.mockClear();
    realtime.removeChannel.mockClear();
    realtime.channel.on.mockClear();
    realtime.channel.subscribe.mockClear();
});

describe("reasoning snapshots", () => {
    test("returns only changed cumulative reasoning snapshots", () => {
        expect(nextReasoningSnapshot("", { id: "1", status: "running", reasoning_text: "分析" })).toBe("分析");
        expect(nextReasoningSnapshot("分析", { id: "1", status: "running", reasoning_text: "分析" })).toBeNull();
        expect(nextReasoningSnapshot("分析", { id: "1", status: "running", reasoning_text: "分析完成" })).toBe("分析完成");
    });

    test("clears partial reasoning when a job fails", () => {
        expect(nextReasoningSnapshot("分析", { id: "1", status: "failed", reasoning_text: null })).toBe("");
    });
});

describe("generation job cache updates", () => {
    const runningJob = { id: "job-1", status: "running" as const, reasoning_text: "分析中" };
    const allowedIds = new Set(["job-1", "job-2"]);

    test("updates only the matching allowed job", () => {
        const current = [
            { id: "job-1", status: "running" as const, reasoning_text: "分析" },
            { id: "job-2", status: "queued" as const },
        ];
        const result = mergeGenerationJobUpdate(current, runningJob, allowedIds);

        expect(result).toEqual([runningJob, current[1]]);
        expect(result).not.toBe(current);
        expect(result?.[1]).toBe(current[1]);
    });

    test("preserves the cache reference for unrelated or unchanged updates", () => {
        const current = [runningJob];

        expect(mergeGenerationJobUpdate(current, { ...runningJob }, allowedIds)).toBe(current);
        expect(mergeGenerationJobUpdate(current, { id: "other", status: "running" }, allowedIds)).toBe(current);
    });

    test("appends an allowed job missing from the initial response", () => {
        expect(mergeGenerationJobUpdate([], { id: "job-2", status: "queued" }, allowedIds)).toEqual([
            { id: "job-2", status: "queued" },
        ]);
    });
});

test("subscribes to the requested jobs and cleans up once", () => {
    const onUpdate = vi.fn();
    const stop = watchGenerationJobs(["job-2", "job-1", "job-1"], onUpdate);

    expect(realtime.channel.on).toHaveBeenCalledWith(
        "postgres_changes",
        {
            event: "UPDATE",
            schema: "public",
            table: "generation_jobs",
            filter: "id=in.(job-1,job-2)",
        },
        expect.any(Function),
    );
    const handler = realtime.channel.on.mock.calls[0]?.[2] as (payload: { new: Record<string, unknown> }) => void;
    handler({ new: { id: "job-1", status: "running", reasoning_text: "逐条更新", private_field: "ignore" } });
    expect(onUpdate).toHaveBeenCalledWith({ id: "job-1", status: "running", reasoning_text: "逐条更新" });

    stop();
    stop();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
});
