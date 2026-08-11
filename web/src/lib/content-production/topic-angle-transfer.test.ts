import { describe, expect, it } from "vitest";

import {
    parseTopicAngleTransfer,
    serializeTopicAngleTransfer,
    topicAngleCandidatePatch,
} from "./topic-angle-transfer";
import type { ContentNode, ContentTopicFactoryCandidate } from "@/types/content-production";

const candidate: ContentTopicFactoryCandidate = {
    title: "别再追求完美计划",
    core_hook: "计划越精细，越可能拖延行动",
    target_audience: { segment: "年轻职场人", need_or_anxiety: "害怕开始" },
    specific_situation: "周日晚上制定下周计划",
    core_conflict: "控制感与行动力冲突",
    twist_or_gap: "计划本身成为逃避",
    payoff: { type: "practical", description: "得到三步启动法" },
    share_motivation: "转发给总在做计划的朋友",
    story_promise: "看完能立即开始第一步",
    evidence_requirements: [{ claim: "过度计划会拖延", evidence_type: "研究", priority: "required" }],
    tags: ["职场", "拖延"],
};

const citations = [
    { text: "完整事实 A", url: "https://example.com/a" },
    { text: "完整事实 A", url: "https://example.com/b" },
];

const node: ContentNode = {
    id: "angle-1",
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: "orientation-1",
    nodeType: "angle",
    title: "旧标题",
    summary: "旧摘要",
    sortOrder: 1,
    status: "succeeded",
    revision: 1,
    createdBy: "user-1",
    hiddenAt: null,
    createdAt: "2026-07-27T00:00:00Z",
    updatedAt: "2026-07-27T00:00:00Z",
    data: {
        topicFactory: {
            version: 2,
            batchId: "batch-1",
            laneNumber: 1,
            laneStrategy: "反常识切入",
            phase: "ready_pass",
            reviewCycle: 1,
            runId: "run-1",
            latestGeminiInteractionId: "interaction-1",
            candidate,
            citations,
            review: null,
            score: null,
            warning: null,
            error: null,
        },
    },
};

describe("topic angle JSON transfer", () => {
    it("round-trips the portable branch without internal node metadata", () => {
        const transfer = {
            format: "crocotv.topic-angle" as const,
            version: 2 as const,
            candidate,
            citations,
            verification: null,
        };
        const text = serializeTopicAngleTransfer(transfer);

        expect(JSON.parse(text)).toEqual(transfer);
        expect(text).not.toContain("differentiation");
        expect(text).not.toContain("sourceReferences");
        expect(text).not.toContain("run-1");
        expect(parseTopicAngleTransfer(text)).toEqual(transfer);
    });

    it("rejects malformed branches and invalid citations", () => {
        expect(() => parseTopicAngleTransfer("{}")).toThrow("format");
        for (const invalidCitations of [
            undefined,
            [{ text: "", url: "https://example.com/source" }],
            [{ text: "事实", url: "javascript:alert(1)" }],
        ]) {
            expect(() => parseTopicAngleTransfer(JSON.stringify({
                format: "crocotv.topic-angle",
                version: 2,
                candidate,
                citations: invalidCitations,
                verification: null,
            }))).toThrow("citations");
        }
        expect(() => parseTopicAngleTransfer(JSON.stringify({
            format: "crocotv.topic-angle",
            version: 2,
            candidate,
            citations: [{ text: "事实", url: "" }],
            verification: null,
        }))).toThrow("citations");
    });

    it("builds a node patch while preserving workflow state and cumulative citations", () => {
        const imported = { ...candidate, title: "外部优化标题", core_hook: "外部优化后的核心爆点" };
        const patch = topicAngleCandidatePatch(node, {
            format: "crocotv.topic-angle",
            version: 2,
            candidate: imported,
            citations,
            verification: null,
        });

        expect(patch.title).toBe("外部优化标题");
        expect(patch.summary).toBe("外部优化后的核心爆点");
        expect(patch.data.topicFactory).toEqual({
            ...node.data.topicFactory as object,
            candidate: imported,
            citations,
        });
    });
});
