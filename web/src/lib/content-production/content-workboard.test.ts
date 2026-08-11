import { describe, expect, it } from "vitest";

import type { ContentGenerationRun, ContentNode } from "@/types/content-production";
import {
    createOptimisticContentBranchNode,
    contentBranchNodes,
    contentNodeProducingRun,
    contentNodePanelKind,
    contentWorkboardNodes,
    contentWorkboardShortcut,
    contentWorkboardViewReducer,
    defaultChildType,
    mergeOptimisticContentBranchNode,
    startConfirmedRegeneration,
} from "./content-workboard";

const node = (id: string, parentId: string | null, nodeType: ContentNode["nodeType"]): ContentNode => ({
    id,
    topicId: "topic",
    attemptId: "attempt",
    parentId,
    nodeType,
    title: id,
    summary: "",
    sortOrder: 0,
    data: {},
    status: "idle",
    revision: 1,
    createdBy: "owner",
    hiddenAt: null,
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
});

const nodes = [
    node("root", null, "topic"),
    node("script-a", "root", "script"),
    node("shot-a", "script-a", "shot"),
    node("image-a", "shot-a", "image"),
    node("script-b", "root", "script"),
];

const run = (id: string, createdAt: string): ContentGenerationRun => ({
    id,
    topicId: "topic",
    attemptId: "attempt",
    ownerId: "owner",
    rootNodeId: "root",
    resultNodeId: "angle",
    stage: "topic_factory",
    mode: "automatic",
    status: "accepted",
    round: 1,
    maxRounds: 3,
    producerModelId: "gemini",
    reviewerModelId: "glm",
    fallbackModelId: null,
    currentJobId: null,
    generationJobIds: [],
    outputAssetIds: [],
    policySnapshot: {},
    promptVersion: "3.1.0",
    schemaVersion: "3.1",
    modelPromptBindings: id === "run-new"
        ? [{ promptId: "humanize-v5", stage: "topic_factory", purposeKey: "humanize", purposeLabel: "去 AI 化", modelId: "glm", version: 5 }]
        : [],
    inputSnapshot: {},
    output: {},
    reviews: [],
    hardFail: false,
    mediaRetryCount: 0,
    mediaRetryLimit: 0,
    errorMessage: null,
    createdAt,
    startedAt: createdAt,
    completedAt: createdAt,
    updatedAt: createdAt,
});

describe("content workboard view", () => {
    it("dismisses regeneration confirmation immediately while submission starts in the background", () => {
        let submissionStarted = false;
        const pendingSubmission = new Promise<void>(() => undefined);
        const confirmationResult = startConfirmedRegeneration(async () => {
            submissionStarted = true;
            await pendingSubmission;
        }, () => undefined);

        expect(confirmationResult).toBeUndefined();
        expect(submissionStarted).toBe(true);
    });

    it("reports a background regeneration submission failure after confirmation is dismissed", async () => {
        const failure = new Error("提交失败");
        let reportedFailure: unknown;

        startConfirmedRegeneration(
            () => Promise.reject(failure),
            (error) => {
                reportedFailure = error;
            },
        );
        await Promise.resolve();

        expect(reportedFailure).toBe(failure);
    });

    it("shows a loading storyline branch before automatic generation starts", () => {
        const optimistic = createOptimisticContentBranchNode({
            topicId: "topic",
            attemptId: "attempt",
            parentNode: node("angle-1", "orientation-1", "angle"),
            createdBy: "owner",
            requestId: "request-1",
            stage: "storyline_script",
            createdAt: "2026-07-27T00:00:00Z",
        });

        expect(optimistic).toMatchObject({
            parentId: "angle-1",
            nodeType: "storyline",
            title: "故事线",
            summary: "正在生成故事线",
            status: "running",
            data: {
                stage: "storyline_script",
                clientRequestId: "request-1",
            },
        });
    });

    it("replaces an optimistic branch with the matching server node", () => {
        const optimistic = createOptimisticContentBranchNode({
            topicId: "topic",
            attemptId: "attempt",
            parentNode: node("angle-1", "orientation-1", "angle"),
            createdBy: "owner",
            requestId: "request-1",
            stage: "storyline_script",
            createdAt: "2026-07-27T00:00:00Z",
        });
        const real = {
            ...optimistic,
            id: "storyline-1",
            data: { ...optimistic.data, runId: "run-1" },
        };

        expect(mergeOptimisticContentBranchNode([real], optimistic)).toEqual([real]);
    });

    it("selects a node without changing the canvas viewport", () => {
        const viewport = { x: 120, y: -80, k: 0.75 };
        const next = contentWorkboardViewReducer(
            { selectedNodeId: "script-a", viewport },
            { type: "select", nodeId: "script-b" },
        );

        expect(next.selectedNodeId).toBe("script-b");
        expect(next.viewport).toBe(viewport);
    });

    it("keeps the root-to-focus path and focused descendants in focus mode", () => {
        expect(contentWorkboardNodes(nodes, "shot-a", "focus").map((item) => item.id)).toEqual([
            "root",
            "script-a",
            "shot-a",
            "image-a",
        ]);
    });

    it("collapses descendants while retaining the selected node", () => {
        expect(contentWorkboardNodes(nodes, "script-a", "collapse").map((item) => item.id)).toEqual([
            "root",
            "script-a",
            "script-b",
        ]);
    });

    it("returns the selected branch and every visible descendant for deletion", () => {
        expect(contentBranchNodes(nodes, "script-a").map((item) => item.id)).toEqual([
            "script-a",
            "shot-a",
            "image-a",
        ]);
    });

    it("uses the node snapshot Run before an older result-node match", () => {
        const selected = {
            ...node("angle", "root", "angle"),
            data: { topicFactory: { runId: "run-new" } },
        };
        const selectedRun = contentNodeProducingRun(selected, [
            run("run-old", "2026-07-27T00:00:00Z"),
            run("run-new", "2026-07-28T00:00:00Z"),
        ]);

        expect(selectedRun?.id).toBe("run-new");
        expect(selectedRun?.modelPromptBindings[0]?.purposeKey).toBe("humanize");
    });

    it("falls back to the newest matching result-node Run", () => {
        const selected = node("angle", "root", "angle");
        expect(contentNodeProducingRun(selected, [
            run("run-new", "2026-07-28T00:00:00Z"),
            run("run-old", "2026-07-27T00:00:00Z"),
        ])?.id).toBe("run-new");
    });

    it("maps canvas-style delete and undo shortcuts", () => {
        expect(contentWorkboardShortcut({ key: "Backspace" })).toBe("delete");
        expect(contentWorkboardShortcut({ key: "Delete" })).toBe("delete");
        expect(contentWorkboardShortcut({ key: "z", metaKey: true })).toBe("undo");
        expect(contentWorkboardShortcut({ key: "z", ctrlKey: true })).toBe("undo");
        expect(contentWorkboardShortcut({ key: "z" })).toBeNull();
    });
});

describe("content node panel routing", () => {
    it.each([
        ["script", "text"],
        ["image", "image"],
        ["video", "video"],
        ["tts", "audio"],
        ["music", "music"],
        ["batch", "batch"],
    ] as const)("routes %s nodes to the %s panel", (nodeType, panel) => {
        expect(contentNodePanelKind(nodeType)).toBe(panel);
    });

    it("adds a useful child type from each parent type", () => {
        expect(defaultChildType("topic")).toBe("orientation");
        expect(defaultChildType("script")).toBe("shot");
        expect(defaultChildType("shot")).toBe("storyboard_prompt");
        expect(defaultChildType("image")).toBe("video");
    });
});
