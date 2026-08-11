import assert from "node:assert/strict";

import { canvasNodePrompt, promptTitle } from "../src/lib/canvas/prompt";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node = (type: CanvasNodeType, metadata: CanvasNodeData["metadata"]): CanvasNodeData => ({ id: type, type, title: type, position: { x: 0, y: 0 }, width: 100, height: 100, metadata });

assert.equal(canvasNodePrompt(node(CanvasNodeType.Text, { content: "  文本提示词  ", prompt: "备用" })), "文本提示词");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Config, { composerContent: "  配置内容  ", prompt: "备用" })), "配置内容");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Config, { composerContent: " ", prompt: "配置备用" })), "配置备用");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Config, { generationMode: "music", musicDescription: "音乐描述", musicLyrics: "歌词" })), "音乐描述");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Image, { prompt: "图片提示词" })), "图片提示词");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Video, { prompt: "视频提示词" })), "视频提示词");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Audio, { prompt: "音频提示词" })), "音频提示词");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Music, { prompt: "生成时的音乐描述", musicDescription: "当前编辑的音乐描述", musicLyrics: "当前歌词" })), "生成时的音乐描述");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Music, { musicDescription: "当前编辑的音乐描述", musicLyrics: "当前歌词" })), "");
assert.equal(canvasNodePrompt(node(CanvasNodeType.Group, { prompt: "不应收藏" })), "");
assert.equal(promptTitle("\n  第一行   标题  \n第二行"), "第一行 标题");
assert.equal(promptTitle("123456789012345678901234567890123456789012345"), "1234567890123456789012345678901234567890");
assert.equal(promptTitle("  "), "未命名提示词");

console.log("canvas prompt tests passed");
