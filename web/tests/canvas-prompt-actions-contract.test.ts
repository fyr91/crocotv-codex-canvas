import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toolbar = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/canvas/canvas-prompt-editor.tsx", import.meta.url), "utf8");
const textarea = readFileSync(new URL("../src/components/canvas/canvas-resource-mention-textarea.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const music = readFileSync(new URL("../src/components/canvas/canvas-music-settings-panel.tsx", import.meta.url), "utf8");

const copyIndex = toolbar.indexOf('{ id: "copyPrompt"');
const saveIndex = toolbar.indexOf('{ id: "savePrompt"');

assert.ok(copyIndex >= 0, "统一工具栏应包含复制提示词");
assert.ok(saveIndex > copyIndex, "复制提示词应位于收藏提示词之前");
assert.match(toolbar, /const prompt = canvasNodePrompt\(node\)/);
assert.match(toolbar, /copyText\(prompt, "提示词已复制"\)/);
assert.match(toolbar, /filter\(\(tool\) => tool\.id !== "copyPrompt"\)/, "图片专属工具不应重复渲染复制入口");
assert.match(toolbar, /isMedia \? "复制生成提示词" : "复制提示词"/, "媒体节点应明确复制的是生成提示词");
assert.match(editor, /cornerAction\?: ReactNode;/, "提示词编辑器应支持内部右上角操作");
assert.match(editor, /\{cornerAction\}/, "内部操作应渲染在编辑区域容器中");
assert.match(textarea, /copyCurrentInput\?: boolean;/);
assert.match(textarea, /copyText\(value, "当前输入已复制"\)/);
assert.match(textarea, /aria-label="复制当前输入"/);
assert.match(textarea, /disabled=\{!copyValue\}/, "空输入时复制按钮应禁用");
assert.match(textarea, /!pr-12/, "输入文字应避开右上角复制按钮");
assert.doesNotMatch(textarea, /onPointerDown=\{\(event\) => \{\s*event\.preventDefault\(\);/, "pointerdown 不能取消按钮后续点击");
assert.match(textarea, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/, "pointerdown 只阻止画布收到事件");
assert.match(panel, /copyCurrentInput=\{mode === "image" \|\| mode === "video" \|\| mode === "audio"\}/, "三类普通媒体输入应显示内部复制按钮");
assert.equal((music.match(/copyCurrentInput/g) || []).length, 2, "音乐描述和歌词都应提供内部复制按钮");

console.log("canvas prompt actions contract tests passed");
