import { Alert, Button, Spin } from "antd";
import { ScanLine } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
    audioSegmentWavBlob,
    buildAutomaticAudioSegments,
    detectSpeechSegments,
    type AudioSegmentationSubmit,
    type AudioSegmentDraft,
} from "@/lib/audio/segmentation";
import { AudioWaveformEditor } from "@/pages/content/components/audio-waveform-editor";

export function AudioSegmentationPanel({
    nodeId,
    url,
    durationMs,
    submitting = false,
    disabled = false,
    onSubmit,
    actions,
}: {
    nodeId: string;
    title: string;
    url: string;
    durationMs?: number | null;
    submitting?: boolean;
    disabled?: boolean;
    onSubmit: (input: AudioSegmentationSubmit) => Promise<void>;
    actions?: ReactNode;
}) {
    const [audio, setAudio] = useState<AudioBuffer | null>(null);
    const [segments, setSegments] = useState<AudioSegmentDraft[]>([]);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        setAudio(null);
        setSegments([]);
        setProcessing(false);
        setError("");
        void (async () => {
            let context: AudioContext | null = null;
            try {
                context = new AudioContext();
                const response = await fetch(url);
                if (!response.ok) throw new Error("音频读取失败");
                const decoded = await context.decodeAudioData(await response.arrayBuffer());
                if (active) setAudio(decoded);
            } catch (cause) {
                if (active) setError(cause instanceof Error ? cause.message : "音频波形加载失败");
            } finally {
                await context?.close();
            }
        })();
        return () => { active = false; };
    }, [url]);

    const autoSegment = async () => {
        if (!audio) return;
        setProcessing(true);
        setError("");
        try {
            setSegments(buildAutomaticAudioSegments(await detectSpeechSegments(audio), audio.duration * 1000));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "VAD 自动分割失败");
        } finally {
            setProcessing(false);
        }
    };

    const submit = async () => {
        if (!audio || !segments.length) return;
        setError("");
        try {
            await onSubmit({
                parentNodeId: nodeId,
                segmentationRunId: crypto.randomUUID(),
                segments: segments.map((segment, index) => ({
                    ...segment,
                    index,
                    blob: audioSegmentWavBlob(audio, segment),
                })),
            });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "音频分段保存失败");
        }
    };
    const canAutoSegment = Math.round((audio?.duration || (durationMs || 0) / 1000) * 1000) > 20_000;

    return (
        <section className="flex h-full min-h-0 flex-col" aria-label="音频分段面板">
            <div className="border-b border-border px-4 py-4">
                <h2 className="font-semibold">音频分段</h2>
                <p className="mt-1 text-xs text-muted-foreground">可在波形上调整、添加、删除或合并片段。</p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" data-canvas-scroll>
                {error ? <Alert type="error" showIcon message={error} /> : null}
                {audio ? (
                    <div className="space-y-3" aria-label="音频分段操作区">
                        <AudioWaveformEditor audio={audio} url={url} segments={segments} onChange={setSegments} />
                        {canAutoSegment ? (
                            <div className="flex justify-end">
                                <Button size="small" icon={<ScanLine className="size-4" />} loading={processing} disabled={disabled || !audio} onClick={() => void autoSegment()}>VAD 自动分割</Button>
                            </div>
                        ) : null}
                        {segments.length ? <Button block type="primary" loading={submitting} disabled={disabled || processing} onClick={() => void submit()}>确认分段</Button> : null}
                    </div>
                ) : (
                    !error ? <div className="grid min-h-32 place-items-center"><Spin /></div> : null
                )}
            </div>
            {actions ? <div className="grid gap-2 border-t border-border p-4" aria-label="音频后续操作">{actions}</div> : null}
        </section>
    );
}
