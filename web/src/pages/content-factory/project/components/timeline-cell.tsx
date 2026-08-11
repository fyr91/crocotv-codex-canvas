import { Skeleton, Tooltip } from "antd";
import { AudioLines, CircleAlert, FileText, ImageIcon, RefreshCw, Sparkles, Video } from "lucide-react";
import type { FactoryArtifactVersion, FactoryLayer } from "@/types/content-factory";
import { VersionMenu } from "./version-menu";

const icons = { video: Video, image: ImageIcon, visual_prompt: Sparkles, audio: AudioLines, script: FileText };

export function TimelineCell({ layer, versions, onEdit, onRegenerate, onSelectVersion }: { layer: FactoryLayer; versions: FactoryArtifactVersion[]; onEdit?: () => void; onRegenerate: () => void; onSelectVersion: (id: string) => void }) {
    const selected = versions.find((item) => item.selected) || versions.at(-1);
    const Icon = icons[layer];
    if (!selected) return <div className="group relative h-full rounded-lg border border-dashed border-border bg-[var(--surface-sunken)]/50"><div className="flex h-full items-center justify-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />等待生成</div><RegenerateButton onClick={onRegenerate} /></div>;
    const pending = ["queued", "running"].includes(selected.status);
    if (pending) return <div className="group relative h-full overflow-hidden rounded-lg border border-border bg-[var(--surface-sunken)] p-2"><Skeleton active title={false} paragraph={{ rows: layer === "audio" ? 1 : 2, width: ["100%", "76%"] }} /><div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium">{selected.status === "queued" ? "排队中" : "生成中"}</div><RegenerateButton onClick={onRegenerate} /></div>;
    if (selected.status === "failed") return <div className="relative flex h-full items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-surface)] text-xs text-[var(--status-danger-foreground)]"><CircleAlert className="size-4" /><span>生成失败</span><RegenerateButton onClick={onRegenerate} label="重试" /></div>;
    return (
        <div role={onEdit ? "button" : undefined} tabIndex={onEdit ? 0 : undefined} onClick={(event) => { if (onEdit) { event.stopPropagation(); onEdit(); } }} onKeyDown={(event) => { if (onEdit && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onEdit(); } }} className="group relative h-full overflow-hidden rounded-lg border border-border bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
            {layer === "video" ? selected.url ? <video src={selected.url} muted preload="metadata" className="h-full w-full object-cover" /> : null : null}
            {layer === "image" ? selected.url ? <img src={selected.url} alt="分镜图" className="h-full w-full object-cover" /> : null : null}
            {layer === "audio" ? <div className="flex h-full items-center gap-0.5 px-3">{Array.from({ length: 30 }, (_, index) => <span key={index} className="w-0.5 rounded-full bg-current opacity-40" style={{ height: `${20 + (index * 17) % 70}%` }} />)}</div> : null}
            {["script", "visual_prompt"].includes(layer) ? <p className="line-clamp-4 p-2 text-xs leading-5">{selected.text}</p> : null}
            {selected.stale ? <div className="absolute inset-x-0 bottom-0 bg-[var(--status-warning-surface)] px-2 py-1 text-[10px] text-[var(--status-warning-foreground)]">内容已变化 · 需要重新生成</div> : null}
            <div className="absolute left-1.5 top-1.5" onClick={(event) => event.stopPropagation()}><VersionMenu versions={versions} selectedId={selected.id} onSelect={onSelectVersion} /></div>
            <RegenerateButton onClick={onRegenerate} />
        </div>
    );
}

function RegenerateButton({ onClick, label = "重新生成" }: { onClick: () => void; label?: string }) {
    return <Tooltip title={label}><button type="button" aria-label={label} className="absolute bottom-1.5 right-1.5 z-10 inline-flex size-7 items-center justify-center rounded-md bg-[var(--surface-overlay)]/90 text-foreground shadow-sm hover:bg-[var(--action-secondary)]" onClick={(event) => { event.stopPropagation(); onClick(); }}><RefreshCw className="size-3.5" /></button></Tooltip>;
}
