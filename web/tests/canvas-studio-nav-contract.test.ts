import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canvasProject = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const appTopNav = readFileSync(new URL("../src/components/layout/app-top-nav.tsx", import.meta.url), "utf8");
const studioOrigin = readFileSync(new URL("../src/lib/studio-origin.ts", import.meta.url), "utf8");

assert.equal(canvasProject.match(/key: "studio"/g)?.length, 2, "普通和只读画布菜单都应显示视频工坊入口");
assert.match(canvasProject, /icon: <Clapperboard className="size-4" \/>/);
assert.match(canvasProject, /onStudio=\{\(\) => window\.location\.assign\(studioOrigin\)\}/);
assert.match(appTopNav, /to: studioOrigin/);
assert.match(studioOrigin, /VITE_STUDIO_ORIGIN/);
assert.match(studioOrigin, /http:\/\/localhost:3010/);

console.log("canvas studio navigation contract passed");
