import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const picker = readFileSync(new URL("../src/components/canvas/asset-picker-modal.tsx", import.meta.url), "utf8");
const toolbar = readFileSync(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

assert.match(picker, /我的素材/);
assert.match(picker, /共享素材/);
assert.match(picker, /listSharedCloudAssets/);
assert.match(picker, /label: "音频", value: "audio"/);
assert.match(picker, /kind: "audio"/);
assert.match(toolbar, /label="素材"/);
assert.match(toolbar, /if \(id === "tool-assets"\) return "素材"/);
assert.match(page, /payload\.audioKind === "music"/);
assert.match(page, /CanvasNodeType\.Audio/);
assert.match(page, /CanvasNodeType\.Music/);

console.log("canvas shared assets contract tests passed");
