import { describe, expect, it } from "vitest";

import type { ContentNode, ContentTopicOrientation } from "@/types/content-production";
import { contentAttemptOrientation, isContentOrientationComplete } from "./content-orientation";

const completeOrientation: ContentTopicOrientation = {
    contentGoal: "让家长理解孩子抗拒刷牙的原因，并愿意尝试新的引导方式",
    targetAudience: "3–8 岁孩子的家长",
    marketLanguage: "中国大陆 / 简体中文",
    primaryPlatforms: ["抖音", "小红书"],
    contentFormat: "60 秒竖屏知识剧情",
    defaultDurationSeconds: 60,
    defaultAspectRatio: "9:16",
    expressionStyle: "轻松、可信、避免说教",
};

const node = (overrides: Partial<ContentNode> = {}): ContentNode => ({
    id: "node",
    topicId: "topic",
    attemptId: "attempt",
    parentId: null,
    nodeType: "topic",
    title: "Topic",
    summary: "",
    sortOrder: 0,
    data: {},
    status: "succeeded",
    revision: 1,
    createdBy: "owner",
    hiddenAt: null,
    createdAt: "2026-07-25T00:00:00Z",
    updatedAt: "2026-07-25T00:00:00Z",
    ...overrides,
});

describe("content Topic Orientation", () => {
    it("requires every concise production field", () => {
        expect(isContentOrientationComplete(completeOrientation)).toBe(true);
        expect(isContentOrientationComplete({ ...completeOrientation, targetAudience: "" })).toBe(false);
        expect(isContentOrientationComplete({ ...completeOrientation, primaryPlatforms: [] })).toBe(false);
        expect(isContentOrientationComplete({ ...completeOrientation, defaultDurationSeconds: 0 })).toBe(false);
    });

    it("does not treat a fresh Attempt with only a Topic root as ready", () => {
        expect(contentAttemptOrientation([
            node({ id: "root", parentId: null, nodeType: "topic" }),
        ])).toBeNull();
    });

    it("returns the current Attempt Orientation when its structured fields are complete", () => {
        expect(contentAttemptOrientation([
            node({ id: "root", data: { orientation: completeOrientation } }),
        ])).toEqual(completeOrientation);
    });

    it("rejects partial or hidden Orientation nodes", () => {
        expect(contentAttemptOrientation([
            node({ data: { orientation: { ...completeOrientation, contentGoal: "" } } }),
        ])).toBeNull();
        expect(contentAttemptOrientation([
            node({ data: { orientation: completeOrientation }, hiddenAt: "2026-07-25T01:00:00Z" }),
        ])).toBeNull();
    });
});
