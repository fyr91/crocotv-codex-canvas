import { describe, expect, it } from "vitest";

import { orderedVideoInputAssetIds, validateVideoEditReferenceAlignment } from "./video-input-assets";

describe("orderedVideoInputAssetIds", () => {
    it("places the explicit edit video before optional reference images", () => {
        expect(orderedVideoInputAssetIds("videoEdit", ["image-2", "image-1"], ["video-2"], [])).toEqual(["video-2", "image-2", "image-1"]);
    });

    it("keeps image-first ordering for reference-image generation", () => {
        expect(orderedVideoInputAssetIds("referenceImages", ["image-2", "image-1"], [], [])).toEqual(["image-2", "image-1"]);
    });

    it("rejects an edit prompt that references images when none are submitted", () => {
        expect(() => validateVideoEditReferenceAlignment("videoEdit", "把角色换成参考图片1", [])).toThrow("视频编辑提示词引用了图片，但请求中没有参考图片");
    });
});
