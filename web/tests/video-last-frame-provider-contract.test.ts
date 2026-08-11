import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const config = read("../src/stores/use-config-store.ts");
const settings = read("../src/components/video-settings-panel.tsx");
const video = read("../src/services/api/video.ts");
const assets = read("../src/services/api/cloud-assets.ts");
const ark = read("../../supabase/functions/_shared/providers/ark.ts");
const generations = read("../../supabase/functions/_shared/generations.ts");

assert.match(config, /videoReturnLastFrame: string/);
assert.match(config, /videoReturnLastFrame: "true"/);
assert.match(settings, /label="保留尾帧"/);
assert.match(video, /\.\.\.\(seedance \? \{ returnLastFrame: config\.videoReturnLastFrame !== "false" \} : \{\}\)/);
assert.match(ark, /return_last_frame/);
assert.match(ark, /last_frame_url/);
assert.match(generations, /lastFramePath/);
assert.match(generations, /lastFrameUrl/);
assert.match(generations, /catch \(error\)[\s\S]*视频尾帧转存失败/);
assert.match(assets, /lastFrameUrl\?: string/);
assert.match(assets, /lastFramePath/);

console.log("video last frame provider contract tests passed");
