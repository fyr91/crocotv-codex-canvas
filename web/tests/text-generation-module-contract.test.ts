import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toolbar = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const callbackStart = project.indexOf("const generateImageFromTextNode");
const callbackEnd = project.indexOf("const insertAssistantImage", callbackStart);
const callback = project.slice(callbackStart, callbackEnd);

assert.ok(callbackStart >= 0 && callbackEnd > callbackStart);
assert.match(toolbar, /id: "generateImage", title: "生成", label: "生成", icon: <Blocks className="size-4" \/>/);
assert.doesNotMatch(toolbar, /Image as ImageIcon/);
assert.doesNotMatch(callback, /if \(!prompt\)/);
assert.doesNotMatch(callback, /文本节点为空，无法生图/);
assert.match(callback, /CanvasNodeType\.Config/);
assert.match(callback, /fromNodeId: sourceNode\.id, toNodeId: configNode\.id/);
assert.match(callback, /setDialogNodeId\(configNode\.id\)/);

console.log("text generation module contract tests passed");
