import { describe, expect, it } from "vitest";

import { normalizeVideoGenerationOptions, videoPromptLengthError } from "./video-generation-options";
import { activeVideoModel, bindActiveVideoModel, usesLtxDirectPreview } from "./video-model";

const config = {
    videoSettingsByInputMode: {
        text: {
            qualities: [{ id: "1080P", label: "1080P", ratios: [{ label: "16:9", ratio: "16:9", size: "16:9", recommended: true }] }],
            durations: [3, 5, 15],
            counts: [1],
            supports: { watermark: true },
        },
        firstFrame: {
            qualities: [{ id: "1080P", label: "1080P", ratios: [{ label: "跟随首帧", size: "source", recommended: true }] }],
            durations: [3, 5, 15],
            counts: [1],
            supports: { watermark: true },
        },
        videoEdit: {
            qualities: [{ id: "1080P", label: "1080P", ratios: [{ label: "跟随原视频", size: "source", recommended: true }] }],
            durations: [],
            counts: [1],
            supports: { watermark: true, audioSetting: true },
        },
    },
};

const ltxConfig = {
    capabilitiesSource: "ltx-fixed",
    ltxCapabilities: {
        provider: "ltx",
        videoInputModes: ["text"],
        batchMaxItems: 4,
        workflows: [{
            inputMode: "text",
            defaultResolution: "576x1024",
            defaultNumFrames: 121,
            batchMaxItems: 4,
            supportsStage1ManualReview: true,
            aspectRatioPresets: [
                {
                    id: "portrait",
                    label: "竖屏",
                    ratio: "9:16",
                    options: [
                        { id: "standard", label: "标准", value: "576x1024", width: 576, height: 1024 },
                        { id: "clear", label: "清晰", value: "832x1472", width: 832, height: 1472, deliveryWidth: 828, deliveryHeight: 1472, maxDurationSeconds: 20 },
                        { id: "hd", label: "高清", value: "1088x1920", width: 1088, height: 1920, deliveryWidth: 1080, deliveryHeight: 1920, maxDurationSeconds: 20 },
                    ],
                },
                { id: "other", label: "其他尺寸", ratio: "GPU 可用", options: [{ id: "1024x576", label: "1024 × 576", value: "1024x576", width: 1024, height: 576 }] },
            ],
            durationPresets: [5, 20, 30].map((seconds) => ({ seconds, numFrames: seconds * 24 + 1, enabled: true })),
        }],
    },
};

const minimaxH3Config = {
    capabilitiesSource: "minimax-h3-fixed-v3",
    maxPromptChars: 20_000,
    videoSettingsByInputMode: Object.fromEntries(["text", "firstFrame", "multimodal"].map((mode) => [mode, {
        qualities: [
            { id: "preview", label: "480p", ratios: [{ label: "480p", ratio: "16:9", size: "864x480", width: 864, height: 480, recommended: true }] },
            { id: "base_768p", label: "720p", ratios: [{ label: "720p", ratio: "16:9", size: "1344x768", width: 1344, height: 768 }] },
            { id: "standard_480p", label: "480p", ratios: [{ label: "480p", ratio: "4:3", size: "640x480", width: 640, height: 480 }] },
            { id: "standard_768p", label: "720p", ratios: [{ label: "720p", ratio: "4:3", size: "1024x768", width: 1024, height: 768 }] },
            { id: "portrait_preview", label: "480p", ratios: [{ label: "480p", ratio: "9:16", size: "480x864", width: 480, height: 864 }] },
            { id: "portrait_768p", label: "720p", ratios: [{ label: "720p", ratio: "9:16", size: "768x1344", width: 768, height: 1344 }] },
            { id: "standard_portrait_480p", label: "480p", ratios: [{ label: "480p", ratio: "3:4", size: "480x640", width: 480, height: 640 }] },
            { id: "standard_portrait_768p", label: "720p", ratios: [{ label: "720p", ratio: "3:4", size: "768x1024", width: 768, height: 1024 }] },
        ],
        durations: [3, 4, 5, 15],
        counts: [1, 2, 3],
        supports: { promptEnhance: true },
    }])),
};

