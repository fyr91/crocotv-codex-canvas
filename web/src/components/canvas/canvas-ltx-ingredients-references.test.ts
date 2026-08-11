import { describe, expect, it } from "vitest";

import { selectExplicitMediaMentions, type NodeGenerationContext } from "./canvas-node-generation";

describe("LTX Ingredients canvas mentions", () => {
    it("keeps only media explicitly selected with @ labels", () => {
        const context: NodeGenerationContext = {
            prompt: "让图片2中的角色参考音频1讲话",
            referenceImages: [
                { id: "image-1", name: "场景.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" },
                { id: "image-2", name: "角色.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" },
            ],
            referenceVideos: [],
            referenceAudios: [
                { id: "audio-1", name: "台词.mp3", type: "audio/mpeg", url: "https://example.com/audio.mp3" },
            ],
            textCount: 0,
            imageCount: 2,
            videoCount: 0,
            audioCount: 1,
        };

        const selected = selectExplicitMediaMentions(context);

        expect(selected.referenceImages.map((item) => item.id)).toEqual(["image-2"]);
        expect(selected.referenceAudios.map((item) => item.id)).toEqual(["audio-1"]);
        expect(selected.imageCount).toBe(1);
        expect(selected.audioCount).toBe(1);
    });

    it("preserves connected media when no explicit media label is present", () => {
        const context: NodeGenerationContext = {
            prompt: "生成一个自然的短片",
            referenceImages: [
                { id: "image-1", name: "角色.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" },
            ],
            referenceVideos: [],
            referenceAudios: [],
            textCount: 0,
            imageCount: 1,
            videoCount: 0,
            audioCount: 0,
        };

        expect(selectExplicitMediaMentions(context)).toBe(context);
    });
});
