import { describe, expect, it } from "vitest";

import { buildInspirationTopicInput, validateInspirationNotes } from "./content-inspiration";

describe("content inspiration", () => {
    it("requires the uploader to explain why the asset is useful", () => {
        expect(() => validateInspirationNotes("  ")).toThrow("请说明为什么把这个素材作为灵感");
        expect(validateInspirationNotes("这个儿童 MV 的互动副歌形式值得复用")).toBe("这个儿童 MV 的互动副歌形式值得复用");
    });

    it("preserves asset and inspiration lineage when creating a topic", () => {
        expect(buildInspirationTopicInput({
            assetId: "asset-1",
            inspirationId: "inspiration-1",
            assetTitle: "儿童音乐 MV",
            notes: "互动副歌形式",
        })).toMatchObject({
            title: "儿童音乐 MV",
            originalTopic: "互动副歌形式",
            sourceType: "inspiration",
            sourceAssetId: "asset-1",
            sourceInspirationId: "inspiration-1",
        });
    });
});
