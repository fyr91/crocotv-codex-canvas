import assert from "node:assert/strict";

import { ASSET_EXPORT_BATCH_SIZE, nextAssetExportLimit, selectedAssetsInOrder } from "../src/pages/assets/asset-export-selection";

assert.equal(ASSET_EXPORT_BATCH_SIZE, 20, "the export list starts with 20 rows");
assert.equal(nextAssetExportLimit(20, 55), 40, "the export list appends one batch");
assert.equal(nextAssetExportLimit(40, 55), 55, "the export list does not exceed the asset total");
assert.deepEqual(
    selectedAssetsInOrder([{ id: "a" }, { id: "b" }, { id: "c" }], new Set(["c", "a"])).map((item) => item.id),
    ["a", "c"],
    "selected exports keep the original asset order",
);

console.log("asset export selection tests passed");
