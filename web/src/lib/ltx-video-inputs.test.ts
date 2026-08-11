import { describe, expect, it } from "vitest";

import { groupLtxInputAssets } from "./ltx-video-inputs";

describe("groupLtxInputAssets", () => {
    it("keeps one asset with ingredient and both frame roles", () => {
        expect(groupLtxInputAssets([
            { assetId: "asset-1", name: "角色.png", role: "ingredient" },
            { assetId: "asset-1", name: "角色.png", role: "firstFrame" },
            { assetId: "asset-1", name: "角色.png", role: "lastFrame" },
        ])).toEqual([{
            assetId: "asset-1",
            name: "角色.png",
            roles: ["ingredient", "firstFrame", "lastFrame"],
        }]);
    });

    it("preserves first-seen asset order", () => {
        expect(groupLtxInputAssets([
            { assetId: "ingredient", name: "角色.png", role: "ingredient" },
            { assetId: "frame", name: "画面.png", role: "firstFrame" },
            { assetId: "frame", name: "画面.png", role: "lastFrame" },
        ]).map((item) => item.assetId)).toEqual(["ingredient", "frame"]);
    });

    it("uses the selected frame as the ingredient when no separate reference image exists", () => {
        expect(groupLtxInputAssets([
            { assetId: "frame", name: "首帧.png", role: "firstFrame" },
            { assetId: "audio", name: "口播.mp3", role: "audio" },
        ])).toEqual([
            { assetId: "frame", name: "首帧.png", roles: ["ingredient", "firstFrame"] },
            { assetId: "audio", name: "口播.mp3", roles: ["audio"] },
        ]);
    });
});
