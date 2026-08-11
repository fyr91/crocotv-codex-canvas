import assert from "node:assert/strict";

import { resizePromptPanel } from "../src/lib/canvas/prompt-panel-resize";

const start = { width: 500, contentHeight: 112, offsetX: 0 };

assert.deepEqual(resizePromptPanel(start, "right", 100, 0, 1), { width: 600, contentHeight: 112, offsetX: 50 });
assert.deepEqual(resizePromptPanel(start, "left", -100, 0, 1), { width: 600, contentHeight: 112, offsetX: -50 });
assert.deepEqual(resizePromptPanel(start, "bottom", 0, 100, 1), { width: 500, contentHeight: 212, offsetX: 0 });
assert.deepEqual(resizePromptPanel(start, "bottom-right", 100, 100, 2), { width: 550, contentHeight: 162, offsetX: 25 });
assert.deepEqual(resizePromptPanel(start, "bottom-left", 1000, -1000, 1), { width: 420, contentHeight: 112, offsetX: 40 });
assert.deepEqual(resizePromptPanel(start, "bottom-right", 1000, 1000, 1), { width: 960, contentHeight: 600, offsetX: 230 });

console.log("canvas prompt panel resize tests passed");
