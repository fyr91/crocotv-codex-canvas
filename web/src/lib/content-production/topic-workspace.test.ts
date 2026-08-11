import { describe, expect, it } from "vitest";

import { summarizeOwnedTopic } from "./topic-workspace";

describe("summarizeOwnedTopic", () => {
    it("aggregates only the selected Topic's active runs and unread node state", () => {
        const summary = summarizeOwnedTopic(
            "topic-1",
            [
                { topicId: "topic-1", status: "producer_running", stage: "storyboard_prompt", updatedAt: "2026-07-24T00:01:00Z" },
                { topicId: "topic-2", status: "failed", stage: "video", updatedAt: "2026-07-24T00:02:00Z" },
            ],
            [
                { topicId: "topic-1", noticeKind: "success", noticeUnread: true, noticeAt: "2026-07-24T00:03:00Z" },
                { topicId: "topic-1", noticeKind: "attention", noticeUnread: false, noticeAt: "2026-07-24T00:04:00Z" },
            ],
        );
        expect(summary).toEqual({
            running: 1,
            unread: 1,
            attention: 0,
            failures: 0,
            latestMessage: "有未查看的生成结果",
            latestAt: "2026-07-24T00:03:00Z",
        });
    });
});
