import { describe, expect, it } from "vitest";
import { normalizeVideoInputModes, resolveVideoFramePair, stripNonTextComposerReferences, videoInputModeOptions } from "./video-input-mode";

describe("resolveVideoFramePair", () => {
    it("uses the first frame again when no last frame is selected", () => {
        const first = { id: "image-1" };
        expect(resolveVideoFramePair(first)).toEqual([first, first]);
    });
});

describe("HappyHorse video modes", () => {
    it("keeps reference-image and video-edit modes in model capability order", () => {
        expect(normalizeVideoInputModes(["text", "referenceImages", "videoEdit"])).toEqual(["text", "referenceImages", "videoEdit"]);
        expect(videoInputModeOptions).toEqual(expect.arrayContaining([
            { value: "referenceImages", label: "参考图生视频" },
            { value: "videoEdit", label: "视频编辑" },
        ]));
    });

    it("keeps inline image tokens while removing unsupported video tokens", () => {
        expect(stripNonTextComposerReferences(
            "@[node:text] @[node:image] @[node:video]",
            [
                { nodeId: "text", type: "text" },
                { nodeId: "image", type: "image" },
                { nodeId: "video", type: "video" },
            ],
            ["text", "image"],
        )).toBe("@[node:text] @[node:image] ");
    });
});
