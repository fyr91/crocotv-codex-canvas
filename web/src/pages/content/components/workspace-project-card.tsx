import type { ReactNode } from "react";
import { Button } from "antd";
import dayjs from "dayjs";
import { Clock3, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function WorkspaceProjectCard({ openLabel, time, className, onOpen, onDelete, children }: {
    openLabel: string;
    time: string;
    className?: string;
    onOpen: () => void;
    onDelete: () => void;
    children: ReactNode;
}) {
    return (
        <article className={cn("flex h-full min-h-48 w-full cursor-pointer flex-col rounded-2xl border border-border bg-[var(--surface-raised)] text-foreground shadow-[var(--elevation-card)] transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--elevation-card-hover)] focus-within:ring-2 focus-within:ring-ring", className)}>
            <button
                type="button"
                className="flex w-full flex-1 cursor-pointer flex-col items-start rounded-t-2xl bg-transparent p-4 pb-0 text-left text-foreground focus-visible:outline-none"
                onClick={onOpen}
                aria-label={openLabel}
            >
                {children}
            </button>
            <footer className="flex w-full items-center justify-between gap-3 px-4 pb-4 pt-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    {dayjs(time).format("MM-DD HH:mm")}
                </span>
                <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<Trash2 className="size-4" />}
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete();
                    }}
                    aria-label="删除"
                />
            </footer>
        </article>
    );
}
