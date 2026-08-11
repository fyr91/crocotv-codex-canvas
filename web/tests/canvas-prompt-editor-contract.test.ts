import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendCanvasPromptBlock, isCanvasPromptValueAllowed, parseCanvasPromptReferenceTokens, shouldRenderCanvasPromptValue } from "../src/lib/canvas/prompt-editor-state";

const shared = readFileSync(new URL("../src/components/canvas/canvas-prompt-editor.tsx", import.meta.url), "utf8");
const config = readFileSync(new URL("../src/components/canvas/canvas-config-composer.tsx", import.meta.url), "utf8");
const resource = readFileSync(new URL("../src/components/canvas/canvas-resource-mention-textarea.tsx", import.meta.url), "utf8");

assert.match(shared, /contentEditable/);
assert.match(shared, /cursor-text/);
assert.match(shared, /overflow-y-auto/);
assert.match(shared, /data-reference-key/);
assert.match(shared, /shouldRenderCanvasPromptValue/);
assert.match(shared, /createPortal/);
assert.match(shared, /document\.body/);
assert.match(shared, /className="fixed z-\[9999\]/);
assert.match(config, /CanvasPromptEditor/);
assert.match(resource, /CanvasPromptEditor/);

assert.equal(shouldRenderCanvasPromptValue(true, true, "zhong", ""), false);
assert.equal(shouldRenderCanvasPromptValue(true, false, "中文", "中文"), false);
assert.equal(shouldRenderCanvasPromptValue(true, false, "旧值", "外部新值"), true);
assert.equal(shouldRenderCanvasPromptValue(false, false, "旧值", "外部新值"), true);
assert.equal(isCanvasPromptValueAllowed("1234", 4), true);
assert.equal(isCanvasPromptValueAllowed("12345", 4), false);
assert.equal(appendCanvasPromptBlock("第一行", "\n", true), "第一行\n");
assert.equal(appendCanvasPromptBlock("第一行\n", "\n", true), "第一行\n\n");
assert.deepEqual(parseCanvasPromptReferenceTokens("前缀 文本1 后缀", [{ key: "text-node", label: "文本1" }], true), [
    { type: "text", value: "前缀 " },
    { type: "reference", key: "text-node" },
    { type: "text", value: " 后缀" },
]);

console.log("canvas prompt editor contract tests passed");
