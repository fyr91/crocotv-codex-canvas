import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync(new URL("../src/types/canvas.ts", import.meta.url), "utf8");
const node = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const toolbar = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

assert.match(types, /framePickerSourceNodeId\?: string/);
assert.match(types, /framePickerTime\?: number/);
assert.match(types, /sourceVideoNodeId\?: string/);
assert.match(node, /framePickerSourceNodeId/);
assert.match(toolbar, /onUseMiddleFrame: \(node: CanvasNodeData\) => void/);
assert.match(toolbar, /id: "useMiddleFrame", title: "使用中间帧", label: "使用中间帧"/);
assert.match(toolbar, /hasVideo \? \[\{ id: "useMiddleFrame"/);
assert.match(project, /const createVideoMiddleFramePicker = useCallback/);
assert.match(project, /title: "选择视频帧"/);
assert.match(project, /framePickerSourceNodeId: sourceNode\.id/);
assert.match(project, /fromNodeId: sourceNode\.id, toNodeId: frameNode\.id/);
assert.match(project, /<CanvasVideoFramePicker/);
assert.match(project, /uploadImage\(result\.blob, \{ compress: false \}\)/);
assert.match(project, /title: "视频中间帧"/);
assert.match(project, /addAsset\(\{ kind: "image", title: "视频中间帧"/);
assert.match(project, /onUseMiddleFrame=\{createVideoMiddleFramePicker\}/);

console.log("video middle frame canvas contract tests passed");
