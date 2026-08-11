import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ createInput: null as Record<string, unknown> | null }));

vi.mock("./generation-client", () => ({
    createGeneration: async (input: Record<string, unknown>) => {
        state.createInput = input;
        return { job: { id: "job-1", status: "succeeded" }, assets: [{ id: "asset-1", url: "/storyboard.png", output_index: 0 }] };
    },
    requestTextGeneration: vi.fn(),
    waitForGeneration: vi.fn(),
}));

vi.mock("@/stores/use-config-store", () => ({
    modelSupportsImagePromptOptimize: () => false,
    modelSupportsImageSearch: () => false,
    modelSupportsImageWebSearch: () => false,
    normalizeImageSizeForModel: (_model: string, size: string) => size,
    providerIdForModel: () => "runware",
}));

vi.mock("@/services/image-storage", () => ({ uploadImage: vi.fn() }));
vi.mock("@/services/file-storage", () => ({ uploadMediaFile: vi.fn() }));
vi.mock("./model-catalog", () => ({ getModelCatalog: vi.fn() }));
vi.mock("./cloud-assets", () => ({ cloudAssetForUrl: vi.fn() }));

import { requestGeneration } from "./image";

describe("image generation request", () => {
    beforeEach(() => { state.createInput = null; });

    it("passes an explicit client request id to the generation task", async () => {
        await requestGeneration({ model: "nano", imageModel: "nano", size: "1280x720", count: "1" } as never, "分镜", { clientRequestId: "8e38e9c6-170a-459e-b6e5-841476a2ace0" });
        expect(state.createInput?.clientRequestId).toBe("8e38e9c6-170a-459e-b6e5-841476a2ace0");
    });

    it("stores an explicit managed System Prompt and its version in task parameters", async () => {
        await requestGeneration({ model: "nano", imageModel: "nano", size: "1280x720", count: "1" } as never, "detailed scene: 彗星", {
            systemPrompt: "固定分镜图指令",
            systemPromptId: "prompt-1",
            systemPromptVersion: 2,
        });
        expect(state.createInput?.params).toMatchObject({
            systemPrompt: "固定分镜图指令",
            systemPromptId: "prompt-1",
            systemPromptVersion: 2,
        });
    });
});
