import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const assetsPage = read("../src/pages/assets/index.tsx");
const dropzone = read("../src/pages/assets/components/asset-upload-dropzone.tsx");
const toolbar = read("../src/components/canvas/canvas-toolbar.tsx");
const canvas = read("../src/pages/canvas/project.tsx");

assert.match(assetsPage, /<AssetUploadDropzone/);
assert.match(assetsPage, /runAssetUploadBatch\(files,\s*uploadAssetFile\)/);
assert.doesNotMatch(assetsPage, />\s*\{uploading \? "上传中\.\.\." : "上传素材"\}\s*</);
assert.match(dropzone, /onDrop=\{handleDrop\}/);
assert.match(dropzone, /multiple/);
assert.match(dropzone, /支持单个或多个图片、视频和音频文件/);

assert.match(toolbar, /tool-export-results/);
assert.match(toolbar, /导出已选结果/);
assert.match(canvas, /selectedCanvasResultNodes\(nodes,\s*selectedNodeIds\)/);
assert.match(canvas, /exportCanvasResultNodes\(selected\)/);

assert.match(canvas, /connectionHandlesForSelection\(anchor,\s*selectedNodeIdsRef\.current,\s*nodesRef\.current\)/);
assert.match(canvas, /connectingHandles\.map/);
assert.match(canvas, /pendingConnectionCreate\.connections\.length/);
assert.match(canvas, /planCanvasConnections\(/);

console.log("asset batch and canvas multi-connect contract passed");
