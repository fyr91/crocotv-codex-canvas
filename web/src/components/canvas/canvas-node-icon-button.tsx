import { Tooltip } from "antd";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function CanvasNodeIconButton({
    title,
    icon,
    disabled = false,
    danger = false,
    className,
    style,
    onClick,
}: {
    title: string;
    icon: ReactNode;
    disabled?: boolean;
    danger?: boolean;
    className?: string;
    style?: CSSProperties;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
    return (
        <Tooltip title={title}>
            <button
                type="button"
                aria-label={title}
                disabled={disabled}
                className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--node-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-45",
                    danger && "text-destructive",
                    className,
                )}
                style={style}
                onClick={onClick}
            >
                {icon}
            </button>
        </Tooltip>
    );
}
