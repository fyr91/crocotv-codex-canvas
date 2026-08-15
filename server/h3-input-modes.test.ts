import assert from "node:assert/strict";
import { test } from "node:test";
import { buildH3JobPayload } from "./providers";

const base = { externalJobId: "job", count: 1, prompt: "prompt", quality: "preview", duration: 6 };

test("H3 根据真实资源选择 T2V 与 R2V", () => {
  assert.equal(buildH3JobPayload({ ...base, images: [], videos: [], audios: [] }).request.mode, "t2v");
  const r2v = buildH3JobPayload({ ...base, images: ["image"], videos: ["video"], audios: ["audio"] });
  assert.equal(r2v.request.mode, "r2v");
  assert.deepEqual(r2v.request.reference_video_asset_ids, ["video"]);
});

test("H3 FL2V 保持有序首尾帧并拒绝缺失一端", () => {
  const fl2v = buildH3JobPayload({ ...base, images: [], videos: [], audios: [], firstFrame: "first", lastFrame: "last" });
  assert.equal(fl2v.request.mode, "fl2v");
  assert.equal(fl2v.request.first_frame_asset_id, "first");
  assert.equal(fl2v.request.last_frame_asset_id, "last");
  assert.throws(() => buildH3JobPayload({ ...base, images: [], videos: [], audios: [], firstFrame: "first" }), /同时提供/);
});
