import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");

test("batch root passes its node to LoadingContent", () => {
    assert.doesNotMatch(source, /<LoadingContent theme=\{props\.theme\} \/>/);
    assert.match(source, /<LoadingContent node=\{props\.node\} theme=\{props\.theme\} \/>/);
});
