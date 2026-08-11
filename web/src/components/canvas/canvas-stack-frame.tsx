import type { ReactNode } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasStackFrame({
    stackCount,
    expanded = false,
    opening = false,
    recovering = false,
    className,
    onToggle,
    children,
}: {
    stackCount: number;
    expanded?: boolean;
    opening?: boolean;
    recovering?: boolean;
    className?: string;
    onToggle?: () => void;
    children: ReactNode;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const stacked = stackCount > 1;
    return (
        <div
            className={cn("group/stack relative h-full w-full overflow-visible", className)}
            onDoubleClick={stacked ? (event) => {
                event.stopPropagation();
                onToggle?.();
            } : undefined}
        >
            {stacked ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(stackCount - 1, 5) }).map((_, index) => (
                        <div
                            key={index}
                            data-stack-layer={index + 1}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.16)] transition-all duration-300 group-hover/stack:translate-x-2"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: expanded && !opening ? 0.34 : 1,
                                transform: opening || recovering
                                    ? `translate(${54 + index * 22}px, ${20 + index * 12}px) rotate(${8 + index * 5}deg) scale(.98)`
                                    : `translate(${34 + index * 18}px, ${14 + index * 10}px) rotate(${6 + index * 4}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
