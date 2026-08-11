import { describe, expect, it, vi } from "vitest";

import type { ContentNode, ContentStorylineCandidate } from "@/types/content-production";
import {
    contentStorylineSnapshot,
    createOptimisticStorylineNode,
    createStorylineSaveQueue,
    mergeOptimisticStorylineNode,
    runOptimisticStorylineStart,
    storylineCandidatePatch,
    validateContentStorylineCandidate,
} from "./storyline";

export const validCandidate: ContentStorylineCandidate = {
    format: "crocotv.storyline",
    version: 2,
    positioning: {
        core_narrative_anchor: "同一杯咖啡因为杯色产生相反判断。",
        emotional_value: "拆穿误区",
        emotional_curve: ["好奇", "紧张", "震惊", "爽快"],
        opening_visual_beats: [
            { order: 1, visual_concept: "顾客吞下一勺咖啡粉后立刻皱眉。", narrative_function: "抛出苦味误区。" },
            { order: 2, visual_concept: "同壶咖啡倒进黑杯与透明杯。", narrative_function: "制造视觉反差。" },
        ],
    },
    five_act: {
        setup: { conflict: "顾客坚持越苦越提神。", character_action: "店员摆出同壶咖啡。", suspense: "同一咖啡为何判断相反？" },
        escalation: {
            layers: [
                { order: 1, pressure: "顾客第一次判断错误。", character_action: "店员交换杯位。", consequence: "判断再次反转。" },
                { order: 2, pressure: "围观者质疑换咖啡。", character_action: "店员同步倒入两杯。", consequence: "所有人仍给出相反答案。" },
            ],
            loss_of_control_point: "现场争论哪杯咖啡因更高。",
        },
        reveal: { truth_or_solution: "两杯咖啡因相同。", unexpected_but_inevitable: "始终来自同一壶。", anchor_connection: "杯色改变苦味预期。" },
        payoff: { direct_result: "顾客不再看苦味判断。", emotional_release: "众人恍然大悟。", audience_value: "学会查看豆种与萃取量。" },
        cta_bridge: { transition: "还有哪些咖啡常识是错的？", target_action: "评论并保存", motivation: "下一期继续双盲验证。" },
    },
};

const node = (overrides: Partial<ContentNode> = {}): ContentNode => ({
    id: "story-1",
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: "angle-1",
    nodeType: "storyline",
    title: "故事线",
    summary: "",
    sortOrder: 0,
    data: {
        clientRequestId: "request-1",
        storylineWorkflow: {
            operation: "generate",
            phase: "accepted",
            round: 1,
            runId: "run-1",
            sourceNodeId: "angle-1",
            upstreamAngleNodeId: "angle-1",
            parentInteractionId: "topic-interaction",
            latestGeminiInteractionId: "story-interaction",
            optimizationDirection: null,
            candidate: validCandidate,
            review: null,
            lastError: null,
        },
    },
    status: "succeeded",
    revision: 1,
    createdBy: "owner-1",
    hiddenAt: null,
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
    ...overrides,
});

