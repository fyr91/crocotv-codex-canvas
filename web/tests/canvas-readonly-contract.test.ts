import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const node = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");

assert.match(page, /isCanvasReadOnly\(currentProject, profile\?\.id \|\| ""\)/);
assert.match(page, /if \(!projectLoaded \|\| isReadOnly\) return;/);
assert.match(page, /readOnly=\{isReadOnly\}/);
assert.match(page, /\{!isReadOnly \? \(\s*<CanvasToolbar/);
assert.match(page, /onDrop=\{isReadOnly \? undefined : handleDrop\}/);
assert.doesNotMatch(page, /message\.warning\(saveError\)/);
assert.match(node, /readOnly\?: boolean/);
assert.match(node, /\{!readOnly \? <ResizeHandle/);
assert.match(node, /showPanel && !readOnly/);

console.log("canvas readonly contract tests passed");
