import { describe, expect, it } from "vitest";

import type { ContentNode } from "@/types/content-production";
import { collapsedStoryboardNodes, contentStoryboardSnapshot } from "./storyboard";

const base = {
    topicId: "topic",
    attemptId: "attempt",
    title: "node",
    summary: "",
    sortOrder: 0,
    status: "succeeded",
    revision: 1,
    createdBy: "owner",
    hiddenAt: null,
    createdAt: "2026-07-29",
    updatedAt: "2026-07-29",
} satisfies Partial<ContentNode>;

describe("storyboard node state", () => {
    it("recognizes lightweight parent metadata and a child node", () => {
        const parent = {
            ...base,
            id: "group",
            parentId: "storyline",
            nodeType: "batch",
            data: {
                storyboardWorkflow: {
                    operation: "generate",
                    phase: "accepted",
                    runId: "run",
                    sourceNodeId: "storyline",
                    groupId: "group",
                    header: { storyline_title: "雨夜", total_nodes: 1, metadata: { defined_characters: [], defined_scenes: [] } },
                },
            },
        } as ContentNode;
        expect(contentStoryboardSnapshot(parent)?.header?.storyline_title).toBe("雨夜");
    });

    it("collapses only canonical group nodes and their descendants", () => {
        const nodes = [
            { ...base, id: "group", parentId: "storyline", nodeType: "batch", data: { storyboardGroupId: "group" } },
            { ...base, id: "shot", parentId: "group", nodeType: "shot", data: { storyboardGroupId: "group" } },
            { ...base, id: "prompt", parentId: "shot", nodeType: "storyboard_prompt", data: {} },
            { ...base, id: "optimized-group", parentId: "group", nodeType: "batch", data: { storyboardGroupId: "optimized-group" } },
        ] as ContentNode[];
        expect(collapsedStoryboardNodes(nodes, new Set(["group"])).map((node) => node.id)).toEqual([
            "group",
            "optimized-group",
        ]);
    });
});
