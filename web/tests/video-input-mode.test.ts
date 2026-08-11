import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVideoInputModes, resolveAutomaticLtxVideoInputMode, resolveVideoInputMode, stripNonTextComposerReferences, stripNonTextPromptReferences } from "../src/lib/video-input-mode.ts";

test("video input modes only keep known unique values", () => {
    assert.deepEqual(normalizeVideoInputModes(["multimodal", "firstFrame", "unknown", "multimodal", "firstLastFrame"]), ["multimodal", "firstFrame", "firstLastFrame"]);
    assert.deepEqual(normalizeVideoInputModes(null), []);
});

test("unsupported video input mode falls back to the first model mode", () => {
    assert.equal(resolveVideoInputMode(["firstFrame", "multimodal"], "firstLastFrame"), "firstFrame");
    assert.equal(resolveVideoInputMode(["firstFrame", "multimodal"], "multimodal"), "multimodal");
    assert.equal(resolveVideoInputMode([], undefined), "multimodal");
});

test("LTX automatically selects the workflow from frames and reference assets", () => {
    assert.equal(resolveAutomaticLtxVideoInputMode({}), "text");
    assert.equal(resolveAutomaticLtxVideoInputMode({ firstFrameNodeId: "first", referenceImageNodeIds: ["first"] }), "firstFrame");
    assert.equal(resolveAutomaticLtxVideoInputMode({ firstFrameNodeId: "first", lastFrameNodeId: "last", referenceImageNodeIds: ["first", "last"] }), "firstLastFrame");
    assert.equal(resolveAutomaticLtxVideoInputMode({ firstFrameNodeId: "first", referenceImageNodeIds: ["first"], referenceAudioCount: 1 }), "multimodal");
    assert.equal(resolveAutomaticLtxVideoInputMode({ firstFrameNodeId: "first", referenceImageNodeIds: ["first", "character"] }), "multimodal");
    assert.equal(resolveAutomaticLtxVideoInputMode({ referenceImageNodeIds: ["character"] }), "multimodal");
    assert.equal(resolveAutomaticLtxVideoInputMode({ lastFrameNodeId: "last", referenceImageNodeIds: ["last"] }), "multimodal");
});

test("frame modes remove media mentions but preserve text mentions and ordinary text", () => {
    const inputs = [
        { nodeId: "text", type: "text" as const },
        { nodeId: "image", type: "image" as const },
        { nodeId: "video", type: "video" as const },
        { nodeId: "audio", type: "audio" as const },
    ];
    assert.equal(
        stripNonTextComposerReferences("首帧 @[node:image]，参考 @[node:text] @[node:video] @[node:audio]", inputs),
        "首帧 ，参考 @[node:text]  ",
    );
});

test("frame modes remove media labels from an independent node prompt", () => {
    assert.equal(stripNonTextPromptReferences("图片1 向前移动，文本1", [{ label: "图片1", kind: "image" }, { label: "文本1", kind: "text" }]), " 向前移动，文本1");
});
