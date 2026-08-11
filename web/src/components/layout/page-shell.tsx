import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageWidth = "5xl" | "6xl" | "7xl";

const widthClass: Record<PageWidth, string> = {
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
};

export function LibraryPage({
    title,
    description,
    header,
    children,
    width = "7xl",
    contentClassName,
}: {
    title: string;
    description?: string;
    header?: ReactNode;
    children: ReactNode;
    width?: PageWidth;
    contentClassName?: string;
}) {
    return (
        <main className="ui-library-page">
            <div className={cn("mx-auto flex min-h-full w-full flex-col", widthClass[width])}>
                <header className="ui-library-header">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="ui-library-title">{title}</h1>
                        {description ? <p className="ui-library-description">{description}</p> : null}
                    </div>
                    {header ? <div className="mt-8">{header}</div> : null}
                </header>
                <div className={cn("flex min-h-0 flex-1 flex-col", contentClassName)}>{children}</div>
            </div>
        </main>
    );
}

export function AdminPage({
    title,
    description,
    actions,
    children,
    width = "7xl",
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
    width?: PageWidth;
}) {
    return (
        <main className="ui-admin-page">
            <div className={cn("mx-auto w-full", widthClass[width])}>
                <header className="ui-admin-header">
                    <div className="min-w-0">
                        <h1 className="ui-admin-title">{title}</h1>
                        {description ? <p className="ui-admin-description">{description}</p> : null}
                    </div>
                    {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
                </header>
                {children}
            </div>
        </main>
    );
}

export function WorkspacePage({ topBar, children }: { topBar?: ReactNode; children: ReactNode }) {
    return (
        <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-workspace)] text-foreground">
            {topBar}
            <div className="flex min-h-0 flex-1">{children}</div>
        </main>
    );
}
