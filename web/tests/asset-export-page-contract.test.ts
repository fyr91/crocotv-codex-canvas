import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/pages/assets/index.tsx", import.meta.url), "utf8");

assert.match(source, /import \{ AssetExportModal \}/, "the assets page uses the selective export modal");
assert.match(source, /setExportModalOpen\(true\)/, "the export link opens a modal instead of creating a zip immediately");
assert.match(source, /<AssetExportModal/, "the selective export modal is mounted on the assets page");
assert.match(source, /onExport=\{exportSelectedAssets\}/, "the modal exports the exact asset selection it receives");
assert.match(source, /await exportAssets\(selectedAssets\)/, "full and partial export share the existing CrocoTV zip writer");
assert.doesNotMatch(source, /onClick=\{\(\) => void exportAllAssets\(\)\}/, "the page no longer exports everything from the link click");

console.log("asset export page contract tests passed");
