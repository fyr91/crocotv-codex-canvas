import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const generate = read("../../supabase/functions/generate/index.ts");
const callback = read("../../supabase/functions/ltx-callback/index.ts");
const delivery = read("../src/services/api/ltx-delivery-client.ts");
const video = read("../src/services/api/video.ts");
const project = read("../src/pages/canvas/project.tsx");

assert.match(generate, /createLtxDelivery/);
assert.match(generate, /clientRequestId/);
assert.match(callback, /preview-ready/);
assert.match(callback, /prepare-upload/);
assert.match(callback, /completeStoredVideoOutput/);
assert.match(delivery, /new EventSource/);
assert.match(delivery, /setInterval\(\(\) => void poll\(\), 1000\)/);
assert.match(video, /isTemporaryPreview:\s*true/);
assert.match(video, /watchArchivedVideoAssets/);
assert.match(project, /persistenceState:\s*video\.storageKey \? "saved" : "uploading"/);
assert.match(project, /resumeVideoGeneration/);

console.log("ltx direct preview contract tests passed");