describe("Storyline V2 state", () => {
    it("parses the aligned Storyline snapshot", () => {
        expect(contentStorylineSnapshot(node())).toMatchObject({
            operation: "generate",
            phase: "accepted",
            runId: "run-1",
            latestGeminiInteractionId: "story-interaction",
            candidate: { format: "crocotv.storyline", version: 2 },
        });
    });

    it("reports missing opening beats and escalation layers", () => {
        const invalid = {
            ...validCandidate,
            positioning: { ...validCandidate.positioning, opening_visual_beats: validCandidate.positioning.opening_visual_beats.slice(0, 1) },
            five_act: {
                ...validCandidate.five_act,
                escalation: { ...validCandidate.five_act.escalation, layers: validCandidate.five_act.escalation.layers.slice(0, 1) },
            },
        };
        expect(validateContentStorylineCandidate(invalid)).toEqual([
            "前三秒至少需要 2 个视觉节拍",
            "Escalation 至少需要 2 层压力加码",
        ]);
    });

    it("creates optimize as a child and rebuild on the same node", () => {
        expect(createOptimisticStorylineNode({
            operation: "optimize",
            sourceNode: node(),
            requestId: "optimize-1",
            createdAt: "2026-07-28T01:00:00Z",
            direction: "增强 Reveal",
        })).toMatchObject({
            id: "optimistic-storyline:optimize-1",
            parentId: "story-1",
            status: "running",
            data: {
                clientRequestId: "optimize-1",
                storylineWorkflow: {
                    operation: "optimize",
                    phase: "producer_running",
                    optimizationDirection: "增强 Reveal",
                },
            },
        });
        expect(createOptimisticStorylineNode({
            operation: "rebuild",
            sourceNode: node(),
            requestId: "rebuild-1",
            createdAt: "2026-07-28T01:00:00Z",
        })).toMatchObject({
            id: "story-1",
            parentId: "angle-1",
            data: {
                clientRequestId: "rebuild-1",
                storylineWorkflow: {
                    operation: "rebuild",
                    parentInteractionId: null,
                    candidate: null,
                },
            },
        });
    });

    it("publishes a connected generating node before saving and starting the Edge Function", async () => {
        const source = node({ id: "angle-1", nodeType: "angle", parentId: "root-1", data: {
            topicFactory: {
                batchId: "batch-1",
                laneNumber: 1,
                strategy: "反常识切入",
                phase: "accepted",
                round: 1,
                runId: "topic-run-1",
                latestGeminiInteractionId: "topic-interaction",
                candidate: { title: "选题" },
                review: null,
                sourceReferences: [],
                lastError: null,
            },
        } });
        const optimistic = createOptimisticStorylineNode({
            operation: "generate",
            sourceNode: source,
            requestId: "generate-1",
            createdAt: "2026-07-28T01:00:00Z",
        });
        const events: string[] = [];

        await runOptimisticStorylineStart({
            node: optimistic,
            publish: () => events.push("publish"),
            prepare: async () => {
                events.push("save");
                return source;
            },
            start: async () => {
                events.push("edge");
                return "started";
            },
        });

        expect(optimistic).toMatchObject({
            parentId: "angle-1",
            nodeType: "storyline",
            status: "running",
        });
        expect(events).toEqual(["publish", "save", "edge"]);
    });

    it("keeps the optimistic storyline as a failed node when startup fails", async () => {
        const optimistic = createOptimisticStorylineNode({
            operation: "optimize",
            sourceNode: node(),
            requestId: "failed-1",
            createdAt: "2026-07-28T01:00:00Z",
            direction: "增强冲突",
        });
        const published: ContentNode[] = [];

        await expect(runOptimisticStorylineStart({
            node: optimistic,
            publish: (next) => published.push(next),
            prepare: async () => node(),
            start: async () => {
                throw new Error("Edge Function 无法访问");
            },
        })).rejects.toThrow("Edge Function 无法访问");

        expect(published.at(-1)).toMatchObject({
            id: "optimistic-storyline:failed-1",
            status: "failed",
            noticeKind: "failure",
            noticeUnread: true,
            data: {
                storylineWorkflow: {
                    phase: "failed",
                    lastError: "Edge Function 无法访问",
                },
            },
        });
    });

    it("keeps a failed local-only node during retry and removes the retry when its server node arrives", async () => {
        const failedRequestId = "10000000-0000-4000-8000-000000000001";
        const retryRequestId = "20000000-0000-4000-8000-000000000002";
        const failedPublished: ContentNode[] = [];
        const failed = createOptimisticStorylineNode({
            operation: "optimize",
            sourceNode: node(),
            requestId: failedRequestId,
            createdAt: "2026-07-29T01:00:00Z",
            direction: "增强冲突",
        });
        await expect(runOptimisticStorylineStart({
            node: failed,
            publish: (next) => failedPublished.push(next),
            prepare: async () => node(),
            start: async () => {
                throw new Error("clientRequestId 无效");
            },
        })).rejects.toThrow("clientRequestId 无效");

        const retry = createOptimisticStorylineNode({
            operation: "optimize",
            sourceNode: node(),
            requestId: retryRequestId,
            createdAt: "2026-07-29T01:01:00Z",
            direction: "增强冲突",
        });
        const duringRetry = mergeOptimisticStorylineNode([failedPublished.at(-1)!], retry);
        expect(duringRetry.map((item) => item.data.clientRequestId)).toEqual([failedRequestId, retryRequestId]);

        const serverRetry = { ...retry, id: "storyline-retry-server", data: { ...retry.data, runId: "run-retry-server" } };
        const afterServerArrival = mergeOptimisticStorylineNode([failedPublished.at(-1)!, serverRetry], retry);
        expect(afterServerArrival.map((item) => item.id)).toEqual([
            `optimistic-storyline:${failedRequestId}`,
            "storyline-retry-server",
        ]);
    });

    it("replaces the rebuilt node and hides its descendants optimistically", () => {
        const source = node();
        const descendant = node({
            id: "shot-1",
            parentId: source.id,
            nodeType: "shot",
            data: {},
        });
        const optimistic = createOptimisticStorylineNode({
            operation: "rebuild",
            sourceNode: source,
            requestId: "rebuild-1",
            createdAt: "2026-07-28T01:00:00Z",
        });

        const merged = mergeOptimisticStorylineNode([source, descendant], optimistic);

        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({
            id: source.id,
            status: "running",
            data: { clientRequestId: "rebuild-1" },
        });
    });

    it("serializes saves and flushes the newest candidate", async () => {
        const commits: string[] = [];
        const save = vi.fn(async (candidate: ContentStorylineCandidate) => {
            await Promise.resolve();
            commits.push(candidate.positioning.core_narrative_anchor);
        });
        const queue = createStorylineSaveQueue(save);
        queue.enqueue(validCandidate);
        queue.enqueue({
            ...validCandidate,
            positioning: { ...validCandidate.positioning, core_narrative_anchor: "最终编辑版本" },
        });

        await queue.flush();

        expect(commits).toEqual(["同一杯咖啡因为杯色产生相反判断。", "最终编辑版本"]);
    });

    it("stores an edited candidate without discarding workflow lineage", () => {
        const patch = storylineCandidatePatch(node(), {
            ...validCandidate,
            positioning: { ...validCandidate.positioning, core_narrative_anchor: "手动编辑后的核心爆点" },
        });

        expect(patch.title).toBe("手动编辑后的核心爆点");
        expect(patch.summary).toBe("手动编辑后的核心爆点");
        expect(patch.data.storylineWorkflow).toMatchObject({
            runId: "run-1",
            latestGeminiInteractionId: "story-interaction",
            candidate: {
                positioning: { core_narrative_anchor: "手动编辑后的核心爆点" },
            },
        });
    });
});
