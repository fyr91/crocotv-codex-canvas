import { Tooltip } from "antd";
import { Eye, EyeOff, Lock, LockOpen, Minus, Plus, Scissors, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { timeFromTimelinePoint, timelineSections, wheelToHorizontalDelta } from "@/lib/content-factory/timeline";
import type { FactoryLayer, FactorySection } from "@/types/content-factory";
import { TimelineCell } from "./timeline-cell";

const tracks: Array<{ layer: FactoryLayer; label: string; height: number }> = [
    { layer: "video", label: "视频", height: 94 },
    { layer: "image", label: "画面", height: 94 },
    { layer: "visual_prompt", label: "画面提示词", height: 90 },
    { layer: "audio", label: "音频", height: 72 },
    { layer: "script", label: "文案", height: 104 },
];

export function TimelineEditor({ sections, playheadMs, onSeek, onDelete, onInsert, onEdit, onRegenerate, onSelectVersion }: { sections: FactorySection[]; playheadMs: number; onSeek: (timeMs: number) => void; onDelete: (section: FactorySection) => void; onInsert: (position: number) => void; onEdit: (section: FactorySection, layer: "script" | "visual_prompt") => void; onRegenerate: (section: FactorySection, layer: FactoryLayer) => void; onSelectVersion: (section: FactorySection, layer: FactoryLayer, id: string) => void }) {
    const [pixelsPerSecond, setPixelsPerSecond] = useState(46);
    const scroller = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null);
    const layout = useMemo(() => timelineSections(sections.map((section) => ({ id: section.id, durationMs: selectedDuration(section) }))), [sections]);
    const railWidth = Math.max(900, (layout.at(-1)?.endMs || 0) / 1000 * pixelsPerSecond);
    useEffect(() => {
        const element = scroller.current;
        if (!element) return;
        const wheel = (event: WheelEvent) => { event.preventDefault(); element.scrollLeft += wheelToHorizontalDelta(event); };
        element.addEventListener("wheel", wheel, { passive: false });
        return () => element.removeEventListener("wheel", wheel);
    }, []);
    const seek = (event: React.MouseEvent<HTMLDivElement>) => {
        if (drag.current?.moved || !scroller.current || (event.target as HTMLElement).closest("button,input,textarea,select,[role=button]")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(timeFromTimelinePoint(event.clientX, rect.left, 0, pixelsPerSecond));
    };
    return (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-border bg-[var(--surface-raised)]">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
                <div className="flex items-center gap-1"><Tool icon={<Minus />} label="缩小时间线" onClick={() => setPixelsPerSecond((value) => Math.max(24, value - 6))} /><input aria-label="时间线缩放" type="range" min="24" max="90" value={pixelsPerSecond} onChange={(event) => setPixelsPerSecond(Number(event.target.value))} className="w-24 accent-foreground" /><Tool icon={<Plus />} label="放大时间线" onClick={() => setPixelsPerSecond((value) => Math.min(90, value + 6))} /></div>
                <div className="flex items-center gap-1 text-muted-foreground"><Tool icon={<Undo2 />} label="撤销（即将支持）" disabled /><Tool icon={<Scissors />} label="切分（使用 Section 添加）" disabled /></div>
            </div>
            <div ref={scroller} className="thin-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto" onPointerDown={(event) => { if (event.button !== 0 || !scroller.current || (event.target as HTMLElement).closest("button,input,textarea,select,[role=button],video,audio")) return; drag.current = { x: event.clientX, scroll: scroller.current.scrollLeft, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!drag.current || !scroller.current) return; const delta = event.clientX - drag.current.x; if (Math.abs(delta) > 4) drag.current.moved = true; if (drag.current.moved) scroller.current.scrollLeft = drag.current.scroll - delta; }} onPointerUp={(event) => { if (!drag.current) return; event.currentTarget.releasePointerCapture(event.pointerId); setTimeout(() => { drag.current = null; }, 0); }}>
                <div className="grid min-w-max" style={{ gridTemplateColumns: `148px ${railWidth}px` }}>
                    <div className="sticky left-0 z-20 h-9 border-b border-r border-border bg-[var(--surface-raised)]" />
                    <div className="relative h-9 border-b border-border bg-[var(--surface-raised)]" onClick={seek}>{rulerMarks(layout.at(-1)?.endMs || 0).map((time) => <div key={time} className="absolute bottom-0 top-0 border-l border-border/70 pl-1 pt-2 text-[10px] tabular-nums text-muted-foreground" style={{ left: time / 1000 * pixelsPerSecond }}>{formatTime(time)}</div>)}<Playhead timeMs={playheadMs} pixelsPerSecond={pixelsPerSecond} top={0} height={36} /></div>
                    <div className="sticky left-0 z-20 h-14 border-b border-r border-border bg-[var(--surface-raised)]" />
                    <div className="relative flex h-14 border-b border-border bg-[var(--surface-raised)]" onClick={seek}>{sections.length ? sections.map((section, index) => <div key={section.id} className="group relative flex shrink-0 items-center justify-center border-r border-border text-xs font-medium" style={{ width: layout[index].durationMs / 1000 * pixelsPerSecond }}><span>Section {String(index + 1).padStart(2, "0")}</span><Tooltip title="删除 Section"><button aria-label={`删除 Section ${index + 1}`} className="absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--status-danger-surface)] hover:text-[var(--status-danger-foreground)]" onClick={(event) => { event.stopPropagation(); onDelete(section); }}><Trash2 className="size-3.5" /></button></Tooltip><Tooltip title="从文案添加 Section"><button aria-label={`在 Section ${index + 1} 后添加`} className="absolute -right-3 z-20 inline-flex size-6 items-center justify-center rounded-full bg-foreground text-background opacity-0 shadow-md focus-visible:opacity-100 group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); onInsert(index + 1); }}><Plus className="size-3.5" /></button></Tooltip></div>) : <button type="button" className="m-2 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:border-foreground hover:text-foreground" onClick={(event) => { event.stopPropagation(); onInsert(0); }}><Plus className="size-3.5" />添加第一个 Section</button>}<Playhead timeMs={playheadMs} pixelsPerSecond={pixelsPerSecond} top={0} height={56} /></div>
                    {tracks.map((track) => <TrackRow key={track.layer} track={track} sections={sections} layout={layout} pixelsPerSecond={pixelsPerSecond} playheadMs={playheadMs} onSeek={seek} onEdit={onEdit} onRegenerate={onRegenerate} onSelectVersion={onSelectVersion} />)}
                </div>
            </div>
        </section>
    );
}

function TrackRow({ track, sections, layout, pixelsPerSecond, playheadMs, onSeek, onEdit, onRegenerate, onSelectVersion }: {
    track: (typeof tracks)[number];
    sections: FactorySection[];
    layout: ReturnType<typeof timelineSections>;
    pixelsPerSecond: number;
    playheadMs: number;
    onSeek: (event: React.MouseEvent<HTMLDivElement>) => void;
    onEdit: (section: FactorySection, layer: "script" | "visual_prompt") => void;
    onRegenerate: (section: FactorySection, layer: FactoryLayer) => void;
    onSelectVersion: (section: FactorySection, layer: FactoryLayer, id: string) => void;
}) {
    const [visible, setVisible] = useState(true);
    const [locked, setLocked] = useState(false);
    const editableLayer = track.layer === "script" || track.layer === "visual_prompt" ? track.layer : null;
    return <><div className="sticky left-0 z-20 flex items-center justify-between border-b border-r border-border bg-[var(--surface-raised)] px-3" style={{ height: track.height }}><span className="text-xs font-medium">{track.label}</span><span className="flex"><Tool icon={visible ? <Eye /> : <EyeOff />} label={visible ? `隐藏${track.label}` : `显示${track.label}`} onClick={() => setVisible((value) => !value)} /><Tool icon={locked ? <Lock /> : <LockOpen />} label={locked ? `解锁${track.label}` : `锁定${track.label}`} onClick={() => setLocked((value) => !value)} /></span></div><div className="relative flex border-b border-border bg-[var(--surface-workspace)] p-1.5" style={{ height: track.height }} onClick={onSeek}>{sections.map((section: FactorySection, index: number) => <div key={section.id} className="shrink-0 pr-1.5" style={{ width: layout[index].durationMs / 1000 * pixelsPerSecond, opacity: visible ? 1 : 0.28, pointerEvents: locked ? "none" : "auto" }}><TimelineCell layer={track.layer} versions={section.artifacts[track.layer]} onEdit={editableLayer ? () => onEdit(section, editableLayer) : undefined} onRegenerate={() => onRegenerate(section, track.layer)} onSelectVersion={(id) => onSelectVersion(section, track.layer, id)} /></div>)}<Playhead timeMs={playheadMs} pixelsPerSecond={pixelsPerSecond} top={0} height={track.height} /></div></>;
}

function Playhead({ timeMs, pixelsPerSecond, top, height }: { timeMs: number; pixelsPerSecond: number; top: number; height: number }) { return <div aria-hidden className="pointer-events-none absolute z-30 w-px bg-foreground" style={{ left: timeMs / 1000 * pixelsPerSecond, top, height }}><span className="absolute -left-1.5 -top-1 size-3 rounded-full bg-foreground" /></div>; }
function Tool({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean }) { return <Tooltip title={label}><button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--action-secondary)] hover:text-foreground disabled:opacity-30 [&_svg]:size-4">{icon}</button></Tooltip>; }
function selectedDuration(section: FactorySection) { return section.artifacts.audio.find((item) => item.selected)?.durationMs || section.artifacts.video.find((item) => item.selected)?.durationMs || 5_000; }
function rulerMarks(endMs: number) { const step = endMs > 180_000 ? 30_000 : endMs > 60_000 ? 15_000 : 5_000; return Array.from({ length: Math.ceil(endMs / step) + 1 }, (_, index) => index * step); }
function formatTime(ms: number) { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
