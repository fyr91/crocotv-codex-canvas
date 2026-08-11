import { describe, expect, it } from "vitest";

import { parseCanvasPromptReferenceTokens } from "./prompt-editor-state";

const references = [
    { key: "prompt-node", label: "文本1" },
    { key: "image-node", label: "图片1" },
    { key: "audio-node", label: "音频1" },
];

describe("parseCanvasPromptReferenceTokens", () => {
    it("renders internal node references with the same chips as prompt labels", () => {
        expect(parseCanvasPromptReferenceTokens("@[node:prompt-node] + @[node:image-node] + 音频1", references, true)).toEqual([
            { type: "reference", key: "prompt-node" },
            { type: "text", value: " + " },
            { type: "reference", key: "image-node" },
            { type: "text", value: " + " },
            { type: "reference", key: "audio-node" },
        ]);
    });

    it("keeps a disconnected node token visible instead of discarding it", () => {
        expect(parseCanvasPromptReferenceTokens("@[node:missing]", references, true)).toEqual([
            { type: "text", value: "@[node:missing]" },
        ]);
    });

    it("still renders node tokens when label highlighting is disabled", () => {
        expect(parseCanvasPromptReferenceTokens("图片1 @[node:image-node]", references, false)).toEqual([
            { type: "text", value: "图片1 " },
            { type: "reference", key: "image-node" },
        ]);
    });
});
