import assert from "node:assert/strict";
import { test } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { buildAudioRequest, buildFullClientRequest, loadSeedAsrConfig, parseSeedAsrResponse } from "./seed-asr-client";

test("Seed-ASR 使用 Agent Plan 单流端点和独立资源 ID", () => {
  const config = loadSeedAsrConfig({ CODING_PLAN_API_KEY: "test-key" });
  assert.equal(config.endpoint, "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream");
  assert.equal(config.resourceId, "volc.seedasr.sauc.duration");
  assert.equal(config.model, "doubao-seed-asr-2.0");
});

test("Seed-ASR 请求包遵循 Agent Plan 带序号二进制协议", () => {
  const full = buildFullClientRequest(1);
  assert.deepEqual([...full.subarray(0, 4)], [0x11, 0x11, 0x11, 0x00]);
  assert.equal(full.readInt32BE(4), 1);
  const fullPayload = JSON.parse(gunzipSync(full.subarray(12)).toString("utf8"));
  assert.equal(fullPayload.audio.format, "wav");
  assert.equal(fullPayload.request.model_name, "bigmodel");

  const last = buildAudioRequest(2, Buffer.from([1, 2, 3]), true);
  assert.deepEqual([...last.subarray(0, 4)], [0x11, 0x23, 0x11, 0x00]);
  assert.equal(last.readInt32BE(4), -2);
  assert.deepEqual([...gunzipSync(last.subarray(12))], [1, 2, 3]);
});

test("Seed-ASR 解析最终识别响应", () => {
  const payload = gzipSync(Buffer.from(JSON.stringify({ audio_info: { duration: 1200 }, result: { text: "测试" } })));
  const response = Buffer.alloc(12 + payload.length);
  Buffer.from([0x11, 0x93, 0x11, 0x00]).copy(response, 0);
  response.writeInt32BE(-2, 4);
  response.writeUInt32BE(payload.length, 8);
  payload.copy(response, 12);
  const parsed = parseSeedAsrResponse(response);
  assert.equal(parsed.isLast, true);
  assert.equal(parsed.payload?.result?.text, "测试");
  assert.equal(parsed.payload?.audio_info?.duration, 1200);
});
