import type { VideoInputMode } from "./video-input-mode";

export function orderedVideoInputAssetIds(mode: VideoInputMode, imageIds: string[], videoIds: string[], audioIds: string[]) {
    return mode === "videoEdit" ? [...videoIds, ...imageIds] : [...imageIds, ...videoIds, ...audioIds];
}

export function validateVideoEditReferenceAlignment(mode: VideoInputMode, prompt: string, imageIds: string[]) {
    if (mode !== "videoEdit") return;
    const indexes = Array.from(prompt.matchAll(/(?:参考图片|\[Image\s+)(\d+)\]?/gi), (match) => Number(match[1]));
    if (indexes.length && !imageIds.length) throw new Error("视频编辑提示词引用了图片，但请求中没有参考图片");
    if (indexes.length && Math.max(...indexes) > imageIds.length) throw new Error("视频编辑提示词引用的图片数量与实际参考图片不一致");
}
