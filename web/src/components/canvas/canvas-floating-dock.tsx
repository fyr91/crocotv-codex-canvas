import { forwardRef } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";

export const CanvasFloatingDock = forwardRef<HTMLDivElement, { children: ReactNode; className?: string; style?: CSSProperties } & HTMLAttributes<HTMLDivElement>>(function CanvasFloatingDock({ children, className, style, ...props }, ref) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    return (
        <div
            ref={ref}
            className={cn("flex h-14 items-center gap-1 overflow-x-auto rounded-xl border px-2 backdrop-blur [&>*]:shrink-0", className)}
            style={{
                background: theme.toolbar.panel,
                borderColor: theme.toolbar.border,
                color: theme.toolbar.item,
                boxShadow: colorTheme === "dark" ? "var(--elevation-floating-dark)" : "var(--elevation-floating)",
                ...style,
            }}
            {...props}
        >
            {children}
        </div>
    );
});
