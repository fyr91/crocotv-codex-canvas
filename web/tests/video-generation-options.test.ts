import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVideoGenerationOptions } from "../src/lib/video-generation-options.ts";

const workflow = {
    inputMode: "text",
    defaultResolution: "768x768",
    aspectRatioPresets: [
        { id: "standard", label: "标准", options: [{ label: "方形", ratio: "1:1", value: "768x768", width: 768, height: 768, recommended: true }] },
        { id: "high", label: "高清", options: [{ label: "竖屏", ratio: "9:16", value: "704x1280", width: 704, height: 1280, recommended: true }] },
    ],
    durationPresets: [{ seconds: 5, numFrames: 121, actualSeconds: 5, enabled: true }],
    batchMaxItems: 4,
};
const ltxConfig = { capabilitiesSource: "ltx-fixed", ltxCapabilities: { provider: "ltx", workflows: [workflow], videoInputModes: ["text"], batchMaxItems: 4, supportsIdempotency: false } };
const seedanceConfig = { videoSettings: { qualities: [{ id: "720p", label: "720p", ratios: [{ label: "横屏", ratio: "16:9", size: "1280x720", width: 1280, height: 720 }] }], durations: [4, 8], counts: [1, 2] } };

test("LTX exposes ratio groups separately from its internal quality mapping", () => {
    const options = normalizeVideoGenerationOptions("ltx", ltxConfig, { inputMode: "text", size: "768x768", duration: "5", count: 2 });
    assert.deepEqual(options.qualities.map((item) => item.id), ["standard", "high"]);
    assert.deepEqual(options.aspectRatios?.map((item) => item.label), ["方形", "竖屏"]);
});

test("ratio selection does not change LTX quality", () => {
    const options = normalizeVideoGenerationOptions("ltx", ltxConfig, { inputMode: "text", quality: "high", size: "704x1280", duration: "5", count: 2 });
    assert.equal(options.selection.quality, "high");
    assert.equal(options.selection.size, "704x1280");
});

test("each model uses its own durations and counts", () => {
    assert.deepEqual(normalizeVideoGenerationOptions("ltx", ltxConfig, { inputMode: "text" }).durations, [5]);
    assert.deepEqual(normalizeVideoGenerationOptions("ark", seedanceConfig, {}).counts, [1, 2]);
});

test("LTX exposes every server resolution under its ratio and ignores other sizes", () => {
    const config = {
        capabilitiesSource: "ltx-fixed",
        ltxCapabilities: {
            provider: "ltx",
            videoInputModes: ["text"],
            batchMaxItems: 3,
            supportsIdempotency: false,
            workflows: [{
                ...workflow,
                durationPresets: [5, 20, 30].map((seconds) => ({ seconds, numFrames: seconds * 24 + 1, actualSeconds: seconds, enabled: true })),
                aspectRatioPresets: [
                    { id: "landscape", label: "横屏", ratio: "16:9", options: [{ id: "standard", label: "标准", value: "1024x576", width: 1024, height: 576 }, { id: "hd", label: "高清", value: "1280x704", width: 1280, height: 704 }] },
                    { id: "portrait", label: "竖屏", ratio: "9:16", options: [
                        { id: "standard", label: "标准", value: "576x1024", width: 576, height: 1024 },
                        { id: "clear", label: "清晰", value: "832x1472", width: 832, height: 1472, deliveryWidth: 828, deliveryHeight: 1472, maxDurationSeconds: 20 },
                        { id: "hd", label: "高清", value: "1088x1920", width: 1088, height: 1920, deliveryWidth: 1080, deliveryHeight: 1920, maxDurationSeconds: 20 },
                    ] },
                    { id: "other", label: "其他", ratio: "GPU", options: [{ id: "768x512", label: "768 × 512", value: "768x512", width: 768, height: 512 }] },
                ],
            }],
        },
    };
    const options = normalizeVideoGenerationOptions("ltx", config, { inputMode: "text", quality: "high", size: "1088x1920", duration: "30" });
    assert.deepEqual(options.qualities[0].ratios.map((item) => item.size), ["1024x576", "576x1024"]);
    assert.deepEqual(options.qualities.map((item) => item.id), ["standard", "clear", "high"]);
    assert.deepEqual(options.aspectRatios?.find((item) => item.id === "portrait")?.resolutions.map((item) => item.size), ["576x1024", "832x1472", "1088x1920"]);
    assert.equal(options.aspectRatios?.find((item) => item.id === "portrait")?.resolutions[2].deliveryWidth, 1080);
    assert.deepEqual(options.durations, [5, 20]);
    assert.equal(options.selection.duration, 20);
    assert.equal(options.qualities.flatMap((item) => item.ratios).some((item) => item.size === "768x512"), false);
});
