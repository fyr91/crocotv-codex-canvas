import { describe, expect, it } from "vitest";

import { buildDeliveryManifest } from "./content-delivery";

describe("buildDeliveryManifest", () => {
    it("keeps multiple selected clips per shot and assigns deterministic Take numbers", () => {
        const manifest = buildDeliveryManifest({
            topic: { id: "topic-1", title: "孩子为什么不听话？" },
            owner: { id: "user-1", name: "小鳄鱼" },
            createdAt: "2026-07-24T12:00:00.000Z",
            clips: [
                { artifactId: "a-2", assetId: "asset-2", shotId: "shot-1", shotNumber: 1, shotTitle: "开场", source: "upload", mimeType: "video/quicktime", selectedAt: "2026-07-24T11:01:00.000Z" },
                { artifactId: "a-1", assetId: "asset-1", shotId: "shot-1", shotNumber: 1, shotTitle: "开场", source: "ai", mimeType: "video/mp4", selectedAt: "2026-07-24T11:00:00.000Z" },
                { artifactId: "a-3", assetId: "asset-3", shotId: "shot-2", shotNumber: 2, shotTitle: "反转", source: "ai", mimeType: "video/mp4", selectedAt: "2026-07-24T11:02:00.000Z" },
            ],
        });

        expect(manifest.clips.map((clip) => clip.fileName)).toEqual([
            "S01-开场-Take01.mp4",
            "S01-开场-Take02.mov",
            "S02-反转-Take01.mp4",
        ]);
        expect(manifest.clips[0].source).toBe("ai");
        expect(manifest.clipCount).toBe(3);
    });

    it("creates a valid empty snapshot when the Owner knowingly downloads without clips", () => {
        const manifest = buildDeliveryManifest({
            topic: { id: "topic-1", title: "测试" },
            owner: { id: "user-1", name: "Owner" },
            createdAt: "2026-07-24T12:00:00.000Z",
            clips: [],
        });
        expect(manifest.clipCount).toBe(0);
        expect(manifest.clips).toEqual([]);
    });
});
