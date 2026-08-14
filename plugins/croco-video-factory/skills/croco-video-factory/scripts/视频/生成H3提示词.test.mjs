import assert from "node:assert/strict";
import test from "node:test";
import { buildDoubaoPromptRequest, h3PromptTemplate, parseDuration } from "./生成H3提示词.mjs";
import { validateShotDependencies } from "./生成H3分镜视频.mjs";

test("sends the managed document byte-for-byte as the only system message", () => {
    const systemPrompt = "最终系统提示词第一行\n\n最终系统提示词末行\n";
    const content = [{ type: "text", text: "runtime brief" }];
    const request = buildDoubaoPromptRequest({ model: "doubao", systemPrompt, content });
    assert.deepEqual(request.messages, [
        { role: "system", content: systemPrompt },
        { role: "user", content },
    ]);
    assert.equal(request.messages[0].content, systemPrompt);
    assert.equal(request.messages.filter((message) => message.role === "system").length, 1);
    assert.equal(h3PromptTemplate.templateVersion, "2.0.0");
});

test("rounds the P4 estimated generation duration upward", () => {
    assert.equal(parseDuration("预估生成时长：6.1 秒"), 7);
    assert.equal(parseDuration("预估生成时长：3 秒"), 3);
    assert.equal(parseDuration("预估生成时长：15 秒"), 15);
});

test("keeps legacy project duration fields readable", () => {
    assert.equal(parseDuration("最终视频时长：6.1 秒"), 7);
});

test("requires P6 segmentation instead of silently truncating overlong shots", () => {
    assert.throws(() => parseDuration("预估生成时长：15.1 秒"), /P6 拆分生成片段/u);
    assert.equal(parseDuration("预估生成时长：2.9 秒"), 3);
    assert.throws(() => parseDuration("预估生成时长：2 秒"), /3–15 秒整数/u);
});

test("does not invent dependencies at scene or discontinuous boundaries", () => {
    assert.equal(validateShotDependencies([
        { id: 1, folder: "001", storySegmentId: "story-1", sceneIds: ["scene-a"], continuity: { type: "independent" } },
        { id: 2, folder: "002", storySegmentId: "story-1", sceneIds: ["scene-a"], continuity: { type: "soft-continuity" } },
        { id: 3, folder: "003", storySegmentId: "story-1", sceneIds: ["scene-b"], continuity: { type: "independent" } },
    ]), true);
});

test("requires an earlier dependency only for unavoidable tail-frame continuity", () => {
    assert.throws(() => validateShotDependencies([
        { id: 1, folder: "001", storySegmentId: "story-1", sceneIds: ["scene-a"], continuity: { type: "independent" } },
        { id: 2, folder: "002", storySegmentId: "story-1", sceneIds: ["scene-a"], continuity: { type: "tail-frame" } },
    ]), /continuity 依赖不存在/u);
});
