import { beforeAll, describe, expect, it } from "vitest";

import { LOCAL_MODELS } from "@/components/layout/app-providers";
import { useConfigStore } from "@/stores/use-config-store";
import { generationModeModel } from "./canvas-config-node-panel";

describe("generation module mode model persistence", () => {
    beforeAll(() => {
        useConfigStore.getState().setProviderCatalog(LOCAL_MODELS);
    });

    it("persists the video model when switching from an image model", () => {
        const config = { ...useConfigStore.getState().config, imageModel: "ernie-image-turbo", videoModel: "minimax-h3" };
        expect(generationModeModel(config, "ernie-image-turbo", "video")).toBe("minimax-h3");
    });

    it("persists the image model when switching back from video", () => {
        const config = { ...useConfigStore.getState().config, imageModel: "ernie-image-turbo", videoModel: "minimax-h3" };
        expect(generationModeModel(config, "minimax-h3", "image")).toBe("ernie-image-turbo");
    });
});
