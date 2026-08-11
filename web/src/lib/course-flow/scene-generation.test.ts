import { beforeEach, describe, expect, it } from "vitest";

import { defaultConfig, useConfigStore } from "@/stores/use-config-store";
import {
    courseSceneImageModel,
    courseSceneImageSize,
    courseSceneLtxSize,
    courseSceneReferences,
    courseSceneRatioOptions,
} from "./scene-generation";

const gptImageConfig = {
    imageSizePresets: {
        "1K": {
            auto: "1K",
            "1:1": "1024x1024",
            "4:3": "1024x768",
            "16:9": "1280x720",
            "9:16": "720x1280",
            "3:2": "1200x800",
        },
    },
};

const ltxConfig = {
    ltxCapabilities: {
        provider: "ltx",
        workflows: [{
            inputMode: "multimodal",
            aspectRatioPresets: [
                { id: "landscape", ratio: "宽屏", options: [{ value: "1280x704", width: 1280, height: 704, recommended: true }] },
                { id: "classic", ratio: "4:3", options: [{ value: "1024x768", width: 1024, height: 768, recommended: true }] },
                { id: "square", ratio: "1:1", options: [{ value: "768x768", width: 768, height: 768, recommended: true }] },
                { id: "portrait", ratio: "9:16", options: [{ value: "1088x1920", width: 1088, height: 1920, deliveryWidth: 1080, deliveryHeight: 1920, recommended: true }] },
                { id: "other", ratio: "GPU 可用", options: [{ value: "1024x576", width: 1024, height: 576 }] },
            ],
        }],
    },
};

describe("Course Flow scene generation model contract", () => {
    beforeEach(() => {
        useConfigStore.setState({ config: { ...defaultConfig } });
        useConfigStore.getState().setProviderCatalog([
            { id: "wrong-provider", provider_id: "ark", capability: "image", model_key: "openai:gpt-image@2", display_name: "Wrong GPT Image 2", config: gptImageConfig, is_default: false },
            { id: "runware-gpt2", provider_id: "runware", capability: "image", model_key: "openai:gpt-image@2", display_name: "GPT Image 2", config: gptImageConfig, is_default: false },
            { id: "runware-other", provider_id: "runware", capability: "image", model_key: "google:nano-banana@2-lite", display_name: "Nano Banana", config: gptImageConfig, is_default: true },
            { id: "ltx-model", provider_id: "ltx", capability: "video", model_key: "ltx-2.3-distilled", display_name: "LTX-2.3", config: ltxConfig, is_default: true },
        ]);
    });

    it("selects only Runware GPT Image 2 instead of the user default image model", () => {
        const config = useConfigStore.getState().config;
        expect(courseSceneImageModel(config)).toBe("runware-gpt2::openai:gpt-image@2");
    });

    it("exposes only ratios shared by GPT Image 2 and the course video chain", () => {
        expect(courseSceneRatioOptions("runware-gpt2::openai:gpt-image@2")).toEqual([
            { label: "16:9", value: "16:9" },
            { label: "4:3", value: "4:3" },
            { label: "1:1", value: "1:1" },
            { label: "9:16", value: "9:16" },
        ]);
    });

    it("maps each project ratio to the exact GPT Image 2 size", () => {
        const model = "runware-gpt2::openai:gpt-image@2";
        expect(courseSceneImageSize(model, "16:9")).toBe("1280x720");
        expect(courseSceneImageSize(model, "4:3")).toBe("1024x768");
        expect(courseSceneImageSize(model, "1:1")).toBe("1024x1024");
        expect(courseSceneImageSize(model, "9:16")).toBe("720x1280");
    });

    it("maps the project ratio to an available LTX multimodal resolution", () => {
        const model = "ltx-model::ltx-2.3-distilled";
        expect(courseSceneLtxSize(model, "16:9")).toBe("1024x576");
        expect(courseSceneLtxSize(model, "4:3")).toBe("1024x768");
        expect(courseSceneLtxSize(model, "1:1")).toBe("768x768");
        expect(courseSceneLtxSize(model, "9:16")).toBe("1088x1920");
    });

    it("passes only the role design sheet when current-scene reference is disabled", () => {
        expect(courseSceneReferences(role, scene, false).map((item) => item.storageKey)).toEqual(["role-sheet"]);
    });

    it("passes the role first and current scene second when optimization is enabled", () => {
        expect(courseSceneReferences(role, scene, true).map((item) => item.storageKey)).toEqual(["role-sheet", "current-scene"]);
    });

    it("rejects current-scene optimization when the existing image is unavailable", () => {
        expect(() => courseSceneReferences(role, null, true)).toThrow("当前课程场景图不可用");
    });
});

const role = {
    id: "role-1",
    creatorId: "user-1",
    name: "林老师",
    description: "亲和、专业",
    designSheetAssetId: "role-sheet",
    designSheetUrl: "/role-sheet.png",
    frontAssetId: "role-front",
    frontUrl: "/role-front.png",
    voiceId: "voice-1",
    voiceName: "林老师",
    previewAssetId: null,
    previewUrl: "",
};

const scene = {
    prompt: "当前场景提示词",
    assetId: "current-scene",
    url: "/current-scene.png",
    status: "ready" as const,
    errorMessage: null,
};
