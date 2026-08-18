import { describe, expect, it } from "vitest";

import { LOCAL_MODELS, modelsForProviderAvailability } from "./app-providers";

describe("provider-aware local model catalog", () => {
    it("makes a URL-and-token-only GPU installation select only routable models", () => {
        const models = modelsForProviderAvailability(LOCAL_MODELS, { gpu: true, h3: true });
        const ids = models.map((model) => model.id);

        expect(ids).toEqual(expect.arrayContaining(["ernie-image-turbo", "minimax-h3", "ltx-2.5", "minimax-music-3"]));
        expect(ids).not.toContain("runware-lite");
        expect(ids).not.toContain("suno-music");
        expect(models.find((model) => model.capability === "image")?.id).toBe("ernie-image-turbo");
    });

    it("keeps the discovery catalog visible before any provider is configured", () => {
        expect(modelsForProviderAvailability(LOCAL_MODELS, {})).toBe(LOCAL_MODELS);
    });

    it("keeps Coding Plan text models alongside the GPU V2 catalog", () => {
        const models = modelsForProviderAvailability(LOCAL_MODELS, { codingPlan: true, gpu: true, h3: true });
        const ids = models.map((model) => model.id);

        expect(ids).toEqual(expect.arrayContaining(["coding-plan-deepseek-flash", "ernie-image-turbo", "minimax-h3", "ltx-2.5", "minimax-music-3"]));
        expect(ids).not.toContain("volc-deepseek-flash");
    });
});
