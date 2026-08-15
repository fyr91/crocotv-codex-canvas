import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { newStudioProjectState, parseStudioProjectState } from "./studio-schemas";

test("Studio 旧 Prompt 字段迁移为项目兼容版本且正文不丢失", () => {
  const custom = "  保留首尾空白的旧 Studio Prompt\n";
  const state = newStudioProjectState("测试剧本");
  const migrated = parseStudioProjectState({ ...state, promptConfig: { storyboard_polish: custom } });
  const hash = createHash("sha256").update(custom, "utf8").digest("hex");
  const binding = migrated.promptBindings.storyboard_polish;
  assert.deepEqual(binding, {
    templateKey: "croco.p4.shot-revision",
    templateVersion: `0.0.0-legacy.${hash.slice(0, 12)}`,
    source: "legacy-studio-migration",
  });
  const version = migrated.projectPromptVersions.find((item) => item.templateVersion === binding.templateVersion);
  assert.equal(version?.systemPrompt, custom);
  assert.equal(version?.systemPromptSha256, hash);
});

test("Studio 默认 Prompt 绑定全部指向全局 Registry", () => {
  const state = newStudioProjectState();
  assert.equal(Object.keys(state.promptBindings).length, 6);
  assert.equal(state.promptBindings.style_analysis.templateKey, "croco.p3.art-direction-options");
  assert.equal(state.promptBindings.r2v_polish.templateKey, "croco.h3.universal-ref2va");
  assert.equal(state.projectPromptVersions.length, 0);
});

test("旧 Studio schema 迁移时同样保留自定义 Prompt", () => {
  const state = parseStudioProjectState({ schemaVersion: 1, originalText: "旧项目", promptConfig: { video_polish: "旧视频 Prompt" } });
  assert.equal(state.promptConfig.video_polish, "旧视频 Prompt");
  assert.equal(state.promptBindings.video_polish.source, "legacy-studio-migration");
  assert.equal(state.projectPromptVersions[0]?.systemPrompt, "旧视频 Prompt");
});
