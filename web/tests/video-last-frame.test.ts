import assert from "node:assert/strict";

import { extractVideoLastFrame, lastFrameSeekTime } from "../src/lib/video-last-frame";

assert.equal(lastFrameSeekTime(10), 9.95);
assert.equal(lastFrameSeekTime(0.04), 0);
assert.equal(lastFrameSeekTime(Number.NaN), 0);

const originalDocument = globalThis.document;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const listeners = new Map<string, Set<() => void>>();
const emit = (event: string) => queueMicrotask(() => listeners.get(event)?.forEach((listener) => listener()));
let source = "";
let currentTime = 0;
let drewFrame = false;
let revokedUrl = "";
const video = {
    muted: false,
    playsInline: false,
    preload: "",
    duration: 10,
    videoWidth: 640,
    videoHeight: 360,
    get src() { return source; },
    set src(value: string) { source = value; },
    get currentTime() { return currentTime; },
    set currentTime(value: number) { currentTime = value; emit("seeked"); },
    load() { if (source) emit("loadeddata"); },
    removeAttribute() { source = ""; },
    addEventListener(event: string, listener: () => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); },
    removeEventListener(event: string, listener: () => void) { listeners.get(event)?.delete(listener); },
};
const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => { drewFrame = true; } }),
    toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(["frame"], { type: "image/png" })),
};

Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: (tag: string) => tag === "video" ? video : canvas } });
URL.createObjectURL = () => "blob:video-last-frame";
URL.revokeObjectURL = (url) => { revokedUrl = url; };
try {
    const frame = await extractVideoLastFrame(new Blob(["video"], { type: "video/mp4" }));
    assert.equal(frame.type, "image/png");
    assert.equal(currentTime, 9.95);
    assert.equal(canvas.width, 640);
    assert.equal(canvas.height, 360);
    assert.equal(drewFrame, true);
    assert.equal(revokedUrl, "blob:video-last-frame");
} finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    else delete (globalThis as { document?: Document }).document;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
}

console.log("video last frame tests passed");
