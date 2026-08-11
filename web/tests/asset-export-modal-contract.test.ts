import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/pages/assets/components/asset-export-modal.tsx", import.meta.url), "utf8");

assert.match(source, /IntersectionObserver/, "the export list loads more rows from an observer sentinel");
assert.match(source, /overflow-y-auto/, "only the asset list scrolls vertically");
assert.match(source, /loading="lazy"/, "image and audio-cover previews use native lazy loading");
assert.match(source, /preload="metadata"/, "rendered video previews only preload metadata");
assert.match(source, /indeterminate=\{/, "the select-all checkbox exposes a partial selection state");
assert.match(source, /selectedAssetsInOrder/, "partial exports keep the page asset order");
assert.match(source, /导出全部（\{assets\.length\}）/, "the fixed footer exposes a full export action");
assert.match(source, /导出已选（\{selectedIds\.size\}）/, "the fixed footer exposes a selected export action");
assert.match(source, /disabled=\{!selectedIds\.size \|\| exporting\}/, "partial export is disabled when nothing is selected");

console.log("asset export modal contract tests passed");
