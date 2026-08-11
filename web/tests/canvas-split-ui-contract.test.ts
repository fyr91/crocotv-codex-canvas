import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbar = readFileSync(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/canvas/canvas-split-node-panel.tsx", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

test("canvas exposes a dedicated split entry using the lucide Split icon", () => {
    assert.match(toolbar, /Split/);
    assert.match(toolbar, /tool-split/);
    assert.match(toolbar, /onAddSplit/);
    assert.match(project, /CanvasNodeType\.Split/);
});

test("split panel filters models and provides auto or explicit count", () => {
    assert.match(panel, /selectableModelsByInputModalities/);
    assert.match(panel, /requiredInputModalities/);
    assert.match(panel, /splitCount/);
    assert.match(panel, /absolute inset-0/);
    assert.match(panel, /max=\{24\}/);
    assert.match(panel, /开始拆分/);
});

test("connection create menu can create a split node", () => {
    assert.match(project, /title="拆分"/);
    assert.match(project, /onCreate\(CanvasNodeType\.Split\)/);
});
