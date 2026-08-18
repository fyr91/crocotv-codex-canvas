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
  assert.equal(state.promptBindings.entity_extraction.templateKey, "croco.p3.entity-extraction");
  assert.equal(state.promptBindings.style_analysis.templateKey, "croco.p3.art-direction-options");
  assert.equal(state.promptBindings.r2v_polish.templateKey, "croco.h3.universal-ref2va");
  assert.equal(state.projectPromptVersions.length, 0);
});

test("实体提取旧默认与项目版本迁移到独立模板，锁定全局版本保持兼容", () => {
  const state = newStudioProjectState("测试剧本");
  const projectVersion = {
    templateKey: "croco.p3.production-design",
    templateVersion: "1.2.0-project.1",
    systemPrompt: "项目实体 Prompt",
    systemPromptSha256: createHash("sha256").update("项目实体 Prompt").digest("hex"),
    source: "project" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const migratedProject = parseStudioProjectState({
    ...state,
    promptBindings: { ...state.promptBindings, entity_extraction: { templateKey: "croco.p3.production-design", templateVersion: projectVersion.templateVersion, source: "project" } },
    projectPromptVersions: [projectVersion],
  });
  assert.equal(migratedProject.promptBindings.entity_extraction.templateKey, "croco.p3.entity-extraction");
  assert.ok(migratedProject.projectPromptVersions.some((version) => version.templateKey === "croco.p3.entity-extraction" && version.templateVersion === projectVersion.templateVersion));

  const pinned = parseStudioProjectState({
    ...state,
    promptBindings: { ...state.promptBindings, entity_extraction: { templateKey: "croco.p3.production-design", templateVersion: "1.2.0", source: "global-pinned" } },
  });
  assert.equal(pinned.promptBindings.entity_extraction.templateKey, "croco.p3.production-design");
});

test("旧 Studio schema 迁移时同样保留自定义 Prompt", () => {
  const state = parseStudioProjectState({ schemaVersion: 1, originalText: "旧项目", promptConfig: { video_polish: "旧视频 Prompt" } });
  assert.equal(state.promptConfig.video_polish, "旧视频 Prompt");
  assert.equal(state.promptBindings.video_polish.source, "legacy-studio-migration");
  assert.equal(state.projectPromptVersions[0]?.systemPrompt, "旧视频 Prompt");
});

test("Studio 执行记录保留 Ark Responses 原生结构化输出通道", () => {
  const state = newStudioProjectState("测试剧本");
  const execution = {
    id: "style-execution-1",
    operation: "style_analysis",
    templateKey: "croco.p3.art-direction-options",
    templateVersion: "3.0.0",
    systemPromptSha256: "a".repeat(64),
    systemPromptNodeIds: ["system-prompt-1"],
    model: "doubao-seed-2.1-turbo",
    responseApi: "ark-responses" as const,
    sourceNodeIds: ["source-node-1"],
    imageResourceIds: [],
    videoResourceIds: [],
    audioResourceIds: [],
    outputNodeIds: ["output-node-1"],
    createdAt: "2026-08-18T00:00:00.000Z",
  };
  const parsed = parseStudioProjectState({ ...state, generationExecutions: [execution] });
  assert.equal(parsed.generationExecutions[0]?.responseApi, "ark-responses");
});
