import assert from "node:assert/strict";
import test from "node:test";

import { happyHorseRequestBody, validateHappyHorseInput } from "./happyhorse";

test("Happy Horse 首帧模式映射原始 i2v 模型和参数", () => {
  assert.deepEqual(happyHorseRequestBody({
    prompt: "一只猫在草地上奔跑",
    inputMode: "firstFrame",
    duration: 5,
    quality: "1080P",
    watermark: false,
    imageResourceIds: ["image-1"],
  }, [], ["https://example.com/first.png"]), {
    model: "happyhorse-1.1-i2v",
    input: { prompt: "一只猫在草地上奔跑", media: [{ type: "first_frame", url: "https://example.com/first.png" }] },
    parameters: { resolution: "1080P", watermark: false, duration: 5 },
  });
});

test("Happy Horse 视频编辑只发送一条视频、参考图和编辑参数", () => {
  assert.deepEqual(happyHorseRequestBody({
    prompt: "把角色替换成 [Image 1]",
    inputMode: "videoEdit",
    quality: "720P",
    watermark: true,
    audioSetting: "origin",
    videoResourceIds: ["video-1"],
    imageResourceIds: ["image-1"],
  }, ["https://example.com/source.mp4"], ["https://example.com/character.png"]), {
    model: "happyhorse-1.0-video-edit",
    input: {
      prompt: "把角色替换成 [Image 1]",
      media: [
        { type: "video", url: "https://example.com/source.mp4" },
        { type: "reference_image", url: "https://example.com/character.png" },
      ],
    },
    parameters: { resolution: "720P", watermark: true, audio_setting: "origin" },
  });
});

test("Happy Horse 参考图模式限制 1 至 9 张图片", () => {
  assert.throws(() => validateHappyHorseInput({ prompt: "生成视频", inputMode: "referenceImages", duration: 5 }), /1 至 9 张图片/);
  assert.doesNotThrow(() => validateHappyHorseInput({ prompt: "[Image 1] 生成视频", inputMode: "referenceImages", duration: 5, imageResourceIds: ["image-1"] }));
});
