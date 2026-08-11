import type { ReactNode } from "react";

export function AuthShell({ title, description, branded = false, children }: { title: string; description: string; branded?: boolean; children: ReactNode }) {
    return (
        <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-app)] px-4 py-10 sm:px-6">
            <section className="w-full max-w-sm rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-6 shadow-[var(--elevation-card)] sm:p-8">
                <div className="mb-7 flex items-center gap-3">
                    {branded ? <img src="/favicon.png" alt="" className="size-8 shrink-0" /> : null}
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                    </div>
                </div>
                {children}
            </section>
        </main>
    );
}
