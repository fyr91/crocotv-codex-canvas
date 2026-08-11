import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toolbar = readFileSync(new URL("../src/components/canvas/canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

assert.match(toolbar, /onUseLastFrame: \(node: CanvasNodeData\) => void/);
assert.match(toolbar, /id: "useLastFrame", title: "使用尾帧", label: "使用尾帧"/);
assert.match(toolbar, /icon: <ImagePlus className="size-4" \/>/);
assert.match(project, /const useVideoLastFrame = useCallback/);
assert.match(project, /getCloudAsset\(storageKey\)/);
assert.match(project, /extractVideoLastFrame/);
assert.match(project, /uploadImage\([^;]+\{ compress: false \}\)/);
assert.match(project, /addAsset\(\{ kind: "image", title: "视频尾帧"/);
assert.match(project, /title: "视频尾帧"/);
assert.match(project, /position: \{ x: sourceNode\.position\.x \+ sourceNode\.width \+ 96, y: sourceNode\.position\.y \+ \(sourceNode\.height - frameSize\.height\) \/ 2 \}/);
assert.match(project, /fromNodeId: sourceNode\.id, toNodeId: frameNode\.id/);
assert.match(project, /onUseLastFrame=\{useVideoLastFrame\}/);

console.log("video last frame canvas contract tests passed");
