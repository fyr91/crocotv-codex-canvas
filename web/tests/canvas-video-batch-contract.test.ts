import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const videoApi = readFileSync(new URL("../src/services/api/video.ts", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../../supabase/functions/dispatch-video-generations/index.ts", import.meta.url), "utf8");
const start = project.indexOf('if (mode === "video")');
const end = project.indexOf('if (mode === "audio")', start);
const branch = project.slice(start, end);

assert.match(videoApi, /count:\s*generationOptions\.selection\.count/);
assert.match(branch, /isBatchRoot:\s*count > 1/);
assert.match(branch, /batchChildIds:\s*count > 1/);
assert.match(branch, /videoOutputIndex:\s*index/);
assert.match(branch, /fromNodeId:\s*rootId,\s*toNodeId:\s*childId/);
assert.match(branch, /requestVideoGeneration/);
assert.match(dispatch, /const count = Math\.max\(1, Math\.min\(8/);

console.log("canvas video batch contract tests passed");