describe("normalizeVideoGenerationOptions", () => {
    it("uses the selected video model instead of a stale generic model", () => {
        expect(activeVideoModel({ model: "ark-video", videoModel: "happyhorse" })).toBe("happyhorse");
    });

    it("keeps a node-selected video model consistent through submission", () => {
        expect(bindActiveVideoModel({ model: "ark-video", videoModel: "ark-video" }, "happyhorse")).toMatchObject({
            model: "happyhorse",
            videoModel: "happyhorse",
        });
    });

    it("only restores LTX jobs through the LTX preview endpoint", () => {
        expect(usesLtxDirectPreview("ltx")).toBe(true);
        expect(usesLtxDirectPreview("happyhorse")).toBe(false);
        expect(usesLtxDirectPreview("ark")).toBe(false);
    });

    it("uses the selected input mode settings", () => {
        const options = normalizeVideoGenerationOptions("happyhorse", config, { inputMode: "firstFrame", quality: "1080P", size: "16:9", duration: "5", count: 1 });
        expect(options.selection.size).toBe("source");
        expect(options.durations).toEqual([3, 5, 15]);
    });

    it("exposes edit-only sound settings without duration", () => {
        const options = normalizeVideoGenerationOptions("happyhorse", config, { inputMode: "videoEdit", quality: "1080P", size: "source", duration: "5", count: 1 });
        expect(options.durations).toEqual([]);
        expect(options.supports.audioSetting).toBe(true);
    });

    it("shows all LTX resolutions after selecting an aspect ratio and clamps their duration", () => {
        const options = normalizeVideoGenerationOptions("ltx", ltxConfig, { inputMode: "text", size: "1088x1920", duration: "30", count: 1 });
        expect(options.aspectRatios?.[0].resolutions.map((item) => item.size)).toEqual(["576x1024", "832x1472", "1088x1920"]);
        expect(options.aspectRatios?.[0].resolutions[2]).toMatchObject({ deliveryWidth: 1080, deliveryHeight: 1920, maxDurationSeconds: 20 });
        expect(options.durations).toEqual([5, 20]);
        expect(options.selection).toMatchObject({ quality: "high", size: "1088x1920", duration: 20 });
        expect(options.supports.stage1Review).toBe(true);
    });

    it("keeps an explicitly selected exact 16:9 LTX resolution from the other group", () => {
        const options = normalizeVideoGenerationOptions("ltx", ltxConfig, { inputMode: "text", size: "1024x576", duration: "5", count: 1 });

        expect(options.selection.size).toBe("1024x576");
        expect(options.aspectRatios?.find((item) => item.id === "other")?.ratio).toBe("16:9");
    });

    it("exposes all eight H3 output profiles grouped by ratio and resolution", () => {
        const options = normalizeVideoGenerationOptions("minimax_h3", minimaxH3Config, { inputMode: "multimodal", quality: "standard_portrait_768p", size: "768x1024", duration: "15", count: 3 });

        expect(options.error).toBeUndefined();
        expect(options.aspectRatios?.map((item) => item.id)).toEqual(["16:9", "4:3", "9:16", "3:4"]);
        expect(options.aspectRatios?.map((item) => item.resolutions.map((resolution) => [resolution.label, resolution.size, resolution.qualityId]))).toEqual([
            [["480p", "864x480", "preview"], ["720p", "1344x768", "base_768p"]],
            [["480p", "640x480", "standard_480p"], ["720p", "1024x768", "standard_768p"]],
            [["480p", "480x864", "portrait_preview"], ["720p", "768x1344", "portrait_768p"]],
            [["480p", "480x640", "standard_portrait_480p"], ["720p", "768x1024", "standard_portrait_768p"]],
        ]);
        expect(options.selection).toEqual({ quality: "standard_portrait_768p", size: "768x1024", duration: 15, count: 3 });
        expect(options.supports.promptEnhance).toBe(true);
    });

    it("fails closed when the H3 fixed output profile version is stale", () => {
        const options = normalizeVideoGenerationOptions("minimax_h3", { ...minimaxH3Config, capabilitiesSource: "minimax-h3-fixed-v1" }, { inputMode: "text" });

        expect(options.error).toContain("同步模型配置");
        expect(options.aspectRatios).toBeUndefined();
    });

    it("rejects an H3 prompt above the configured 20000 character limit", () => {
        expect(videoPromptLengthError("minimax_h3", minimaxH3Config, "x".repeat(20_000))).toBeUndefined();
        expect(videoPromptLengthError("minimax_h3", minimaxH3Config, "x".repeat(20_001))).toBe("MiniMax H3 提示词不能超过 20000 字符（当前 20001 字符）");
        expect(videoPromptLengthError("ltx", minimaxH3Config, "x".repeat(20_001))).toBeUndefined();
    });
});
