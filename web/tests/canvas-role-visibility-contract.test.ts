import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/canvas/index.tsx", import.meta.url), "utf8");

assert.match(page, /profile\?\.role === "superuser"/);
assert.match(page, /profile\?\.role === "superuser"[\s\S]*他人的画布/);

console.log("canvas role visibility contract tests passed");
