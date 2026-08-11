import { Button, Dropdown, Tooltip } from "antd";
import { Merge, Scissors, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { applyAudioSegmentCommand, buildWaveformPeaks, type AudioSegmentDraft } from "@/lib/audio/segmentation";

type DragState =
    | { type: "create"; pointerId: number; startMs: number; currentMs: number; minMs: number; maxMs: number; moved: boolean }
    | { type: "edge"; pointerId: number; index: number; edge: "start" | "end"; startX: number; original: AudioSegmentDraft }
    | { type: "move"; pointerId: number; index: number; startX: number; original: AudioSegmentDraft };

export function AudioWaveformEditor({ audio, url, segments, onChange }: { audio: AudioBuffer; url?: string; segments: AudioSegmentDraft[]; onChange: (segments: AudioSegmentDraft[]) => void }) {
    const peaks = useMemo(() => buildWaveformPeaks(audio.getChannelData(0), 120), [audio]);
    const durationMs = Math.round(audio.duration * 1000);
    const waveformRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLAudioElement>(null);
    const previewEndRef = useRef(durationMs);
    const dragRef = useRef<DragState | null>(null);
    const suppressClickRef = useRef(false);
    const [creating, setCreating] = useState<AudioSegmentDraft | null>(null);
    const [playheadMs, setPlayheadMs] = useState(0);
    const [hasPlacedPlayhead, setHasPlacedPlayhead] = useState(false);
    const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
    const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
    const selectedIndexList = [...selectedIndexes].filter((index) => segments[index]).sort((a, b) => a - b);
    const selectedIndex = selectedIndexList.length === 1 ? selectedIndexList[0] : -1;
    const selected = segments[selectedIndex];
    const canSplitAtPlayhead = hasPlacedPlayhead
        && playheadMs > 0
        && playheadMs < durationMs
        && !segments.some((segment) => playheadMs === segment.startMs || playheadMs === segment.endMs);

    const eventMs = (event: { clientX: number }) => {
        const rect = waveformRef.current?.getBoundingClientRect();
        if (!rect?.width) return 0;
        return Math.max(0, Math.min(durationMs, (event.clientX - rect.left) / rect.width * durationMs));
    };
    const movePlayhead = (event: { clientX: number }) => {
        const next = Math.round(eventMs(event));
        setPlayheadMs(next);
        setHasPlacedPlayhead(true);
        waveformRef.current?.focus();
        if (previewRef.current && !previewRef.current.paused) previewRef.current.currentTime = next / 1000;
    };
    const clickWaveform = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        movePlayhead(event);
    };
    const startCreate = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const startMs = Math.round(eventMs(event));
        setPlayheadMs(startMs);
        setHasPlacedPlayhead(true);
        const minMs = segments.filter((segment) => segment.endMs <= startMs).at(-1)?.endMs || 0;
        const maxMs = segments.find((segment) => segment.startMs >= startMs)?.startMs || durationMs;
        dragRef.current = { type: "create", pointerId: event.pointerId, startMs, currentMs: startMs, minMs, maxMs, moved: false };
        setCreating({ startMs, endMs: startMs });
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const startDrag = (event: ReactPointerEvent, drag: Exclude<DragState, { type: "create" }>) => {
        event.stopPropagation();
        dragRef.current = drag;
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const selectSegment = (event: ReactMouseEvent | ReactPointerEvent, index: number) => {
        event.stopPropagation();
        movePlayhead(event);
        if (event.shiftKey && selectionAnchor !== null) {
            const start = Math.min(selectionAnchor, index);
            const end = Math.max(selectionAnchor, index);
            setSelectedIndexes(new Set(Array.from({ length: end - start + 1 }, (_, offset) => start + offset)));
            return;
        }
        if (event.metaKey || event.ctrlKey) {
            setSelectedIndexes((current) => {
                const next = new Set(current);
                if (next.has(index)) next.delete(index);
                else next.add(index);
                return next;
            });
        } else setSelectedIndexes(new Set([index]));
        setSelectionAnchor(index);
    };
    const mergeSegments = (indexes: number[]) => {
        const first = Math.min(...indexes);
        onChange(applyAudioSegmentCommand(segments, { type: "merge-selected", indexes }, durationMs));
        setSelectedIndexes(new Set([first]));
        setSelectionAnchor(first);
    };
    const deleteSelectedSegments = () => {
        if (!selectedIndexList.length) return;
        onChange(applyAudioSegmentCommand(segments, { type: "delete-selected", indexes: selectedIndexList }, durationMs));
        setSelectedIndexes(new Set());
        setSelectionAnchor(null);
    };
    const splitAtPlayhead = () => {
        if (!canSplitAtPlayhead) return;
        onChange(applyAudioSegmentCommand(segments, { type: "split-at", atMs: playheadMs }, durationMs));
        setSelectedIndexes(new Set());
        setSelectionAnchor(null);
    };
    const togglePreview = () => {
        const preview = previewRef.current;
        if (!preview) return;
        if (!preview.paused) {
            preview.pause();
            setPlayheadMs(Math.round(preview.currentTime * 1000));
            return;
        }
        const startMs = playheadMs >= durationMs ? 0 : playheadMs;
        const selectedRange = selectedIndexList.map((index) => segments[index]).find((segment) => segment && startMs >= segment.startMs && startMs < segment.endMs);
        previewEndRef.current = selectedRange?.endMs || durationMs;
        preview.currentTime = startMs / 1000;
        setPlayheadMs(startMs);
        void preview.play();
    };
    const handleKeyDown = (event: ReactKeyboardEvent) => {
        if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        if (event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            togglePreview();
        } else if ((event.key === "Backspace" || event.key === "Delete") && selectedIndexList.length) {
            event.preventDefault();
            event.stopPropagation();
            deleteSelectedSegments();
        }
    };
    const syncPreview = () => {
        const preview = previewRef.current;
        if (!preview) return;
        const currentMs = Math.round(preview.currentTime * 1000);
        if (currentMs >= previewEndRef.current) {
            preview.pause();
            preview.currentTime = previewEndRef.current / 1000;
            setPlayheadMs(previewEndRef.current);
        } else setPlayheadMs(currentMs);
    };
    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const rect = waveformRef.current?.getBoundingClientRect();
        if (!drag || !rect?.width || drag.pointerId !== event.pointerId) return;
        if (drag.type === "create") {
            const currentMs = Math.max(drag.minMs, Math.min(drag.maxMs, Math.round(eventMs(event))));
            drag.currentMs = currentMs;
            drag.moved ||= Math.abs(currentMs - drag.startMs) >= 10;
            setCreating({ startMs: Math.min(drag.startMs, currentMs), endMs: Math.max(drag.startMs, currentMs) });
            return;
        }
        const deltaMs = Math.round((event.clientX - drag.startX) / rect.width * durationMs);
        if (drag.type === "edge") {
            const delta = drag.edge === "start" ? deltaMs : deltaMs;
            const base = segments.map((segment, index) => index === drag.index ? drag.original : segment);
            onChange(applyAudioSegmentCommand(base, { type: "move", index: drag.index, edge: drag.edge, deltaMs: delta }, durationMs));
            return;
        }
        const previousEnd = segments[drag.index - 1]?.endMs || 0;
        const nextStart = segments[drag.index + 1]?.startMs || durationMs;
        const width = drag.original.endMs - drag.original.startMs;
        const startMs = Math.max(previousEnd, Math.min(nextStart - width, drag.original.startMs + deltaMs));
        onChange(segments.map((segment, index) => index === drag.index ? { startMs, endMs: startMs + width } : segment));
    };
    const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.type === "create" && creating && creating.endMs - creating.startMs >= 10) {
            const next = applyAudioSegmentCommand(segments, { type: "add", ...creating }, durationMs);
            onChange(next);
            const createdIndex = Math.max(0, next.findIndex((segment) => segment.startMs === creating.startMs && segment.endMs === creating.endMs));
            setSelectedIndexes(new Set([createdIndex]));
            setSelectionAnchor(createdIndex);
        }
        if (drag.type === "create") suppressClickRef.current = drag.moved;
        dragRef.current = null;
        setCreating(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <div className="space-y-3" aria-label="音频波形分段编辑器" onKeyDown={handleKeyDown}>
            {url ? <audio ref={previewRef} src={url} preload="auto" className="hidden" aria-label="波形音频预览" onTimeUpdate={syncPreview} onEnded={() => setPlayheadMs(durationMs)} /> : null}
            <div className="relative pb-10">
                <div
                    ref={waveformRef}
                    tabIndex={0}
                    aria-label="音频波形"
                    className="relative h-24 touch-none overflow-hidden rounded-xl bg-[var(--surface-sunken)]"
                    onClick={clickWaveform}
                    onPointerDown={startCreate}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                >
                    <div className="pointer-events-none absolute inset-0 flex items-center gap-px px-2" aria-hidden="true">
                        {peaks.map((peak, index) => <span key={index} className="w-full bg-primary/55" style={{ height: `${Math.max(2, peak * 72)}px` }} />)}
                    </div>
                    {segments.map((segment, index) => {
                        const mergeSelected = selectedIndexes.size >= 2 && selectedIndexes.has(index);
                        const contextMergeIndexes = mergeSelected
                            ? selectedIndexList
                            : index < segments.length - 1 ? [index, index + 1] : index > 0 ? [index - 1, index] : [];
                        return (
                            <Dropdown
                                key={`${index}-${segment.startMs}-${segment.endMs}`}
                                trigger={["contextMenu"]}
                                menu={{ items: [{
                                    key: "merge",
                                    icon: <Merge className="size-4" />,
                                    label: mergeSelected ? `合并选中片段（${selectedIndexList.length}）` : index < segments.length - 1 ? "与下一段合并" : "与上一段合并",
                                    disabled: contextMergeIndexes.length < 2,
                                    onClick: () => mergeSegments(contextMergeIndexes),
                                }] }}
                            >
                                <div
                                    role="slider"
                                    tabIndex={0}
                                    aria-label={`第 ${index + 1} 段音频范围`}
                                    aria-valuemin={0}
                                    aria-valuemax={durationMs}
                                    aria-valuenow={segment.startMs}
                                    className={`absolute inset-y-1 cursor-grab rounded-lg border-x-[3px] border-y-2 border-primary/35 outline-none ring-primary/20 transition-colors duration-150 focus:ring-2 active:cursor-grabbing ${selectedIndexes.has(index) ? "bg-primary/[0.14] ring-2" : "bg-primary/[0.07] hover:bg-primary/[0.1]"}`}
                                    style={{ left: `${segment.startMs / durationMs * 100}%`, width: `${(segment.endMs - segment.startMs) / durationMs * 100}%` }}
                                    onPointerDown={(event) => {
                                        selectSegment(event, index);
                                        startDrag(event, { type: "move", pointerId: event.pointerId, index, startX: event.clientX, original: segment });
                                    }}
                                >
                                    <button
                                        type="button"
                                        aria-label={`调整第 ${index + 1} 段开始时间`}
                                        className="absolute inset-y-0 left-0 w-3 cursor-ew-resize bg-transparent"
                                        onPointerDown={(event) => startDrag(event, { type: "edge", pointerId: event.pointerId, index, edge: "start", startX: event.clientX, original: segment })}
                                    />
                                    <button
                                        type="button"
                                        aria-label={`调整第 ${index + 1} 段结束时间`}
                                        className="absolute inset-y-0 right-0 w-3 cursor-ew-resize bg-transparent"
                                        onPointerDown={(event) => startDrag(event, { type: "edge", pointerId: event.pointerId, index, edge: "end", startX: event.clientX, original: segment })}
                                    />
                                </div>
                            </Dropdown>
                        );
                    })}
                    {creating ? <div className="pointer-events-none absolute inset-y-1 rounded-lg border-2 border-dashed border-primary bg-primary/10" style={{ left: `${creating.startMs / durationMs * 100}%`, width: `${(creating.endMs - creating.startMs) / durationMs * 100}%` }} /> : null}
                    <div aria-label="播放光标" className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-primary" style={{ left: `${playheadMs / durationMs * 100}%` }}>
                        <span className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-primary" />
                    </div>
                </div>
                {canSplitAtPlayhead ? (
                    <div className="absolute top-[6.25rem] -translate-x-1/2" style={{ left: `${playheadMs / durationMs * 100}%` }}>
                        <Tooltip title="在光标处分割">
                            <Button className="size-8 min-w-8" type="text" aria-label="在光标处分割" icon={<Scissors className="size-4" />} onClick={splitAtPlayhead} />
                        </Tooltip>
                    </div>
                ) : null}
            </div>
            {segments.length ? (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{selected ? `${(selected.startMs / 1000).toFixed(2)}–${(selected.endMs / 1000).toFixed(2)} 秒` : selectedIndexList.length > 1 ? `已选择 ${selectedIndexList.length} 段` : `光标 · ${(playheadMs / 1000).toFixed(2)} 秒`}</span>
                    <div className="flex">
                        {selectedIndexList.length >= 2 ? <Tooltip title="合并选中片段"><Button type="text" aria-label="合并选中片段" icon={<Merge className="size-4" />} onClick={() => mergeSegments(selectedIndexList)} /></Tooltip> : null}
                        {selectedIndexList.length ? <Tooltip title="删除选中片段"><Button type="text" danger aria-label="删除选中片段" icon={<Trash2 className="size-4" />} onClick={deleteSelectedSegments} /></Tooltip> : null}
                    </div>
                </div>
            ) : null}
            <p className="text-xs text-muted-foreground">点击波形移动播放光标，拖拽空白处创建片段；空格播放或暂停，Control / Command / Shift 多选后可合并或删除。</p>
            <div className="sr-only" aria-live="polite">当前共 {segments.length} 个音频段</div>
        </div>
    );
}
