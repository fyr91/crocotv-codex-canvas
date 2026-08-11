import { beforeEach, describe, expect, it } from "vitest";

import { defaultConfig, useConfigStore } from "@/stores/use-config-store";
import type { CourseFlowMaterialShot } from "@/types/course-flow";
import {
    composeH3MaterialVideoPrompt,
    courseMaterialH3Selection,
    courseMaterialStoryboardModel,
    courseMaterialStoryboardPrompt,
    courseMaterialStoryboardSize,
    courseMaterialStoryboardState,
} from "./material-storyboard";

const imageConfig = {
    imageSizePresets: {
        "1K": { auto: "1K", "1:1": "1024x1024", "4:3": "1024x768", "16:9": "1280x720", "9:16": "720x1280" },
    },
};

function shot(patch: Partial<CourseFlowMaterialShot> = {}): CourseFlowMaterialShot {
    return {
        id: "shot-1",
        position: 0,
        prompt: "彗星掠过夜空",
        durationSeconds: 12,
        sourceSegmentRevision: 3,
        sourceAudioVersionId: "audio-2",
        storyboardPrompt: "分镜 Prompt",
        storyboardSourcePrompt: "彗星掠过夜空",
        storyboardAssetId: "storyboard-asset",
        storyboardUrl: "/storyboard.png",
        storyboardGenerationId: "generation-1",
        storyboardStatus: "ready",
        storyboardErrorMessage: null,
        storyboardClientRequestId: "request-1",
        video: null,
        ...patch,
    };
}

describe("Course Flow material storyboard contract", () => {
    beforeEach(() => {
        useConfigStore.setState({ config: { ...defaultConfig } });
        useConfigStore.getState().setProviderCatalog([
            { id: "wrong-nano", provider_id: "ark", capability: "image", model_key: "google:nano-banana@2-lite", display_name: "Wrong Nano", config: imageConfig, is_default: false },
            { id: "runware-nano", provider_id: "runware", capability: "image", model_key: "google:nano-banana@2-lite", display_name: "Nano Banana 2 Lite", config: imageConfig, is_default: false },
        ]);
    });

    it("selects the exact Runware Nano Banana Lite model", () => {
        expect(courseMaterialStoryboardModel(useConfigStore.getState().config)).toBe("runware-nano::google:nano-banana@2-lite");
    });

    it("combines the managed storyboard instruction and detailed scene into one image prompt", () => {
        expect(courseMaterialStoryboardPrompt("  固定分镜指令。  ", "  彗星掠过夜空  ")).toBe("固定分镜指令。 detailed scene: 彗星掠过夜空");
        expect(() => courseMaterialStoryboardPrompt("   ", "彗星掠过夜空")).toThrow("素材分镜图生成 Prompt 不能为空");
        expect(() => courseMaterialStoryboardPrompt("固定分镜指令。", "   ")).toThrow("画面素材提示词不能为空");
    });

    it("maps the course ratio to the storyboard image size", () => {
        const model = "runware-nano::google:nano-banana@2-lite";
        expect(courseMaterialStoryboardSize(model, "16:9")).toBe("1280x720");
        expect(courseMaterialStoryboardSize(model, "4:3")).toBe("1024x768");
        expect(courseMaterialStoryboardSize(model, "1:1")).toBe("1024x1024");
        expect(courseMaterialStoryboardSize(model, "9:16")).toBe("720x1280");
    });

    it("derives ready, stale, running, queued, and failed storyboard states", () => {
        expect(courseMaterialStoryboardState(shot())).toBe("ready");
        expect(courseMaterialStoryboardState(shot({ prompt: "新提示词" }))).toBe("stale");
        expect(courseMaterialStoryboardState(shot({ storyboardStatus: "running", prompt: "新提示词" }))).toBe("running");
        expect(courseMaterialStoryboardState(shot({ storyboardStatus: "queued", storyboardAssetId: null, storyboardUrl: "" }))).toBe("queued");
        expect(courseMaterialStoryboardState(shot({ storyboardStatus: "failed", storyboardAssetId: null, storyboardUrl: "" }))).toBe("failed");
    });

    it("composes the H3 prompt in the approved order without text restrictions", () => {
        const prompt = composeH3MaterialVideoPrompt("  现代科普视觉  ", "  彗星掠过夜空  ");
        expect(prompt).toBe("分镜参考：\n参考 <Picture 1> 生成当前视频镜头。\n\n当前画面描述：\n彗星掠过夜空\n\n统一视觉风格：\n现代科普视觉");
        expect(prompt).not.toContain("不要文字");
        expect(prompt).not.toContain("禁止可读文字");
        expect(() => composeH3MaterialVideoPrompt("", "彗星")).toThrow("内容素材统一风格不能为空");
        expect(() => composeH3MaterialVideoPrompt("现代科普", " ")).toThrow("画面素材提示词不能为空");
    });

    it("uses the available H3 preview profiles and safely falls unsupported ratios back to 16:9", () => {
        expect(courseMaterialH3Selection("16:9")).toEqual({ quality: "preview", size: "864x480" });
        expect(courseMaterialH3Selection("4:3")).toEqual({ quality: "standard_480p", size: "640x480" });
        expect(courseMaterialH3Selection("1:1")).toEqual({ quality: "preview", size: "864x480" });
        expect(courseMaterialH3Selection("9:16")).toEqual({ quality: "standard_portrait_480p", size: "480x864" });
    });
});
