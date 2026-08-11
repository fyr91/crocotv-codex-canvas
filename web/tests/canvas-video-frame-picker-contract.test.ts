import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const picker = readFileSync(new URL("../src/components/canvas/canvas-video-frame-picker.tsx", import.meta.url), "utf8");
const neutral = readFileSync(new URL("../src/components/media/video-frame-picker.tsx", import.meta.url), "utf8");

assert.match(picker, /VideoFramePicker/);
assert.match(picker, /CanvasVideoFramePickerProps/);
assert.match(picker, /canvasThemes/);
assert.match(neutral, /videoFrameTimeline/);
assert.match(neutral, /videoFrameTimeFromPointer/);
assert.match(neutral, /videoFramePreviewUrl/);
assert.match(neutral, /setPointerCapture/);
assert.match(neutral, /mountedRef/);
assert.match(neutral, /initializedVideoUrlRef/);
assert.match(neutral, /data-canvas-no-zoom/);
assert.match(neutral, /formatVideoFrameTime\(time\)/);
assert.match(neutral, /formatVideoFrameTime\(duration\)/);
assert.match(neutral, /取消/);
assert.match(neutral, /确认/);
assert.match(neutral, /grid grid-cols-2 gap-2/);
assert.match(neutral, /className="relative min-h-0 flex-1 cursor-move overflow-hidden"/);
assert.match(neutral, /className="shrink-0 cursor-default space-y-2 p-3"[^>]+onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
assert.doesNotMatch(neutral, /Modal/);
assert.doesNotMatch(neutral, /dark\s*\?/);

console.log("canvas video frame picker contract tests passed");
