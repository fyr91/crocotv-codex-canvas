import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function KouboWorkflowGroup({ title, icon, selected, completed, total, running = 0, failed = 0, action, onSelect, children }: {
    title: string;
    icon?: ReactNode;
    selected: boolean;
    completed: number;
    total: number;
    running?: number;
    failed?: number;
    action?: ReactNode;
    onSelect: () => void;
    children: ReactNode;
}) {
    return (
        <section data-canvas-no-zoom className={cn("w-60 shrink-0 rounded-2xl border bg-[var(--surface-raised)] p-3 shadow-[var(--elevation-card)]", selected ? "border-primary ring-1 ring-primary/20" : "border-border")}>
            <header className="mb-3">
                <div className="flex items-start justify-between gap-2">
                    <button type="button" aria-pressed={selected} aria-label={`选择${title}`} onClick={onSelect} className="flex min-w-0 items-center gap-2 rounded-md text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {icon}{title}
                    </button>
                    {action}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{completed}/{total} 完成 · {running} 运行 · {failed} 失败</p>
            </header>
            <div className="space-y-2">{children}</div>
        </section>
    );
}
