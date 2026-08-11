import assert from "node:assert/strict";

import { prepareUserImageUpload, USER_IMAGE_WEBP_QUALITY } from "../src/lib/user-image-compression";

assert.equal(USER_IMAGE_WEBP_QUALITY, 0.94);

const original = new Blob([new Uint8Array(1000)], { type: "image/jpeg" });
const compressed = new Blob([new Uint8Array(800)], { type: "image/webp" });
const accepted = await prepareUserImageUpload(original, async () => compressed);
assert.equal(accepted.blob, compressed);
assert.equal(accepted.metadata.applied, true);
assert.equal(accepted.metadata.savedBytes, 200);
assert.equal(accepted.metadata.savingRatio, 0.2);

const smallSaving = new Blob([new Uint8Array(930)], { type: "image/webp" });
const rejected = await prepareUserImageUpload(original, async () => smallSaving);
assert.equal(rejected.blob, original);
assert.equal(rejected.metadata.applied, false);
assert.equal(rejected.metadata.savedBytes, 0);

const gif = new Blob([new Uint8Array(1000)], { type: "image/gif" });
let encoded = false;
const unsupported = await prepareUserImageUpload(gif, async () => {
    encoded = true;
    return compressed;
});
assert.equal(unsupported.blob, gif);
assert.equal(encoded, false);

const failed = await prepareUserImageUpload(original, async () => {
    throw new Error("failed");
});
assert.equal(failed.blob, original);
assert.equal(failed.metadata.applied, false);

console.log("user image compression tests passed");
