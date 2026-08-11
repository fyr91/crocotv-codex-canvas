import assert from "node:assert/strict";

import { assetCardPreview } from "../src/lib/asset-preview";
import type { Asset } from "../src/stores/use-asset-store";

const base = {
    id: "asset-1",
    title: "素材",
    tags: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
};

const image = { ...base, kind: "image", coverUrl: "expired-cover", data: { dataUrl: "fresh-image", width: 1, height: 1, bytes: 1, mimeType: "image/png" } } as Asset;
const video = { ...base, kind: "video", coverUrl: "expired-cover", data: { url: "fresh-video", width: 1, height: 1, bytes: 1, mimeType: "video/mp4" } } as Asset;
const audio = { ...base, kind: "audio", coverUrl: "custom-cover", data: { url: "fresh-audio", bytes: 1, mimeType: "audio/mpeg" } } as Asset;
const text = { ...base, kind: "text", coverUrl: "", data: { content: "文本" } } as Asset;

assert.deepEqual(assetCardPreview(image), { type: "image", url: "fresh-image" }, "image preview uses the current asset URL");
assert.deepEqual(assetCardPreview(video), { type: "video", url: "fresh-video" }, "video preview uses the current asset URL");
assert.deepEqual(assetCardPreview(audio), { type: "image", url: "custom-cover" }, "audio preview keeps an explicit cover");
assert.equal(assetCardPreview(text), null, "text assets use the existing text placeholder");

console.log("asset preview tests passed");
