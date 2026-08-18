import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMusic3JobPayload } from "./providers";

test("MiniMax Music 3 使用成都 V2 合同字段", () => {
  assert.deepEqual(buildMusic3JobPayload({
    prompt: "第一句\n第二句",
    params: { style: "温暖的钢琴流行曲", maxDuration: 10, seed: 7, outputFormat: "mp3" },
  }), {
    caption: "温暖的钢琴流行曲",
    lyrics: "第一句\n第二句",
    max_duration: 10,
    seed: 7,
    tiled_decode: false,
    output_format: "mp3",
  });
});

test("MiniMax Music 3 纯音乐不会把提示词误传为歌词", () => {
  const payload = buildMusic3JobPayload({ prompt: "不应进入歌词", params: { caption: "电影感氛围音乐", instrumental: true } });
  assert.equal(payload.lyrics, "");
  assert.equal(payload.max_duration, 120);
});
