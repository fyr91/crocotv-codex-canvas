import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync(new URL("../src/types/canvas.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

assert.match(types, /promptDraft\?: string;/, "媒体节点需要独立保存当前输入草稿");
assert.match(panel, /node\.metadata\?\.promptDraft \?\? node\.metadata\?\.prompt \?\? ""/, "媒体编辑器应优先回填草稿，再回退生成提示词");
assert.match(panel, /const isEditingExistingContent = hasTextContent;/, "只有已有正文的文本节点使用空白修改指令");
assert.match(project, /promptDraft: prompt/, "媒体输入修改与生成节点应保留原始输入草稿");
assert.match(project, /prompt: music\.description/, "音乐生成结果应保存实际生成描述快照");
assert.match(project, /const isExistingMediaNode =/, "已有媒体再次生成时应识别并保护来源提示词");
assert.match(project, /const markSourceStatus = !isExistingMediaNode && !editingTextNode;/, "已有媒体不应在生成开始时覆盖来源提示词");

console.log("canvas media prompt contract tests passed");
