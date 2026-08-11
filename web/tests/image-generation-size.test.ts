import assert from "node:assert/strict";
import test from "node:test";

import { imageSizeValue, normalizeImageSizePresets, resolveImageSizeSelection } from "../src/lib/image-generation-size.ts";

const presets = normalizeImageSizePresets({
    "2K": { auto: "2K", "1:1": "2048x2048", "16:9": "2848x1600" },
    "3K": { auto: "3K", "1:1": "3072x3072", "16:9": "4096x2304" },
});

test("auto uses the resolution while a concrete ratio uses width x height", () => {
    assert.equal(imageSizeValue(presets, "2K", "auto"), "2K");
    assert.equal(imageSizeValue(presets, "3K", "16:9"), "4096x2304");
});

test("existing size values resolve back to resolution and ratio", () => {
    assert.deepEqual(resolveImageSizeSelection(presets, "2848x1600"), { resolution: "2K", ratio: "16:9", size: "2848x1600" });
    assert.deepEqual(resolveImageSizeSelection(presets, "3K"), { resolution: "3K", ratio: "auto", size: "3K" });
});

test("unsupported values fall back to the first resolution auto value", () => {
    assert.deepEqual(resolveImageSizeSelection(presets, "4K"), { resolution: "2K", ratio: "auto", size: "2K" });
});
