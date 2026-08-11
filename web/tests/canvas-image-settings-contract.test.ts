import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/components/image-settings-panel.tsx", import.meta.url), "utf8");
const popover = readFileSync(new URL("../src/components/canvas/canvas-image-settings-popover.tsx", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

test("image settings render model resolutions and ratios separately", () => {
    assert.match(panel, />分辨率</);
    assert.match(panel, />比例</);
    assert.match(panel, /imageSizePresetsForModel\(config\.model\)/);
    assert.match(panel, /imageSizeValue\(/);
});

test("the compact summary contains resolution and ratio", () => {
    assert.match(popover, /selection\.resolution/);
    assert.match(popover, /selection\.ratio/);
});

test("generation normalizes size against the selected model", () => {
    assert.match(project, /normalizeImageSizeForModel\(/);
});
