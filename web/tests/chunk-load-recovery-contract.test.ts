import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");

assert.match(mainSource, /vite:preloadError/, "stale deployment chunks trigger recovery");
assert.match(mainSource, /sessionStorage/, "chunk recovery is guarded against reload loops");
assert.match(mainSource, /preventDefault\(\)/, "the stale chunk error is suppressed before reloading");
assert.match(routerSource, /errorElement:/, "route errors use a project-owned fallback page");

console.log("chunk load recovery contract tests passed");
