import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { STYLE_PRESETS } from "./studio-api";

test("Studio exposes the two current dual-route visual style presets", async () => {
  assert.deepEqual(STYLE_PRESETS.presets.map((preset) => preset.id), [
    "flying-house-whimsy",
    "spider-verse-comic",
  ]);

  const preset = STYLE_PRESETS.presets.find((item) => item.id === "spider-verse-comic");
  assert.ok(preset);
  assert.equal(preset.name_zh, "蛛网次元");
  assert.equal(preset.name, "Spider-Verse Comic Animation");
  assert.match(preset.image_prompt, /Halftone Ben-Day dot shading/);
  assert.match(preset.video_prompt, /Stepped animation at 12fps/);
  assert.equal(preset.image_negative_prompt, "");
  assert.equal(preset.video_negative_prompt, "");
  await access(path.resolve("studio/public", preset.thumbnail.replace(/^\//, "")));
});
