import type { ReactNode } from "react";

export function SystemState({
    icon,
    title,
    description,
    actions,
    patterned = false,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    actions: ReactNode;
    patterned?: boolean;
}) {
    return (
        <main className={`flex h-dvh items-center justify-center overflow-y-auto bg-[var(--surface-app)] px-6 py-10 text-foreground${patterned ? " ui-dot-pattern" : ""}`}>
            <section className="w-full max-w-md text-center">
                <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[var(--elevation-card)]">
                    {icon}
                </div>
                <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
            </section>
        </main>
    );
}
