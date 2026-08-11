import { Button, Empty, Tooltip } from "antd";
import { Check, RefreshCw } from "lucide-react";

import type { CourseFlowSegment } from "@/types/course-flow";
import { isCoursePlanConfirmed } from "../segment-actions";
import { AudioWaveformRow } from "./audio-waveform-row";

export function AudioStep({ segments, batchRegenerating, onSelect, onPlayed, onRegenerate, onDownload, onRegenerateAll, onConfirmPlan, onDurationResolved, onNext }: {
    segments: CourseFlowSegment[];
    batchRegenerating: boolean;
    onSelect: (segmentId: string, audioId: string) => void;
    onPlayed: (segmentId: string, audioId: string) => void;
    onRegenerate: (segmentId: string, audioId: string) => void;
    onDownload?: (segmentId: string, audioId: string) => Promise<void> | void;
    onRegenerateAll: () => void;
    onConfirmPlan?: (segmentId: string) => void;
    onDurationResolved?: (segmentId: string, audioId: string, durationMs: number) => void;
    onNext: () => void;
}) {
    const selectedReady = segments.filter((segment) => segment.audioVersions.some((audio) => audio.id === segment.selectedAudioId && audio.status === "ready")).length;
    const audioGenerating = segments.some((segment) => segment.audioVersions.some((audio) => audio.status === "queued" || audio.status === "running"));
    return (
        <section className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-4 py-6 sm:px-8">
            <header className="mb-5"><h1 className="text-2xl font-semibold tracking-tight">确认课程音频</h1><p className="mt-1 text-sm text-muted-foreground">进入本步骤后自动生成全部片段音频；重新生成会新增一个版本，原版本继续保留。</p></header>
            {!segments.length ? <Empty className="my-auto" description="课程文案尚未生成" /> : <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-[var(--surface-raised)] shadow-[var(--elevation-card)] thin-scrollbar">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[var(--surface-raised)] px-4 py-3"><strong>课程音频 · {segments.length} 个片段</strong><div className="flex items-center gap-1"><span className="text-sm text-muted-foreground">可用 {selectedReady}/{segments.length}</span><Tooltip title={audioGenerating ? "请等待当前音频生成完成" : "重新生成全部音频"}><span><Button type="text" size="small" className="!size-8" aria-label="重新生成全部音频" icon={<RefreshCw className="size-4" />} loading={batchRegenerating} disabled={batchRegenerating || audioGenerating} onClick={onRegenerateAll} /></span></Tooltip></div></div>
                {segments.map((segment) => {
                    const selectedAudio = segment.audioVersions.find((audio) => audio.id === segment.selectedAudioId && audio.status === "ready");
                    return <article key={segment.id} className="border-b border-border p-4 last:border-b-0">
                    <div className="mb-3 grid items-start gap-3 sm:grid-cols-[72px_1fr_auto]"><span className="text-xs font-medium text-muted-foreground">片段 {String(segment.position + 1).padStart(2, "0")}</span><p className="line-clamp-2 text-sm leading-6">{segment.text}</p>{isCoursePlanConfirmed(segment)
                        ? <span aria-label="规划已确认" className="flex h-8 items-center gap-1.5 text-sm text-muted-foreground"><Check className="size-4" />已确认</span>
                        : <Button size="small" disabled={!selectedAudio} onClick={() => onConfirmPlan?.(segment.id)}>确认并生成规划</Button>}</div>
                    <div className="space-y-2 sm:pl-[84px]">{segment.audioVersions.length ? segment.audioVersions.map((audio) =>
                        <AudioWaveformRow key={audio.id} audio={audio} selected={audio.id === segment.selectedAudioId} onSelect={() => onSelect(segment.id, audio.id)} onPlayed={() => onPlayed(segment.id, audio.id)} onRegenerate={() => onRegenerate(segment.id, audio.id)} onDownload={() => onDownload?.(segment.id, audio.id)} onDurationResolved={(durationMs) => onDurationResolved?.(segment.id, audio.id, durationMs)} />)
                        : <AudioWaveformRow audio={{ id: `pending:${segment.id}`, version: 1, assetId: null, url: "", durationMs: 0, status: "queued", errorMessage: null, played: false }} selected onSelect={() => undefined} onPlayed={() => undefined} onRegenerate={() => undefined} />}</div>
                </article>})}
            </div>}
            <footer className="mt-4 flex justify-end"><Button type="primary" disabled={selectedReady !== segments.length} onClick={onNext}>下一步：视频设置</Button></footer>
        </section>
    );
}
