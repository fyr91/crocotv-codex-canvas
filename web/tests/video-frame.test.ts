import assert from "node:assert/strict";

import { captureVideoFrame, clampVideoFrameTime, formatVideoFrameTime, videoFrameTimeline, videoFrameTimeFromPointer } from "../src/lib/video-frame";

assert.equal(clampVideoFrameTime(10, -1), 0);
assert.equal(clampVideoFrameTime(10, 20), 9.95);
assert.equal(clampVideoFrameTime(Number.NaN, 2), 0);
assert.deepEqual(videoFrameTimeline(10, 3), [0, 4.975, 9.95]);
assert.equal(videoFrameTimeFromPointer(150, 100, 200, 10), 2.488);
assert.equal(formatVideoFrameTime(65.4), "01:05.4");

const originalDocument = globalThis.document;
const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(["frame"], { type: "image/png" })),
};
Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
try {
    const frame = await captureVideoFrame({ videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement, { maxWidth: 96, maxHeight: 54 });
    assert.equal(frame.type, "image/png");
    assert.equal(canvas.width, 96);
    assert.equal(canvas.height, 54);
} finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    else delete (globalThis as { document?: Document }).document;
}

console.log("video frame tests passed");
