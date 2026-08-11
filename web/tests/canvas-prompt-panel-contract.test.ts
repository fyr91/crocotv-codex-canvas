import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync(new URL("../src/types/canvas.ts", import.meta.url), "utf8");
const node = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const promptPanel = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/components/canvas/canvas-config-composer.tsx", import.meta.url), "utf8");

assert.match(types, /promptPanelWidth\?: number/);
assert.match(types, /promptPanelContentHeight\?: number/);
assert.match(types, /promptPanelOffsetX\?: number/);
assert.match(node, /resizePromptPanel/);
assert.match(node, /onPanelResize/);
assert.match(node, /edge="left"/);
assert.match(node, /edge="right"/);
assert.match(node, /edge="bottom"/);
assert.match(node, /edge="bottom-left"/);
assert.match(node, /edge="bottom-right"/);
assert.match(project, /promptPanelWidth/);
assert.match(project, /promptPanelContentHeight/);
assert.match(project, /promptPanelOffsetX/);
assert.match(project, /const handlePromptPanelResize = useCallback/);
assert.match(project, /onPanelResize=\{handlePromptPanelResize\}/);
assert.match(promptPanel, /contentHeight/);
assert.match(promptPanel, /shrink-0/);
assert.match(composer, /contentHeight/);

console.log("canvas prompt panel contract tests passed");
