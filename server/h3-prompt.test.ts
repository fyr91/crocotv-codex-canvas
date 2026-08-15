import assert from "node:assert/strict";
import { test } from "node:test";
import { isStructuredH3Prompt, normalizeH3InputMode, prepareH3Prompt } from "./h3-prompt";

const structured = `subject_definitions:\nA\nsummary:\nB\nretention_analysis:\nC\ndetailed_description:\nD\noverall_soundscape:\nE\nnon_diegetic_music:\nF`;

test("H3 用户模式只影响资源角色，不改变统一 Prompt 契约", async () => {
  let captured = "";
  const prepared = await prepareH3Prompt({
    draftPrompt: "女孩从门口走到窗边。",
    durationSeconds: 3,
    inputMode: "fl2v",
    imageResourceIds: ["first", "last"],
  }, { optimize: async (prompt) => { captured = prompt; return structured; } });
  assert.equal(normalizeH3InputMode("fl2v"), "firstLastFrame");
  assert.equal(prepared.optimized, true);
  assert.deepEqual(prepared.resourceRoles.map((item) => item.role), ["exactFirstFrame", "exactLastFrame"]);
  assert.match(captured, /<Picture 1>: exactFirstFrame/);
  assert.match(captured, /<Picture 2>: exactLastFrame/);
});

test("H3 Prompt 优化仅在明确关闭或已经结构化时跳过", async () => {
  const disabled = await prepareH3Prompt({ draftPrompt: "raw", durationSeconds: 3, optimize: false });
  assert.equal(disabled.skippedReason, "disabled");
  const locked = await prepareH3Prompt({ draftPrompt: structured, durationSeconds: 3 });
  assert.equal(locked.skippedReason, "already-structured");
  assert.equal(isStructuredH3Prompt(structured), true);
});
