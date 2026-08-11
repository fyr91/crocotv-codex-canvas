import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../src/stores/use-asset-store.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/assets/index.tsx", import.meta.url), "utf8");

assert.match(store, /sharedAt: string \| null/);
assert.match(store, /setAssetShared: \(id: string, shared: boolean\) => Promise<void>/);
assert.match(store, /export function assetFromCloudAsset/);
assert.match(page, /已共享/);
assert.match(page, /取消共享/);
assert.match(page, /共享/);

console.log("shared assets page contract tests passed");
