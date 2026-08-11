import { cn } from "@/lib/utils";

export function WorkspaceProjectHeader({ title, unreadClassName }: {
    title: string;
    unreadClassName?: string;
}) {
    return (
        <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
                <h3 className="line-clamp-2 text-base font-semibold leading-6">{title}</h3>
            </div>
            {unreadClassName ? <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", unreadClassName)} aria-label="有未查看节点" /> : null}
        </div>
    );
}

export function WorkspaceProjectMetrics({ items }: { items: Array<{ label: string; value: number | string }> }) {
    return (
        <div className="mt-3 grid w-full grid-cols-3 gap-1.5 text-center">
            {items.map((item) => (
                <div key={item.label} className="rounded-lg bg-[var(--surface-sunken)] px-1.5 py-1.5">
                    <div className="text-sm font-semibold">{item.value}</div>
                    <div className="text-[11px] text-muted-foreground">{item.label}</div>
                </div>
            ))}
        </div>
    );
}

export function WorkspaceProjectActivity({ message }: { message: string }) {
    return <div className="mt-3 w-full line-clamp-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-xs leading-5 text-muted-foreground">{message}</div>;
}
