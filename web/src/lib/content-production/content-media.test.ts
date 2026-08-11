import { describe, expect, it } from "vitest";

import { contentMediaStage, ltxMultimodalConfig, mediaNodeTypeForAssetKind } from "./content-media";

describe("content media generation", () => {
    it.each([
        ["image", "storyboard_image"],
        ["tts", "tts"],
        ["music", "music"],
        ["video", "video"],
    ] as const)("routes %s nodes to %s", (nodeType, stage) => {
        expect(contentMediaStage(nodeType)).toBe(stage);
    });

    it("forces LTX V1 to multimodal without timeline relay fields", () => {
        const config = ltxMultimodalConfig({ videoInputMode: "firstFrame", videoSeconds: "8" });
        expect(config).toMatchObject({ videoInputMode: "multimodal", videoSeconds: "8" });
        expect(config).not.toHaveProperty("timeline");
        expect(config).not.toHaveProperty("relay");
    });

    it("maps generated assets to typed result nodes", () => {
        expect(mediaNodeTypeForAssetKind("image")).toBe("image");
        expect(mediaNodeTypeForAssetKind("video")).toBe("video");
        expect(mediaNodeTypeForAssetKind("audio", "music")).toBe("music");
        expect(mediaNodeTypeForAssetKind("audio", "speech")).toBe("tts");
    });
});
