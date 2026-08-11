import { describe, expect, it, vi } from "vitest";

import type { CourseFlowScene } from "@/types/course-flow";
import { runCourseSceneReplacement } from "./scene-replacement";

const previous: CourseFlowScene = { prompt: "原场景", assetId: "old.png", url: "/old.png", status: "ready", errorMessage: null };
const optimistic: CourseFlowScene = { prompt: "新场景", assetId: null, url: "/preview.png", status: "running", errorMessage: null };
const ready: CourseFlowScene = { prompt: "新场景", assetId: "new.png", url: "/new.png", status: "ready", errorMessage: null };

describe("course scene replacement", () => {
    it("shows the replacement immediately and commits the saved scene", async () => {
        const apply = vi.fn();

        await runCourseSceneReplacement({ previous, optimistic, request: async () => ready, isCurrent: () => true, apply });

        expect(apply.mock.calls).toEqual([[optimistic], [ready]]);
    });

    it("restores the complete previous scene when saving fails", async () => {
        const apply = vi.fn();

        await expect(runCourseSceneReplacement({ previous, optimistic, request: async () => { throw new Error("保存失败"); }, isCurrent: () => true, apply })).rejects.toThrow("保存失败");

        expect(apply.mock.calls).toEqual([[optimistic], [previous]]);
    });

    it("does not let a stale completion overwrite a newer operation", async () => {
        const apply = vi.fn();

        await runCourseSceneReplacement({ previous, optimistic, request: async () => ready, isCurrent: () => false, apply });

        expect(apply.mock.calls).toEqual([[optimistic]]);
    });
});
