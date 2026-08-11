import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
    contentGenerationJobsPollingInterval,
    contentInvalidationKeys,
    contentQueryKeys,
} from "./use-content-production";

describe("content production query keys", () => {
    it("targets only affected caches for realtime changes", () => {
        expect(contentInvalidationKeys("content_topics", { new: { id: "topic-1", owner_id: "user-1" } })).toEqual([
            contentQueryKeys.topics,
            contentQueryKeys.topic("topic-1"),
        ]);
        expect(contentInvalidationKeys("content_nodes", { new: { topic_id: "topic-1", attempt_id: "attempt-1", created_by: "user-1" } })).toEqual([
            contentQueryKeys.nodes("attempt-1"),
            contentQueryKeys.topic("topic-1"),
            contentQueryKeys.noticeNodes("user-1"),
        ]);
    });

    it("uses slow fallback polling only while jobs are active", () => {
        expect(contentGenerationJobsPollingInterval([{ id: "job-1", status: "running" }])).toBe(10_000);
        expect(contentGenerationJobsPollingInterval([{ id: "job-1", status: "queued" }])).toBe(10_000);
        expect(contentGenerationJobsPollingInterval([{ id: "job-1", status: "succeeded" }])).toBe(false);
        expect(contentGenerationJobsPollingInterval()).toBe(false);
    });
});
