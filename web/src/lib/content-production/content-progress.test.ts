import { describe, expect, it } from "vitest";

import type { ContentGenerationRun, ContentNode } from "@/types/content-production";
import { contentProductionSummary } from "./content-progress";

const node = (id: string, phase: string, runId: string, overrides: Partial<ContentNode> = {}): ContentNode => ({
    id,
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: "root-1",
    nodeType: id.startsWith("topic") ? "angle" : "storyline",
    title: id,
    summary: "",
    sortOrder: 0,
    data: id.startsWith("topic")
        ? {
            topicFactory: {
                version: 2,
                batchId: "batch-1",
                laneNumber: 1,
                laneStrategy: "测试策略",
                phase,
                reviewCycle: 1,
                runId,
                latestGeminiInteractionId: null,
                candidate: null,
                citations: [],
                review: null,
                score: null,
                warning: null,
                error: null,
            },
        }
        : { storylineWorkflow: { operation: "generate", phase, round: 1, runId } },
    status: ["accepted", "ready_pass"].includes(phase) ? "succeeded" : ["failed", "error"].includes(phase) ? "failed" : "running",
    revision: 1,
    createdBy: "owner-1",
    hiddenAt: null,
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
    ...overrides,
});

const run = (id: string, status: ContentGenerationRun["status"]): ContentGenerationRun => ({
    id,
    topicId: "topic-1",
    attemptId: "attempt-1",
    ownerId: "owner-1",
    rootNodeId: "root-1",
    resultNodeId: null,
    stage: "storyline_script",
    mode: "automatic",
    status,
    round: 1,
    maxRounds: 3,
    producerModelId: null,
    reviewerModelId: null,
    fallbackModelId: null,
    modelPromptBindings: [],
    currentJobId: null,
    generationJobIds: [],
    outputAssetIds: [],
    policySnapshot: {},
    promptVersion: "2.0.0",
    schemaVersion: "2.0.0",
    inputSnapshot: {},
    output: {},
    reviews: [],
    hardFail: false,
    mediaRetryCount: 0,
    mediaRetryLimit: 0,
    errorMessage: null,
    createdAt: "2026-07-28T00:00:00Z",
    startedAt: null,
    completedAt: null,
    updatedAt: "2026-07-28T00:00:00Z",
});

describe("content production progress", () => {
    it("summarizes Topic and Storyline runs together", () => {
        const nodes = [
            node("topic-generating", "generating", "run-1"),
            node("story-reviewing", "reviewer_running", "run-2"),
            node("story-repairing", "repairing", "run-3"),
            node("topic-accepted", "ready_pass", "run-4"),
            node("story-accepted", "accepted", "run-5"),
            node("story-attention", "needs_owner_attention", "run-6", { status: "needs_owner_attention" }),
        ];
        expect(contentProductionSummary(nodes, [
            run("run-1", "producer_running"),
            run("run-2", "reviewer_running"),
            run("run-3", "repairing"),
            run("run-4", "accepted"),
            run("run-5", "accepted"),
            run("run-6", "needs_owner_attention"),
        ])).toEqual({
            generating: 1,
            reviewing: 1,
            repairing: 1,
            humanizing: 0,
            accepted: 2,
            attention: 1,
            failed: 0,
            total: 6,
        });
    });

    it("excludes hidden nodes and de-duplicates optimistic nodes by client request", () => {
        const optimistic = node("optimistic-storyline:request-1", "producer_running", "optimistic-run", {
            data: {
                clientRequestId: "request-1",
                storylineWorkflow: { operation: "generate", phase: "producer_running", round: 1, runId: "optimistic-run" },
            },
        });
        const real = node("story-real", "reviewer_running", "run-real", {
            data: {
                clientRequestId: "request-1",
                storylineWorkflow: { operation: "generate", phase: "reviewer_running", round: 1, runId: "run-real" },
            },
        });
        const hidden = node("story-hidden", "failed", "run-hidden", { hiddenAt: "2026-07-28T02:00:00Z" });
        expect(contentProductionSummary([optimistic, real, hidden], [run("run-real", "reviewer_running")])).toMatchObject({
            generating: 0,
            reviewing: 1,
            failed: 0,
            total: 1,
        });
    });
});
