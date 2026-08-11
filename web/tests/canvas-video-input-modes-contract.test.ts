import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fields = readFileSync(new URL("../src/components/canvas/canvas-video-frame-fields.tsx", import.meta.url), "utf8");
const modeControl = readFileSync(new URL("../src/components/canvas/canvas-video-input-mode-control.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/video-settings-panel.tsx", import.meta.url), "utf8");
const modulePanel = readFileSync(new URL("../src/components/canvas/canvas-config-node-panel.tsx", import.meta.url), "utf8");
const nodePanel = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/components/canvas/canvas-config-composer.tsx", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const videoApi = readFileSync(new URL("../src/services/api/video.ts", import.meta.url), "utf8");

test("video input mode is a model-level control outside advanced settings", () => {
    assert.match(modeControl, /videoInputModesForModel/);
    assert.match(modeControl, /videoInputModeOptions/);
    assert.match(modeControl, /@\/components\/ui\/select/);
    assert.match(modeControl, /canvas-composer-model-picker/);
    assert.doesNotMatch(modeControl, /from "antd"/);
    assert.doesNotMatch(settings, /VideoInputModeSetting/);
    assert.match(modulePanel, /CanvasVideoInputModeControl/);
    assert.match(nodePanel, /CanvasVideoInputModeControl/);
    assert.match(modulePanel, /normalizeVideoInputModeForModel/);
    assert.match(nodePanel, /normalizeVideoInputModeForModel/);
});

test("LTX exposes one automatic entrypoint while other providers keep the mode picker", () => {
    assert.match(modeControl, /providerIdForModel\(model\) === "ltx"/);
    assert.match(modeControl, /LTX 自动识别视频输入模式/);
    assert.match(modeControl, /自动识别/);
    assert.match(project, /resolveAutomaticLtxVideoInputMode/);
    assert.match(project, /videoInputMode:\s*videoContextResult\.videoInputMode/);
    assert.equal(project.match(/const videoGenerationConfig = videoContextResult\?\.videoInputMode/g)?.length, 2);
    assert.match(nodePanel, /automaticLtxMode/);
    assert.match(composer, /frameMode \? inputs\.filter/);
});

test("shared frame fields expose image-only first and last frame slots", () => {
    assert.match(fields, /首帧图片/);
    assert.match(fields, /尾帧图片/);
    assert.match(fields, /@\$\{reference\.label\}/);
    assert.match(fields, /allowMultimodalFrames/);
    assert.match(fields, /mode === "multimodal" && !allowMultimodalFrames/);
    assert.match(composer, /input\.type === "image"/);
    assert.match(composer, /allowMultimodalVideoFrames/);
    assert.doesNotMatch(modulePanel, /CanvasVideoFrameFields/);
    assert.match(nodePanel, /providerIdForModel\(config\.model\) === "ltx"/);
    assert.match(nodePanel, /reference\.kind === "image"/);
    assert.match(project, /videoFirstFrameNodeId/);
    assert.match(project, /videoLastFrameNodeId/);
    assert.match(project, /allowMultimodalVideoFrames=\{providerIdForModel\(panelVideoConfig\?\.model \|\| ""\) === "ltx"\}/);
});

test("frame modes restrict prompt mentions to text in both canvas entrypoints", () => {
    assert.match(composer, /input\.type === "text"/);
    assert.match(nodePanel, /reference\.kind === "text"/);
    assert.match(modulePanel, /stripNonTextComposerReferences/);
    assert.match(nodePanel, /stripNonTextPromptReferences/);
    assert.match(project, /videoFirstFrameNodeId/);
    assert.match(project, /videoLastFrameNodeId/);
    assert.match(project, /resolveVideoGenerationContext/);
    assert.match(project, /videoGenerationContext/);
});

test("LTX multimodal keeps frame roles separate through generation and retry", () => {
    assert.match(project, /ltxFrames:\s*videoContextResult\?\.ltxFrames/);
    assert.equal(project.match(/ltxFrames:\s*videoContextResult\?\.ltxFrames/g)?.length, 2);
    assert.doesNotMatch(project, /lastFrame:\s*lastFrame \|\| firstFrame/);
    assert.match(project, /ltxFrames:\s*\{\s*\.\.\.\(firstFrame/);
    assert.match(videoApi, /groupLtxInputAssets/);
    assert.match(videoApi, /ltxInputAssets/);
    assert.match(videoApi, /frameReferences\?\.firstFrame/);
    assert.match(videoApi, /frameReferences\?\.lastFrame/);
});
