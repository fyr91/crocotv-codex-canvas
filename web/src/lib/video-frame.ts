const VIDEO_END_PADDING = 0.05;

export function clampVideoFrameTime(duration: number, time: number) {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const end = Math.max(0, duration - VIDEO_END_PADDING);
    const requested = time === Number.POSITIVE_INFINITY ? end : Number.isFinite(time) ? time : 0;
    return roundFrameTime(Math.min(end, Math.max(0, requested)));
}

export function videoFrameTimeline(duration: number, count = 10) {
    if (!Number.isFinite(duration) || duration <= 0) return [];
    const total = Math.max(1, Math.round(count));
    const end = clampVideoFrameTime(duration, Number.POSITIVE_INFINITY);
    if (total === 1) return [roundFrameTime(end / 2)];
    return Array.from({ length: total }, (_, index) => roundFrameTime((end * index) / (total - 1)));
}

export function videoFrameTimeFromPointer(clientX: number, left: number, width: number, duration: number) {
    if (!Number.isFinite(width) || width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
    const end = clampVideoFrameTime(duration, Number.POSITIVE_INFINITY);
    return roundFrameTime(end * ratio);
}

export function formatVideoFrameTime(seconds: number) {
    const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const minutes = Math.floor(value / 60);
    const wholeSeconds = Math.floor(value % 60);
    const tenths = Math.floor((value - Math.floor(value)) * 10);
    return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
}

export async function seekVideoFrame(video: HTMLVideoElement, time: number) {
    const next = clampVideoFrameTime(video.duration, time);
    if (Math.abs(video.currentTime - next) < 0.001) return next;
    const seeked = mediaEvent(video, "seeked");
    video.currentTime = next;
    await seeked;
    return next;
}

export async function captureVideoFrame(video: HTMLVideoElement, options: { maxWidth?: number; maxHeight?: number; type?: string; quality?: number } = {}) {
    const canvas = frameCanvas(video, options.maxWidth, options.maxHeight);
    const type = options.type || "image/png";
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("视频画面编码失败")), type, options.quality));
}

export function videoFramePreviewUrl(video: HTMLVideoElement, maxWidth = 96, maxHeight = 54) {
    return frameCanvas(video, maxWidth, maxHeight).toDataURL("image/jpeg", 0.72);
}

export async function extractVideoFrame(input: string | Blob, time: number) {
    const source = typeof input === "string" ? await fetchBlob(input) : input;
    const url = URL.createObjectURL(source);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    try {
        const loaded = mediaEvent(video, "loadeddata");
        video.src = url;
        video.load();
        await loaded;
        await seekVideoFrame(video, time);
        return await captureVideoFrame(video);
    } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
    }
}

function frameCanvas(video: HTMLVideoElement, maxWidth?: number, maxHeight?: number) {
    if (!video.videoWidth || !video.videoHeight) throw new Error("无法读取视频画面尺寸");
    const scale = Math.min(1, maxWidth ? maxWidth / video.videoWidth : 1, maxHeight ? maxHeight / video.videoHeight : 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持视频截帧");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
}

async function fetchBlob(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("视频文件读取失败");
    return response.blob();
}

function mediaEvent(video: HTMLVideoElement, event: "loadeddata" | "seeked") {
    return new Promise<void>((resolve, reject) => {
        const done = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("视频文件解析失败")); };
        const cleanup = () => {
            video.removeEventListener(event, done);
            video.removeEventListener("error", failed);
        };
        video.addEventListener(event, done);
        video.addEventListener("error", failed);
    });
}

function roundFrameTime(value: number) {
    return Math.round((value + 1e-9) * 1000) / 1000;
}
