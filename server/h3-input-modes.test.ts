import assert from "node:assert/strict";
import { test } from "node:test";
import { buildH3JobPayload, formatH3ErrorDetail, h3JobProgressState } from "./providers";

const base = { externalJobId: "job", count: 1, prompt: "prompt", quality: "preview", duration: 6 };

test("H3 根据显式模式选择 T2V 与 R2V", () => {
  const t2v = buildH3JobPayload({ ...base, inputMode: "text", images: [], videos: [], audios: [] });
  assert.deepEqual(t2v.parameters, {
    mode: "t2v",
    prompt: "prompt",
    quality: "preview",
    duration_seconds: 6,
  });
  assert.deepEqual(t2v.inputs, []);
  const r2v = buildH3JobPayload({ ...base, inputMode: "multimodal", images: ["image"], videos: [], audios: ["audio"] });
  assert.equal(r2v.parameters.mode, "r2v");
  assert.deepEqual(r2v.inputs, [
    { role: "reference_image", asset_id: "image" },
    { role: "reference_audio", asset_id: "audio" },
  ]);
});

test("H3 首帧使用 i2v 与 first_frame，首尾帧保持有序 R2V", () => {
  const i2v = buildH3JobPayload({ ...base, inputMode: "firstFrame", images: ["first"], videos: [], audios: [] });
  assert.equal(i2v.parameters.mode, "i2v");
  assert.deepEqual(i2v.inputs, [{ role: "first_frame", asset_id: "first" }]);

  const firstLast = buildH3JobPayload({ ...base, inputMode: "firstLastFrame", images: ["first", "last"], videos: [], audios: [] });
  assert.equal(firstLast.parameters.mode, "r2v");
  assert.deepEqual(firstLast.inputs, [
    { role: "reference_image", asset_id: "first" },
    { role: "reference_image", asset_id: "last" },
  ]);
});

test("H3 显式输入模式拒绝不匹配的素材组合", () => {
  assert.throws(() => buildH3JobPayload({ ...base, inputMode: "text", images: ["image"], videos: [], audios: [] }), /不接受参考/);
  assert.throws(() => buildH3JobPayload({ ...base, inputMode: "firstFrame", images: ["one", "two"], videos: [], audios: [] }), /只接受一张/);
  assert.throws(() => buildH3JobPayload({ ...base, inputMode: "multimodal", images: [], videos: [], audios: [] }), /至少需要/);
});

test("H3 在本地拒绝线上 Runtime 尚未支持的视频参考", () => {
  assert.throws(() => buildH3JobPayload({ ...base, images: [], videos: ["video"], audios: [] }), /不支持参考视频/);
});

test("H3 错误详情只保留安全的字段位置与校验信息", () => {
  assert.equal(formatH3ErrorDetail({
    detail: [{ type: "extra_forbidden", loc: ["body", "request", "reference_video_asset_ids"], msg: "Extra inputs are not permitted", input: ["secret-resource"] }],
  }), "body.request.reference_video_asset_ids：不支持的请求字段");
  assert.equal(formatH3ErrorDetail({ detail: "Runtime is warming" }), "Runtime is warming");
});

test("H3 dispatching 状态保持轮询而不是提前失败", () => {
  assert.deepEqual(h3JobProgressState("dispatching"), {
    pending: true,
    stage: "queued",
    label: "MiniMax H3 任务分发中",
  });
  assert.equal(h3JobProgressState("queued").pending, true);
  assert.equal(h3JobProgressState("running").pending, true);
  assert.equal(h3JobProgressState("succeeded").pending, false);
  assert.equal(h3JobProgressState("failed").pending, false);
});
