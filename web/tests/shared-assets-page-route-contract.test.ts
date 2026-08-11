import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const navigationSource = readFileSync(new URL("../src/constant/navigation-tools.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/pages/shared-assets/index.tsx", import.meta.url), "utf8");

assert.match(navigationSource, /slug: "shared-assets"/, "the shared asset collection appears in the main navigation");
assert.match(navigationSource, /label: "共享素材"/, "the navigation uses the requested Chinese label");
assert.match(routerSource, /path: "\/shared-assets"/, "the shared assets page has its own route");
assert.match(pageSource, /listSharedCloudAssets/, "the page loads the company shared asset collection");
assert.match(pageSource, /\["image", "video", "audio"\]/, "the page only displays supported media assets");
assert.match(pageSource, /Pagination/, "the page keeps the paginated My Assets browsing pattern");
assert.match(pageSource, /Drawer/, "shared asset details remain viewable");
assert.doesNotMatch(pageSource, /编辑|删除|取消共享|导出素材/, "the shared collection stays read-only");

console.log("shared assets page route contract tests passed");
