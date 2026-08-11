import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const canvasGeneration = read("../src/components/canvas/canvas-node-generation.ts");
const imageService = read("../src/services/api/image.ts");
const generate = read("../../supabase/functions/generate/index.ts");
const bigmodel = read("../../supabase/functions/_shared/providers/bigmodel.ts");

assert.match(canvasGeneration, /context\.referenceVideos\.map\(\(video\) => \(\{ type: "video_url"/, "画布 LLM 消息应加入视频 URL");
assert.match(canvasGeneration, /context\.referenceAudios\.map\(\(audio\) => \(\{ type: "audio_url"/, "画布 LLM 消息应加入音频和音乐 URL");

assert.match(imageService, /\{ type: "video_url"; video_url: \{ url: string \} \}/, "文本消息类型应支持视频 URL");
assert.match(imageService, /\{ type: "audio_url"; audio_url: \{ url: string \} \}/, "文本消息类型应支持音频 URL");
assert.match(imageService, /uploadMediaFile/, "没有云端素材 ID 的视频和音频应按媒体类型上传");
assert.match(imageService, /item\.type === "video_url"/, "文本请求应区分视频和音频内容项");

assert.match(generate, /inputAssets\.filter\(\(asset: any\) => asset\.kind !== "image"\)/, "LLM 后端应为视频和音频创建签名 URL");
assert.match(generate, /inputMedia/, "LLM 后端应保留媒体 URL 类型");
assert.match(generate, /requestOpenAICompatible\(\{[\s\S]*?inputMedia[,}]/, "LLM 请求应接收带类型的媒体 URL");

assert.match(bigmodel, /media\.kind === "video"/, "LLM 适配器应输出 video_url");
assert.match(bigmodel, /type: "video_url"/, "LLM 适配器应包含视频 URL 内容项");
assert.match(bigmodel, /media\.kind === "audio"/, "LLM 适配器应输出 audio_url");
assert.match(bigmodel, /type: "audio_url"/, "LLM 适配器应包含音频 URL 内容项");

console.log("llm multimedia url contract tests passed");
