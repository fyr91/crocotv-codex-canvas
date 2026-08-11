import { describe, expect, it } from "vitest";

import { resolveHappyHorseInlineReferences } from "./happyhorse-inline-references";

const inputs = [
    { nodeId: "jacket", type: "image" as const, label: "图片2" },
    { nodeId: "person", type: "image" as const, label: "图片1" },
    { nodeId: "text", type: "text" as const, label: "文本1", text: "保持主体动作" },
    { nodeId: "video", type: "video" as const, label: "视频1" },
];

describe("resolveHappyHorseInlineReferences", () => {
    it("numbers node-token images by first occurrence and reuses repeated numbers", () => {
        expect(resolveHappyHorseInlineReferences(
            "让 @[node:person] 穿上 @[node:jacket]，回到 @[node:person]",
            inputs,
            9,
        )).toEqual({
            prompt: "让 [Image 1] 穿上 [Image 2]，回到 [Image 1]",
            imageNodeIds: ["person", "jacket"],
        });
    });

    it("expands text node tokens without adding them to image media", () => {
        expect(resolveHappyHorseInlineReferences(
            "@[node:text]，参考 @[node:person]",
            inputs,
            9,
        )).toEqual({
            prompt: "保持主体动作，参考 [Image 1]",
            imageNodeIds: ["person"],
        });
    });

    it("supports the standalone node's existing visible-label serialization", () => {
        expect(resolveHappyHorseInlineReferences(
            "让 图片1 穿上 图片2，保持 图片1",
            inputs,
            9,
        )).toEqual({
            prompt: "让 [Image 1] 穿上 [Image 2]，保持 [Image 1]",
            imageNodeIds: ["person", "jacket"],
        });
    });

    it("keeps numbered image markers for video editing", () => {
        expect(resolveHappyHorseInlineReferences(
            "把 @[node:person] 和 @[node:jacket] 替换进视频",
            inputs,
            5,
        )).toEqual({
            prompt: "把 [Image 1] 和 [Image 2] 替换进视频",
            imageNodeIds: ["person", "jacket"],
        });
    });

    it("rejects disconnected node tokens and unsupported media tokens", () => {
        expect(resolveHappyHorseInlineReferences("@[node:missing]", inputs, 9)).toEqual({
            error: "提示词引用的素材已断开，请移除或重新连接",
        });
        expect(resolveHappyHorseInlineReferences("@[node:video]", inputs, 9)).toEqual({
            error: "当前模式的提示词只支持引用文字和图片",
        });
    });

    it("rejects image counts above the mode limit", () => {
        const imageInputs = Array.from({ length: 6 }, (_, index) => ({
            nodeId: `image-${index}`,
            type: "image" as const,
        }));
        expect(resolveHappyHorseInlineReferences(
            imageInputs.map((input) => `@[node:${input.nodeId}]`).join(" "),
            imageInputs,
            5,
        )).toEqual({ error: "最多引用 5 张参考图" });
    });
});
