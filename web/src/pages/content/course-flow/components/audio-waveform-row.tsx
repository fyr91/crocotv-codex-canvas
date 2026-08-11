import { Button, Checkbox, Skeleton, Tooltip } from "antd";
import { Download, Pause, Play, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { analyzeAudioSource } from "@/lib/audio/waveform";
import type { CourseFlowAudioVersion } from "@/types/course-flow";

export function AudioWaveformRow({ audio, selected, onSelect, onPlayed, onRegenerate, onDownload, onDurationResolved }: {
    audio: CourseFlowAudioVersion;
    selected: boolean;
    onSelect: () => void;
    onPlayed: () => void;
    onRegenerate: () => void;
    onDownload?: () => Promise<void> | void;
    onDurationResolved?: (durationMs: number) => void;
}) {
    const ref = useRef<HTMLAudioElement | null>(null);
    const durationCallback = useRef(onDurationResolved);
    const analyzedSource = useRef<string | undefined>(undefined);
    const [playing, setPlaying] = useState(false);
    const [analysis, setAnalysis] = useState<{ peaks: number[]; durationMs: number } | null>(null);
    const [waveformFailed, setWaveformFailed] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const generating = audio.status === "queued" || audio.status === "running";
    durationCallback.current = onDurationResolved;
    useEffect(() => {
        if (analyzedSource.current === audio.url) return;
        analyzedSource.current = audio.url;
        let active = true;
        setAnalysis(null);
        setWaveformFailed(false);
        if (!audio.url) return () => { active = false; };
        void analyzeAudioSource(audio.url).then((result) => {
            if (!active) return;
            setAnalysis(result);
            if (result.durationMs > 0 && result.durationMs !== audio.durationMs) durationCallback.current?.(result.durationMs);
        }).catch(() => { if (active) setWaveformFailed(true); });
        return () => { active = false; };
    }, [audio.url]);
    const play = () => { if (!ref.current || !audio.url) return; if (ref.current.paused) void ref.current.play(); else ref.current.pause(); };
    const durationMs = analysis?.durationMs || audio.durationMs;
    return (
        <div role={generating ? "status" : undefined} aria-live={generating ? "polite" : undefined} aria-label={generating ? "音频生成中" : undefined} className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2 ${selected ? "border-foreground bg-[var(--surface-selected)]" : "border-border"}`}>
            <Checkbox checked={selected} onChange={onSelect} aria-label={`选择版本 ${audio.version}`} />
            {!audio.played && audio.status === "ready" ? <Tooltip title="尚未试听"><span className="size-2 shrink-0 rounded-full bg-blue-500" /></Tooltip> : null}
            <button type="button" disabled={!audio.url} onClick={play} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border disabled:cursor-not-allowed disabled:opacity-40" aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}</button>
            <span className="w-14 shrink-0 text-xs text-muted-foreground">版本 {audio.version}</span>
            {audio.status === "failed" ? <span role="alert" title={audio.errorMessage || "音频生成失败，请重新生成"} className="min-w-16 flex-1 truncate text-xs text-destructive">{audio.errorMessage || "音频生成失败，请重新生成"}</span>
                : analysis ? <div role="img" aria-label="真实音频波形" className="flex h-8 min-w-0 flex-1 items-center gap-px overflow-hidden">
                {analysis.peaks.map((peak, index) => <span key={index} data-waveform-bar className="min-w-px flex-1 rounded-full bg-muted-foreground/45" style={{ height: `${Math.max(2, Math.round(peak * 28))}px` }} />)}
            </div> : waveformFailed ? <span className="min-w-16 flex-1 text-xs text-muted-foreground">波形暂不可用</span> : <div aria-label={generating ? "音频生成波形" : "音频波形加载中"} className="min-w-16 flex-1"><Skeleton.Input active block size="small" /></div>}
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatDuration(durationMs)}</span>
            <Button type="text" disabled={generating} icon={<RefreshCw className="size-4" />} aria-label="重新生成音频" title="重新生成音频" onClick={onRegenerate} />
            <Button type="text" loading={downloading} disabled={generating || audio.status !== "ready" || !audio.url} icon={<Download className="size-4" />} aria-label="下载音频" title="下载音频" onClick={() => {
                setDownloading(true);
                void Promise.resolve(onDownload?.()).finally(() => setDownloading(false));
            }} />
            <audio ref={ref} src={audio.url || undefined} onPlay={() => { setPlaying(true); onPlayed(); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        </div>
    );
}

function formatDuration(durationMs: number) {
    const seconds = Math.round(durationMs / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
