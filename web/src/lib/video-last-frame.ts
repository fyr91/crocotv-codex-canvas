import { clampVideoFrameTime, extractVideoFrame } from "./video-frame";

export function lastFrameSeekTime(duration: number) {
    return clampVideoFrameTime(duration, Number.POSITIVE_INFINITY);
}

export function extractVideoLastFrame(input: string | Blob) {
    return extractVideoFrame(input, Number.POSITIVE_INFINITY);
}
