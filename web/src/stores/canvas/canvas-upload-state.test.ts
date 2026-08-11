import assert from "node:assert/strict";
import test from "node:test";

import { uploadProgress } from "./canvas-upload-state.ts";

test("converts uploaded bytes to an integer percentage", () => {
    assert.equal(uploadProgress(3, 10), 30);
});

test("clamps upload progress to the supported range", () => {
    assert.equal(uploadProgress(-1, 10), 0);
    assert.equal(uploadProgress(12, 10), 100);
    assert.equal(uploadProgress(4, 0), 0);
});
