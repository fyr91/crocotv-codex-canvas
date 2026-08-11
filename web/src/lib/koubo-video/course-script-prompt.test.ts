import { describe, expect, it } from "vitest";

import { courseScriptGroupOptimizationPrompt, courseScriptPrompt } from "./course-script-prompt";
import { videoWorkflowCopy } from "./workflow-copy";

describe("courseScriptPrompt", () => {
    it("normalizes all supplied course fields into a structured user prompt", () => {
        expect(courseScriptPrompt({ topic: "  光合作用 ", audience: " 初中生 ", extraPrompt: " 多举例 " })).toBe(
            "课程主题：光合作用\n目标受众：初中生\n额外提示词：多举例",
        );
    });

    it("omits an empty optional prompt", () => {
        expect(courseScriptPrompt({ topic: "光合作用", audience: "初中生", extraPrompt: "  " })).toBe(
            "课程主题：光合作用\n目标受众：初中生",
        );
    });

    it("adds an explicit whole-group optimization section", () => {
        expect(courseScriptGroupOptimizationPrompt("课程主题：光合作用", " 语言更简单 ")).toBe(
            "课程主题：光合作用\n\n整组优化要求：\n语言更简单",
        );
    });
});

describe("videoWorkflowCopy", () => {
    it("keeps course and talking-head script copy on independent tracks", () => {
        expect(videoWorkflowCopy("course-video")).toMatchObject({
            startTitle: "开始制作课程视频",
            generateScriptLabel: "生成课程文案",
            scriptGroupTitle: "课程文案组",
        });
        expect(videoWorkflowCopy("koubo-video")).toMatchObject({
            startTitle: "开始制作口播视频",
            generateScriptLabel: "生成口播文案",
            scriptGroupTitle: "口播文案组",
        });
    });
});
