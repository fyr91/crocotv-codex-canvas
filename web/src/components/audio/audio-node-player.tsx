export function AudioNodePlayer({
    url,
    title,
    durationMs,
    compact = false,
    hideDuration = false,
}: {
    url: string;
    title: string;
    durationMs?: number | null;
    compact?: boolean;
    hideDuration?: boolean;
}) {
    return (
        <div className={compact ? "mt-2 space-y-1.5" : "flex h-full min-h-0 flex-col justify-center gap-2 p-3"}>
            <audio
                controls
                preload="metadata"
                src={url}
                aria-label={`预览 ${title}`}
                className="w-full"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            />
            {!hideDuration && durationMs != null ? <span className="text-[11px] text-muted-foreground">{(durationMs / 1000).toFixed(1)} 秒</span> : null}
        </div>
    );
}
