import { describe, expect, it } from "vitest";

import { contentNodePath, contentNodeStageActions, layoutContentTree } from "./content-tree";
import type { ContentNode } from "@/types/content-production";

function node(id: string, parentId: string | null, sortOrder: number, nodeType: ContentNode["nodeType"] = "text"): ContentNode {
    return {
        id,
        topicId: "topic-1",
        attemptId: "attempt-1",
        parentId,
        nodeType,
        title: id,
        summary: "",
        sortOrder,
        data: {},
        status: "idle",
        revision: 1,
        createdBy: "user-1",
        hiddenAt: null,
        createdAt: `2026-07-24T00:00:0${sortOrder}Z`,
        updatedAt: `2026-07-24T00:00:0${sortOrder}Z`,
    };
}

describe("layoutContentTree", () => {
    it("lays out a stable left-to-right tree using sort order", () => {
        const nodes = [
            node("root", null, 0, "topic"),
            node("b", "root", 2),
            node("a", "root", 1),
            node("a-1", "a", 1),
        ];

        const layout = layoutContentTree(nodes);

        expect(layout.root.depth).toBe(0);
        expect(layout.a.depth).toBe(1);
        expect(layout["a-1"].depth).toBe(2);
        expect(layout.root.x).toBeLessThan(layout.a.x);
        expect(layout.a.x).toBeLessThan(layout["a-1"].x);
        expect(layout.a.y).toBeLessThan(layout.b.y);
        expect(layoutContentTree([...nodes].reverse())).toEqual(layout);
    });

    it("returns the complete root-to-node path", () => {
        const nodes = [node("root", null, 0, "topic"), node("script", "root", 1, "script"), node("shot", "script", 1, "shot")];
        expect(contentNodePath(nodes, "shot").map((item) => item.id)).toEqual(["root", "script", "shot"]);
    });

    it("reserves space when a node expands its optimization input", () => {
        const nodes = [node("root", null, 0, "topic"), node("a", "root", 0), node("b", "root", 1)];
        const compact = layoutContentTree(nodes);
        const expanded = layoutContentTree(nodes, { a: 336 });
        expect(expanded.b.y).toBeGreaterThan(compact.b.y);
    });
});

describe("contentNodeStageActions", () => {
    it("lists equal explicit actions without selecting a default", () => {
        expect(contentNodeStageActions("topic")).toEqual(["research"]);
        expect(contentNodeStageActions("storyline")).toEqual(["shot_breakdown"]);
        expect(contentNodeStageActions("script")).toEqual(["shot_breakdown"]);
        expect(contentNodeStageActions("shot")).toEqual(["storyboard_prompt", "tts", "music"]);
        expect(contentNodeStageActions("image")).toEqual(["ltx_multimodal"]);
    });
});
