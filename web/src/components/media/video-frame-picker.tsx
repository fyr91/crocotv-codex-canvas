import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "antd";
import { AlertTriangle, Check, LoaderCircle, X } from "lucide-react";

import { captureVideoFrame, clampVideoFrameTime, formatVideoFrameTime, seekVideoFrame, videoFramePreviewUrl, videoFrameTimeline, videoFrameTimeFromPointer } from "@/lib/video-frame";

export type VideoFramePickerAppearance = {
    fill: string;
    text: string;
    muted: string;
    canvasBackground: string;
    stroke: string;
    activeStroke: string;
};

type VideoFramePickerProps = {
    sourceUrl: string;
    initialTime?: number;
    readOnly?: boolean;
    onTimeCommit: (time: number) => void;
    onCancel: () => void;
    onConfirm: (result: { blob: Blob; time: number; width: number; height: number }) => Promise<void> | void;
    appearance?: VideoFramePickerAppearance;
};

const defaultAppearance: VideoFramePickerAppearance = {
    fill: "var(--background)",
    text: "var(--foreground)",
    muted: "#78716c",
    canvasBackground: "#0c0a09",
    stroke: "#44403c",
    activeStroke: "#10b981",
};

export function VideoFramePicker({ sourceUrl, initialTime, readOnly = false, onTimeCommit, onCancel, onConfirm, appearance = defaultAppearance }: VideoFramePickerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const timelineRunRef = useRef(0);
    const mountedRef = useRef(true);
    const initializedVideoUrlRef = useRef("");
    const [videoUrl, setVideoUrl] = useState("");
    const [duration, setDuration] = useState(0);
    const [time, setTime] = useState(0);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [actionError, setActionError] = useState("");

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        let objectUrl = "";
        timelineRunRef.current += 1;
        initializedVideoUrlRef.current = "";
        setVideoUrl("");
        setLoading(true);
        setLoadError("");
        setActionError("");
        setThumbnails([]);
        setDuration(0);
        setTime(0);
        if (!sourceUrl) {
            setLoading(false);
            setLoadError("来源视频不可用");
            return () => controller.abort();
        }
        void fetch(sourceUrl, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error("视频文件读取失败");
                return response.blob();
            })
            .then((blob) => {
                objectUrl = URL.createObjectURL(blob);
                if (active) setVideoUrl(objectUrl);
                else {
                    URL.revokeObjectURL(objectUrl);
                    objectUrl = "";
                }
            })
            .catch((error) => {
                if (active && !controller.signal.aborted) {
                    setLoading(false);
                    setLoadError(error instanceof Error ? error.message : "视频加载失败");
                }
            });
        return () => {
            active = false;
            controller.abort();
            timelineRunRef.current += 1;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [sourceUrl]);

    const initializeTimeline = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
            setLoading(false);
            setLoadError("无法读取视频时长");
            return;
        }
        const run = ++timelineRunRef.current;
        try {
            setLoading(true);
            const nextDuration = video.duration;
            const nextThumbnails: string[] = [];
            for (const frameTime of videoFrameTimeline(nextDuration)) {
                await seekVideoFrame(video, frameTime);
                if (timelineRunRef.current !== run) return;
                nextThumbnails.push(videoFramePreviewUrl(video));
            }
            const selectedTime = clampVideoFrameTime(nextDuration, initialTime ?? nextDuration / 2);
            await seekVideoFrame(video, selectedTime);
            if (timelineRunRef.current !== run) return;
            setDuration(nextDuration);
            setTime(selectedTime);
            setThumbnails(nextThumbnails);
            setLoading(false);
            if (initialTime == null) onTimeCommit(selectedTime);
        } catch (error) {
            if (timelineRunRef.current !== run) return;
            setLoading(false);
            setLoadError(error instanceof Error ? error.message : "视频时间轴生成失败");
        }
    }, [initialTime, onTimeCommit]);

    const updateFromPointer = useCallback(
        (clientX: number) => {
            const bounds = timelineRef.current?.getBoundingClientRect();
            const video = videoRef.current;
            if (!bounds || !video || !duration) return time;
            const nextTime = videoFrameTimeFromPointer(clientX, bounds.left, bounds.width, duration);
            video.currentTime = nextTime;
            setTime(nextTime);
            setActionError("");
            return nextTime;
        },
        [duration, time],
    );

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (readOnly || loading) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event.clientX);
    };

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (readOnly || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        updateFromPointer(event.clientX);
    };

    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (readOnly || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const nextTime = updateFromPointer(event.clientX);
        event.currentTarget.releasePointerCapture(event.pointerId);
        onTimeCommit(nextTime);
    };

    const confirmFrame = async () => {
        const video = videoRef.current;
        if (!video || confirming) return;
        setConfirming(true);
        setActionError("");
        try {
            const selectedTime = await seekVideoFrame(video, time);
            const blob = await captureVideoFrame(video);
            await onConfirm({ blob, time: selectedTime, width: video.videoWidth, height: video.videoHeight });
        } catch (error) {
            if (mountedRef.current) setActionError(error instanceof Error ? error.message : "当前画面固化失败");
        } finally {
            if (mountedRef.current) setConfirming(false);
        }
    };

    if (loadError) {
        return (
            <div data-canvas-no-zoom data-media-playback-exempt className="flex h-full w-full cursor-move flex-col items-center justify-center gap-3 p-5 text-center" style={{ background: appearance.fill, color: appearance.text }} onWheel={(event) => event.stopPropagation()}>
                <AlertTriangle className="size-6 opacity-55" />
                <span className="text-sm">{loadError}</span>
                {!readOnly ? (
                    <Button className="!h-9 !min-w-24 !rounded-lg" icon={<X className="size-4" />} onMouseDown={(event) => event.stopPropagation()} onClick={onCancel}>
                        取消
                    </Button>
                ) : null}
            </div>
        );
    }

    const end = clampVideoFrameTime(duration, Number.POSITIVE_INFINITY);
    const playheadLeft = end ? `${(time / end) * 100}%` : "50%";

    return (
        <div data-canvas-no-zoom data-media-playback-exempt className="flex h-full w-full flex-col overflow-hidden" style={{ background: appearance.fill, color: appearance.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="relative min-h-0 flex-1 cursor-move overflow-hidden" style={{ background: appearance.canvasBackground }}>
                {videoUrl ? (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        muted
                        playsInline
                        preload="auto"
                        className="h-full w-full object-contain"
                        onLoadedData={() => {
                            if (initializedVideoUrlRef.current === videoUrl) return;
                            initializedVideoUrlRef.current = videoUrl;
                            void initializeTimeline();
                        }}
                    />
                ) : null}
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs backdrop-blur-sm" style={{ background: appearance.fill, color: appearance.muted }}>
                        <LoaderCircle className="size-4 animate-spin" />
                        <span>正在生成视频时间轴</span>
                    </div>
                ) : null}
            </div>

            <div className="shrink-0 cursor-default space-y-2 p-3" style={{ borderTop: `1px solid ${appearance.stroke}` }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                <div
                    ref={timelineRef}
                    role="slider"
                    aria-label="选择视频帧"
                    aria-valuemin={0}
                    aria-valuemax={end}
                    aria-valuenow={time}
                    tabIndex={readOnly ? -1 : 0}
                    className={`relative flex h-14 select-none overflow-hidden rounded-lg border ${readOnly ? "cursor-default" : "cursor-ew-resize"}`}
                    style={{ borderColor: appearance.stroke, touchAction: "none" }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                        if (!readOnly) onTimeCommit(time);
                    }}
                >
                    {thumbnails.map((thumbnail, index) => (
                        <img key={index} src={thumbnail} alt="" draggable={false} className="min-w-0 flex-1 object-cover" />
                    ))}
                    <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2" style={{ left: playheadLeft, background: appearance.activeStroke, boxShadow: `0 0 0 1px ${appearance.fill}` }}>
                        <span className="absolute -top-px left-1/2 h-2 w-2 -translate-x-1/2 rounded-b-sm" style={{ background: appearance.activeStroke }} />
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: appearance.muted }}>
                    <span className="tabular-nums">
                        {formatVideoFrameTime(time)} / {formatVideoFrameTime(duration)}
                    </span>
                    {actionError ? (
                        <span className="min-w-0 flex-1 truncate text-right text-red-500" title={actionError}>
                            {actionError}
                        </span>
                    ) : null}
                </div>

                {!readOnly ? (
                    <div className="grid grid-cols-2 gap-2">
                        <Button className="!h-9 !w-full !rounded-lg" icon={<X className="size-4" />} disabled={confirming} onClick={onCancel}>
                            取消
                        </Button>
                        <Button type="primary" className="!h-9 !w-full !rounded-lg" icon={confirming ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} disabled={loading} loading={false} onClick={() => void confirmFrame()}>
                            确认
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
