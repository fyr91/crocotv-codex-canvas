import { describe, expect, it } from "vitest";

import { resolveMiniMaxH3InlineReferences } from "./minimax-h3-inline-references";

describe("resolveMiniMaxH3InlineReferences", () => {
    const inputs = [
        { nodeId: "text-1", type: "text" as const, label: "文本1", text: "一只鳄鱼" },
        { nodeId: "image-1", type: "image" as const, label: "图片1" },
        { nodeId: "image-2", type: "image" as const, label: "图片2" },
        { nodeId: "audio-1", type: "audio" as const, label: "音频1" },
    ];

    it("rewrites stable canvas references to official H3 Picture and Audio tags", () => {
        expect(resolveMiniMaxH3InlineReferences(
            "@[node:text-1]参考@[node:image-2]和@[node:image-1]，声音参考@[node:audio-1]，再次出现@[node:image-2]",
            inputs,
        )).toEqual({
            prompt: "一只鳄鱼参考<Picture 1>和<Picture 2>，声音参考<Audio 1>，再次出现<Picture 1>",
            imageNodeIds: ["image-2", "image-1"],
            audioNodeIds: ["audio-1"],
        });
    });

    it("rejects disconnected references and reference videos", () => {
        expect(resolveMiniMaxH3InlineReferences("@[node:missing]", inputs)).toEqual({ error: "提示词引用的素材已断开，请移除或重新连接" });
        expect(resolveMiniMaxH3InlineReferences("@[node:video-1]", [{ nodeId: "video-1", type: "video" }])).toEqual({ error: "MiniMax H3 多参考暂不支持参考视频" });
    });

    it("requires at least one image or audio mention", () => {
        expect(resolveMiniMaxH3InlineReferences("@[node:text-1]", inputs)).toEqual({ error: "MiniMax H3 多参考至少需要引用一张图片或一段音频" });
    });
});
