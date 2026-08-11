import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync(new URL("../src/types/canvas.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/services/api/generation-client.ts", import.meta.url), "utf8");
const video = readFileSync(new URL("../src/services/api/video.ts", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const node = readFileSync(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url), "utf8");
const usageService = readFileSync(new URL("../src/services/api/usage.ts", import.meta.url), "utf8");
const usagePage = readFileSync(new URL("../src/pages/usage/index.tsx", import.meta.url), "utf8");

assert.match(types, /generationState\?: "queued" \| "running"/);
assert.match(client, /onStatus\?: \(status: GenerationJob\["status"\]\) => void/);
assert.match(client, /onStatus\?\.\(job\.status\)/);
assert.match(video, /onStatusChange\?: \(status: GenerationJob\["status"\]\) => void/);
assert.match(video, /options\?\.onStatusChange/);
assert.match(project, /generationState/);
assert.match(node, /generationState === "queued" \? "排队中" : "生成中"/);
assert.match(node, /node\.metadata\?\.errorDetails \|\| "生成失败"/);
assert.match(node, /<RefreshCw/);
assert.match(usageService, /export async function cancelGeneration/);
assert.match(usageService, /functions\.invoke\("cancel-generation"/);
assert.match(usagePage, /row\.capability === "video"/);
assert.match(usagePage, /取消/);

console.log("seedance queue UI contract tests passed");
