import { Alert, Button, Input, Modal, Skeleton, Tooltip } from "antd";
import { ChevronLeft, ChevronRight, Pause, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { courseMaterialStoryboardState } from "@/lib/course-flow/material-storyboard";
import type { CourseFlowAudioVersion, CourseFlowSegment, CourseSceneAspectRatio } from "@/types/course-flow";
import { useHorizontalRail } from "../use-horizontal-rail";
import { isMaterialPlanFresh, materialPlanState, selectedCourseAudio } from "../video-planning";

export function VideoPlanningStep({ segments, materialStylePrompt, planningSegmentIds, planningErrors, savingStyle, aspectRatio = "16:9", onStyleChange, onRegenerateSegment, onShotPromptChange, onShotPromptSave, onRegenerateStoryboard, onNext }: {
    segments: CourseFlowSegment[];
    materialStylePrompt: string;
    planningSegmentIds: Set<string>;
    planningErrors: Record<string, string>;
    savingStyle: boolean;
    aspectRatio?: CourseSceneAspectRatio;
    onStyleChange: (value: string) => void;
    onRegenerateSegment: (segmentId: string) => void;
    onShotPromptChange: (shotId: string, value: string) => void;
    onShotPromptSave: (shotId: string, value: string) => void;
    onRegenerateStoryboard?: (segmentId: string, shotId: string) => void;
    onNext: () => void;
}) {
    const [stylePrompt, setStylePrompt] = useState(materialStylePrompt);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const { railRef, dragging, onPointerDown: onRailPointerDown, onPointerMove: onRailPointerMove, onPointerUp: stopRailDrag, onPointerCancel: cancelRailDrag, onClickCapture: onRailClickCapture } = useHorizontalRail();
    useEffect(() => setStylePrompt(materialStylePrompt), [materialStylePrompt]);
    const states = useMemo(() => segments.map((segment) => materialPlanState(segment, planningSegmentIds.has(segment.id), planningErrors[segment.id])), [planningErrors, planningSegmentIds, segments]);
    const storyboardPreviews = useMemo(() => segments.flatMap((segment) => segment.materialShots.flatMap((shot) => {
        if (!shot.storyboardUrl) return [];
        const segmentLabel = String(segment.position + 1).padStart(2, "0");
        const shotLabel = String(shot.position + 1).padStart(2, "0");
        return [{ id: `${segment.id}:${shot.id}`, title: `片段 ${segmentLabel} 画面 ${shotLabel} 分镜图`, url: shot.storyboardUrl, prompt: shot.prompt }];
    })), [segments]);
    const previewIndex = storyboardPreviews.findIndex((item) => item.id === previewId);
    const preview = previewIndex >= 0 ? storyboardPreviews[previewIndex] : null;
    const allShots = segments.flatMap((segment) => segment.materialShots);
    const storyboardReady = allShots.filter((shot) => courseMaterialStoryboardState(shot) === "ready").length;
    const planning = states.filter((state) => state === "planning").length;
    const failed = states.filter((state) => state === "failed").length;
    const canGenerate = Boolean(stylePrompt.trim()) && segments.length > 0 && segments.every((segment) => (
        selectedCourseAudio(segment)
        && isMaterialPlanFresh(segment)
        && segment.materialShots.every((shot) => shot.prompt.trim() && shot.durationSeconds > 0 && shot.durationSeconds <= 15 && courseMaterialStoryboardState(shot) === "ready")
    ));
    const progress = planning
        ? `正在准备内容画面 · ${segments.length - planning}/${segments.length}`
        : failed
            ? `${failed} 个片段准备失败`
            : allShots.length && storyboardReady < allShots.length
                ? `正在准备分镜 · ${storyboardReady}/${allShots.length}`
                : `分镜已准备 · ${storyboardReady}/${allShots.length}`;
    useEffect(() => {
        if (!preview) return;
        const navigatePreview = (event: KeyboardEvent) => {
            if (event.key === "ArrowLeft" && previewIndex > 0) {
                event.preventDefault();
                setPreviewId(storyboardPreviews[previewIndex - 1].id);
            }
            if (event.key === "ArrowRight" && previewIndex < storyboardPreviews.length - 1) {
                event.preventDefault();
                setPreviewId(storyboardPreviews[previewIndex + 1].id);
            }
        };
        document.addEventListener("keydown", navigatePreview);
        return () => document.removeEventListener("keydown", navigatePreview);
    }, [preview, previewIndex, storyboardPreviews]);
    return (
        <section aria-label="视频规划页面" className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1120px] px-4 pt-5 sm:px-8">
            <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><h1 className="text-2xl font-semibold tracking-tight">视频生成规划</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">根据课程文案与音频规划内容画面，确认分镜后即可生成视频。</p></div>
                <p aria-live="polite" className="text-sm font-medium text-muted-foreground">{progress}</p>
            </header>

            <div className="mb-4 rounded-xl border border-border bg-[var(--surface-raised)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="course-material-style" className="text-sm font-semibold">内容素材统一风格</label><span className="text-xs text-muted-foreground">素材视频清晰度：480p{savingStyle ? " · 保存中" : ""}</span></div>
                <Input.TextArea id="course-material-style" className="mt-3" value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} onBlur={() => stylePrompt !== materialStylePrompt && onStyleChange(stylePrompt)} autoSize={{ minRows: 2, maxRows: 5 }} />
                <p className="mt-2 text-xs leading-5 text-muted-foreground">素材风格不会参与画面内容规划，只会在生成视频时与内容提示词组合。</p>
            </div>
            </div>

            <div className="w-full px-4 sm:px-8">
            <div
                ref={railRef}
                role="region"
                aria-label="视频规划片段横向列表"
                tabIndex={0}
                className={`touch-pan-y overflow-x-auto overflow-y-hidden pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring thin-scrollbar ${dragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
                onPointerDown={onRailPointerDown}
                onPointerMove={onRailPointerMove}
                onPointerUp={stopRailDrag}
                onPointerCancel={cancelRailDrag}
                onClickCapture={onRailClickCapture}
            >
                <div className="flex w-max min-w-full items-stretch gap-3">
                    {segments.map((segment, index) => {
                        const state = states[index];
                        const audio = selectedCourseAudio(segment);
                        const error = planningErrors[segment.id];
                        const segmentLabel = String(segment.position + 1).padStart(2, "0");
                        const placeholderCount = Math.max(1, Math.ceil((audio?.durationMs || 1) / 15_000));
                        const visibleShotCount = state === "planning" ? placeholderCount : Math.max(1, segment.materialShots.length);
                        return <article key={segment.id} aria-label={`片段 ${segment.position + 1} 视频规划`} className="flex shrink-0 flex-col rounded-xl border border-border bg-[var(--surface-raised)] p-3" style={{ width: segmentCardWidth(visibleShotCount) }}>
                        <div className="mb-3 border-b border-border pb-3">
                            <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">片段 {segmentLabel}{audio ? ` · ${formatDuration(audio.durationMs)}` : " · 缺少可用音频"}</p><Button size="small" type="text" aria-label={`重新生成片段 ${segmentLabel} 的画面素材提示词`} icon={<RefreshCw className="size-3.5" />} loading={state === "planning"} disabled={!audio || state === "planning"} onClick={() => onRegenerateSegment(segment.id)}>重新生成规划</Button></div>
                            <p className="mt-1.5 h-[3.75rem] line-clamp-3 text-sm leading-5" title={segment.text}>{segment.text}</p>
                            {audio ? <SegmentAudioPreview audio={audio} segmentLabel={segmentLabel} /> : null}
                        </div>

                        {state === "planning" ? <StoryboardSkeletons count={placeholderCount} aspectRatio={aspectRatio} segmentLabel={segmentLabel} /> : null}
                        {state === "stale" ? <Alert type="warning" showIcon title={audio ? "文案或音频已变化，需要重新规划" : "请先准备并选择可用音频"} /> : null}
                        {error ? <Alert role="alert" className="mb-3" type="error" showIcon title="本片段规划失败" description={error} /> : null}
                        {state === "invalid" ? <Alert role="alert" className="mb-3" type="warning" showIcon title="提示词或画面时长无效，请修改后继续" /> : null}
                        {state !== "planning" && segment.materialShots.length ? <div role="list" aria-label={`片段 ${segmentLabel} 画面列表`} className="flex flex-1 items-stretch gap-3">{segment.materialShots.map((shot) => {
                            const shotLabel = String(shot.position + 1).padStart(2, "0");
                            const imageLabel = `片段 ${segmentLabel} 画面 ${shotLabel} 分镜图`;
                            const storyboardState = courseMaterialStoryboardState(shot);
                            const loading = storyboardState === "queued" || storyboardState === "running";
                            return <section role="listitem" key={shot.id} className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-[var(--surface-sunken)]">
                                <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 text-xs text-muted-foreground"><span>画面 {shotLabel}</span><div className="flex items-center gap-1"><span>{formatSeconds(shot.durationSeconds)}</span><Tooltip title={loading ? "分镜图生成中" : "重新生成分镜图"}><span><Button type="text" size="small" className="!-my-1 !size-8" icon={<RefreshCw className="size-3.5" />} loading={loading} disabled={loading || !onRegenerateStoryboard} aria-label={`重新生成${imageLabel}`} onClick={() => onRegenerateStoryboard?.(segment.id, shot.id)} /></span></Tooltip></div></div>
                                <div className="relative overflow-hidden bg-[var(--surface-sunken)]" style={{ aspectRatio: aspectRatio.replace(":", " / ") }}>
                                    {loading ? <StoryboardLoading label={`${imageLabel}生成中`} /> : shot.storyboardUrl ? <button type="button" className="h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setPreviewId(`${segment.id}:${shot.id}`)}><img src={shot.storyboardUrl} alt={imageLabel} className="h-full w-full object-cover" /></button> : <div className="grid h-full w-full place-items-center px-6 text-center text-xs text-muted-foreground">分镜图尚未生成</div>}
                                </div>
                                <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                                    {storyboardState === "stale" ? <Alert type="warning" showIcon title="提示词已修改，请重新生成分镜" /> : null}
                                    {shot.storyboardErrorMessage ? <Alert role="alert" type="error" showIcon title="分镜图生成失败" description={shot.storyboardErrorMessage} /> : null}
                                    <label className="block text-xs font-medium text-muted-foreground" htmlFor={`course-shot-${shot.id}`}>画面素材提示词</label>
                                    <Input.TextArea size="small" rows={4} id={`course-shot-${shot.id}`} aria-label={`片段 ${segment.position + 1} 画面 ${shot.position + 1} 提示词`} value={shot.prompt} onChange={(event) => onShotPromptChange(shot.id, event.target.value)} onBlur={(event) => onShotPromptSave(shot.id, event.target.value)} />
                                </div>
                            </section>;
                        })}</div> : null}
                        </article>;
                    })}
                </div>
            </div>
            </div>

            <div className="mx-auto w-full max-w-[1120px] px-4 pb-5 sm:px-8">
            <footer className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4"><p className="text-xs text-muted-foreground">请检查全部分镜；提示词变化后需要重新生成对应分镜。</p><Button type="primary" disabled={!canGenerate} onClick={onNext}>生成视频</Button></footer>
            </div>
            <Modal
                title={preview ? <div className="flex items-center justify-between gap-4 pr-8"><span>{preview.title}</span><span className="shrink-0 text-xs font-normal text-muted-foreground">{previewIndex + 1} / {storyboardPreviews.length}</span></div> : null}
                open={Boolean(preview)}
                footer={null}
                width={960}
                onCancel={() => setPreviewId(null)}
                styles={{ body: { maxHeight: "calc(100vh - 160px)", overflowY: "auto" } }}
            >
                {preview ? <div className="space-y-4">
                    <div className="relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-[var(--surface-sunken)]">
                        <img src={preview.url} alt={`${preview.title}放大预览`} className="max-h-[60vh] w-full object-contain" />
                        <Button className="!absolute !left-3 !top-1/2 !size-11 !-translate-y-1/2" shape="circle" aria-label="上一张分镜图" title="上一张分镜图" disabled={previewIndex === 0} icon={<ChevronLeft className="size-5" />} onClick={() => setPreviewId(storyboardPreviews[previewIndex - 1].id)} />
                        <Button className="!absolute !right-3 !top-1/2 !size-11 !-translate-y-1/2" shape="circle" aria-label="下一张分镜图" title="下一张分镜图" disabled={previewIndex === storyboardPreviews.length - 1} icon={<ChevronRight className="size-5" />} onClick={() => setPreviewId(storyboardPreviews[previewIndex + 1].id)} />
                    </div>
                    <div className="rounded-xl border border-border bg-[var(--surface-sunken)] p-4">
                        <p className="text-xs font-medium text-muted-foreground">画面素材提示词</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{preview.prompt}</p>
                    </div>
                </div> : null}
            </Modal>
        </section>
    );
}

function SegmentAudioPreview({ audio, segmentLabel }: { audio: CourseFlowAudioVersion; segmentLabel: string }) {
    const ref = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const label = `片段 ${segmentLabel} 已选音频`;
    const toggle = () => {
        if (!ref.current) return;
        if (ref.current.paused) void ref.current.play().catch(() => setPlaying(false));
        else ref.current.pause();
    };
    return <div role="group" aria-label={`${label}预览`} className="mt-2 flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-[var(--surface-sunken)] px-2">
        <button type="button" onClick={toggle} aria-label={`${playing ? "暂停" : "播放"}${label}`} title={playing ? "暂停音频" : "播放音频"} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {playing ? <Pause className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}
        </button>
        <span className="shrink-0 text-xs text-muted-foreground">已选音频 · {formatAudioDuration(audio.durationMs)}</span>
        <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-border" />
        <audio ref={ref} src={audio.url} preload="metadata" aria-label={label} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </div>;
}

function StoryboardSkeletons({ count, aspectRatio, segmentLabel }: { count: number; aspectRatio: CourseSceneAspectRatio; segmentLabel: string }) {
    return <div role="status" className="flex flex-1"><span className="sr-only">正在规划本片段的内容画面</span><div role="list" aria-label={`片段 ${segmentLabel} 画面列表`} className="flex flex-1 items-stretch gap-3">{Array.from({ length: count }, (_, index) => {
        const shotLabel = String(index + 1).padStart(2, "0");
        return <div role="listitem" key={index} className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-[var(--surface-sunken)]"><div className="border-b border-border px-2.5 py-1.5 text-xs text-muted-foreground">画面 {shotLabel}</div><div style={{ aspectRatio: aspectRatio.replace(":", " / ") }}><StoryboardLoading label={`片段 ${segmentLabel} 画面 ${shotLabel} 分镜图生成中`} /></div><div className="flex-1 p-2.5"><Skeleton active title={false} paragraph={{ rows: 2 }} /></div></div>;
    })}</div></div>;
}

function StoryboardLoading({ label }: { label: string }) {
    return <div role="status" aria-label={label} className="h-full w-full"><Skeleton.Node active className="!block !h-full !w-full [&_.ant-skeleton-node]:!h-full [&_.ant-skeleton-node]:!w-full" /></div>;
}

function segmentCardWidth(shotCount: number) {
    return shotCount * 288 + Math.max(0, shotCount - 1) * 12 + 26;
}

function formatDuration(durationMs: number) {
    return formatSeconds(durationMs / 1000);
}

function formatAudioDuration(durationMs: number) {
    const seconds = Math.round(durationMs / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatSeconds(seconds: number) {
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} 秒`;
}
