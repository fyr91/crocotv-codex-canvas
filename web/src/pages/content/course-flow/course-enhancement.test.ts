import { describe, expect, it, vi } from "vitest";

import type { CourseFlowProject, CourseFlowSegment } from "@/types/course-flow";
import { buildCourseEnhancementUserPrompt, runCourseEnhancement } from "./course-enhancement";

const project: CourseFlowProject = {
    id: "project-1",
    title: "彗星课程",
    currentStep: "script_scene",
    roleId: "role-1",
    sourceType: "generated",
    topic: "彗星科普",
    audience: "小学生",
    extraPrompt: "语气有趣",
    sceneMode: "green_screen",
    sceneAspectRatio: "16:9",
    materialStylePrompt: "科普风格",
    resolution: "720p",
};

const segment: CourseFlowSegment = {
    id: "segment-1",
    position: 0,
    text: "彗星是围绕太阳运行的小天体。",
    voiceDirection: "自然清晰",
    revision: 1,
    confirmedScriptRevision: null,
    confirmedPlanAudioId: null,
    selectedAudioId: "audio-1",
    audioVersions: [],
    ltxVideo: null,
    materialShots: [],
};

describe("course enhancement user prompt", () => {
    it("builds from the project form, current segments and instruction", () => {
        expect(JSON.parse(buildCourseEnhancementUserPrompt(project, [segment], "  精简重复解释  "))).toEqual({
            courseDefinition: {
                sourceType: "generated",
                topic: "彗星科普",
                audience: "小学生",
                extraPrompt: "语气有趣",
            },
            currentSegments: [{
                text: "彗星是围绕太阳运行的小天体。",
                voiceDirection: "自然清晰",
            }],
            enhancementInstruction: "精简重复解释",
        });
    });

    it("applies the authoritative segments after persistence", async () => {
        const next = [{ ...segment, text: "优化后的文案" }];
        const apply = vi.fn();
        const restore = vi.fn();

        await runCourseEnhancement({
            previous: [segment],
            request: vi.fn().mockResolvedValue(undefined),
            load: vi.fn().mockResolvedValue(next),
            isCurrent: () => true,
            apply,
            restore,
        });

        expect(apply).toHaveBeenCalledWith(next);
        expect(restore).not.toHaveBeenCalled();
    });

    it("restores the complete previous segments when enhancement fails", async () => {
        const restore = vi.fn();

        await expect(runCourseEnhancement({
            previous: [segment],
            request: vi.fn().mockRejectedValue(new Error("模型失败")),
            load: vi.fn(),
            isCurrent: () => true,
            apply: vi.fn(),
            restore,
        })).rejects.toThrow("模型失败");

        expect(restore).toHaveBeenCalledWith([segment]);
    });

    it("does not let a stale operation replace or roll back newer state", async () => {
        const apply = vi.fn();

        await expect(runCourseEnhancement({
            previous: [segment],
            request: vi.fn().mockRejectedValue(new Error("旧请求失败")),
            load: vi.fn(),
            isCurrent: () => false,
            apply,
            restore: vi.fn(),
        })).rejects.toThrow("旧请求失败");

        expect(apply).not.toHaveBeenCalled();
    });
});
