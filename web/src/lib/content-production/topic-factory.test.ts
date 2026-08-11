import { describe, expect, it } from "vitest";

import {
    canExpandTopicAngle,
    contentTopicFactorySnapshot,
    createOptimisticTopicFactoryNodes,
    topicFactorySummary,
} from "./topic-factory";
import type { ContentNode, ContentTopicFactorySnapshot } from "@/types/content-production";

const candidate = {
    title: "可进入故事线的选题",
    core_hook: "质量提示不会阻断后续制作",
    target_audience: { segment: "创作者", need_or_anxiety: "需要稳定产出" },
    specific_situation: "第三轮审核后",
    core_conflict: "分数与可用性不同",
    twist_or_gap: "警告不等于阻断",
    payoff: { type: "practical" as const, description: "继续制作" },
    share_motivation: "值得分享",
    story_promise: "形成完整故事",
    evidence_requirements: [],
    tags: ["工作流"],
};

function snapshot(phase: ContentTopicFactorySnapshot["phase"]): ContentTopicFactorySnapshot {
    return {
        batchId: "batch-1",
        laneNumber: 1,
        laneStrategy: "具体痛点",
        phase,
        reviewCycle: 3,
        runId: "run-1",
        latestGeminiInteractionId: "interaction-1",
        candidate,
        citations: [{ text: "已核验文本", url: "https://example.com/source" }],
        review: null,
        score: 82,
        warning: phase === "ready_warning" ? "仍有质量提示" : null,
        error: null,
    };
}

function node(phase: ContentTopicFactorySnapshot["phase"]): ContentNode {
    return {
        id: "node-1",
        topicId: "topic-1",
        attemptId: "attempt-1",
        parentId: "root-1",
        nodeType: "angle",
        title: candidate.title,
        summary: candidate.core_hook,
        sortOrder: 1,
        data: { topicFactory: { version: 2, ...snapshot(phase) } },
        status: ["ready_pass", "ready_warning"].includes(phase) ? "succeeded" : "running",
        revision: 1,
        createdBy: "user-1",
        hiddenAt: null,
        createdAt: "2026-07-29T00:00:00Z",
        updatedAt: "2026-07-29T00:00:00Z",
    };
}

describe("Topic Factory v2 projection", () => {
    it("reads only the v2 projection and cumulative citations", () => {
        expect(contentTopicFactorySnapshot(node("ready_warning"))).toEqual(snapshot("ready_warning"));
        const legacy = node("ready_pass");
        delete (legacy.data.topicFactory as Record<string, unknown>).version;
        expect(contentTopicFactorySnapshot(legacy)).toBeNull();
    });

    it("allows Storyline from both final quality states", () => {
        expect(canExpandTopicAngle(node("ready_pass"))).toBe(true);
        expect(canExpandTopicAngle(node("ready_warning"))).toBe(true);
    });

    it("summarizes independent v2 lanes", () => {
        expect(topicFactorySummary([
            snapshot("ready_pass"),
            snapshot("ready_warning"),
            snapshot("reviewing"),
            snapshot("revising"),
            snapshot("humanizing"),
        ])).toEqual({
            readyPass: 1,
            readyWarning: 1,
            reviewing: 1,
            generating: 0,
            revising: 1,
            humanizing: 1,
            failed: 0,
        });
    });

    it("creates five optimistic v2 nodes", () => {
        const nodes = createOptimisticTopicFactoryNodes({
            topicId: "topic-1",
            attemptId: "attempt-1",
            rootNodeId: "root-1",
            createdBy: "user-1",
            batchId: "request-1",
            createdAt: "2026-07-29T00:00:00Z",
        });
        expect(nodes).toHaveLength(5);
        expect(nodes.every((item) => (item.data.topicFactory as Record<string, unknown>)?.phase === "queued")).toBe(true);
        expect(nodes.every((item) => (item.data.topicFactory as Record<string, unknown>)?.version === 2)).toBe(true);
    });
});
