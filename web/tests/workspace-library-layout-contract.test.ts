import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canvasPage = readFileSync(new URL("../src/pages/canvas/index.tsx", import.meta.url), "utf8");
const canvasProjectCard = readFileSync(new URL("../src/components/canvas/canvas-project-card.tsx", import.meta.url), "utf8");
const canvasTemplateCard = readFileSync(new URL("../src/components/canvas/canvas-template-card.tsx", import.meta.url), "utf8");
const mediaAssetCard = readFileSync(new URL("../src/components/media/media-asset-card.tsx", import.meta.url), "utf8");
const assetsPage = readFileSync(new URL("../src/pages/assets/index.tsx", import.meta.url), "utf8");
const sharedAssetsPage = readFileSync(new URL("../src/pages/shared-assets/index.tsx", import.meta.url), "utf8");
const promptsPage = readFileSync(new URL("../src/pages/prompts/index.tsx", import.meta.url), "utf8");
const pageShell = readFileSync(new URL("../src/components/layout/page-shell.tsx", import.meta.url), "utf8");

for (const [name, source] of [
    ["我的画布", canvasPage],
    ["我的提示词", promptsPage],
] as const) {
    assert.match(source, /<LibraryPage/, `${name} should use the shared library page shell`);
    assert.match(source, /description=/, `${name} should explain the page purpose below the title`);
}

assert.match(pageShell, /ui-library-page/);
assert.match(pageShell, /ui-library-title/);
assert.match(pageShell, /ui-library-description/);
assert.doesNotMatch(canvasPage, /min-h-\[260px\][^"]*border-y/, "我的画布空状态不应绘制额外上下分隔线");
assert.doesNotMatch(canvasPage, /className="[^"]*min-h-28[^"]*border-y[^"]*"[^>]*>暂时没有其他用户的画布/, "他人的画布空状态不应绘制额外上下分隔线");
for (const [name, source] of [["画布项目卡", canvasProjectCard], ["画布模板卡", canvasTemplateCard]] as const) {
    assert.match(source, /bg-\[var\(--surface-raised\)\]/, `${name} should use an opaque semantic surface`);
    assert.doesNotMatch(source, /dark:bg-white\/\d+/, `${name} should not reveal the dotted page background in dark mode`);
}
assert.doesNotMatch(mediaAssetCard, /height:\s*"100%"/, "素材卡 body 不应强制填满卡片高度");
assert.doesNotMatch(mediaAssetCard, /w-full flex-1 text-left/, "素材信息不应被 flex 拉到预览下方");
assert.match(mediaAssetCard, /aria-label="素材操作"/, "素材卡操作应收纳到右上角的可访问菜单");
assert.doesNotMatch(mediaAssetCard, /px-3 pb-3/, "素材卡不应保留底部散列操作区");
assert.doesNotMatch(assetsPage, /<Button size="small" onClick=\{\(\) => setPreviewAsset\(asset\)\}>查看<\/Button>/, "我的素材卡不应提供重复查看按钮");
assert.doesNotMatch(sharedAssetsPage, /<Button size="small" onClick=\{\(\) => setPreviewAsset\(asset\)\}>查看<\/Button>/, "共享素材卡不应提供重复查看按钮");
assert.match(assetsPage, /grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
assert.match(sharedAssetsPage, /grid min-h-56 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
assert.doesNotMatch(promptsPage, /line-clamp-5/, "我的提示词正文不应被截断");
assert.match(promptsPage, /thin-scrollbar[^"]*min-h-0[^"]*flex-1[^"]*overflow-y-auto/, "我的提示词正文应在卡片内独立滚动");
assert.match(promptsPage, /tabIndex=\{0\}/, "提示词滚动区域应支持键盘聚焦");

console.log("workspace library layout contract passed");
