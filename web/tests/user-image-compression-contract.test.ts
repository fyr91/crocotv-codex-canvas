import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const imageStorage = readFileSync(new URL("../src/services/image-storage.ts", import.meta.url), "utf8");
const assetFile = readFileSync(new URL("../src/pages/assets/asset-file.ts", import.meta.url), "utf8");
const cloudAssets = readFileSync(new URL("../src/services/api/cloud-assets.ts", import.meta.url), "utf8");
const canvasProject = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

assert.match(imageStorage, /prepareUserImageUpload\(blob\)/);
assert.match(imageStorage, /options\.compress === true \? await prepareUserImageUpload\(blob\)/);
assert.match(imageStorage, /uploadCloudAsset\(prepared\.blob, "image"/);
assert.match(imageStorage, /bytes: prepared\.blob\.size/);
assert.match(imageStorage, /mimeType: prepared\.blob\.type/);
assert.match(imageStorage, /uploadImage\(blob, \{ compress: false \}\)/);
assert.match(assetFile, /kind === "image" \? await prepareUserImageUpload\(file\) : null/);
assert.match(assetFile, /imageCompression: prepared\.metadata/);
assert.match(canvasProject, /uploadImage\(cropped, \{ compress: true \}\)/);
assert.match(canvasProject, /uploadImage\(piece\.dataUrl, \{ compress: true \}\)/);
assert.match(canvasProject, /uploadImage\(upscaled, \{ compress: true \}\)/);
assert.equal(canvasProject.match(/uploadImage\(file, \{ compress: true \}\)/g)?.length, 2);
assert.doesNotMatch(cloudAssets, /user-image-compression/);

console.log("user image compression contract tests passed");
