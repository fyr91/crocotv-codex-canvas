"use client";
/**
 * ToastContainer — bottom-right stack of project-aware notifications.
 * Mounted once at the app root (Providers.tsx) so toasts survive
 * page/project navigation.
 */
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToastStore, type Toast, type ToastKind } from "@/store/toastStore";

const KIND_STYLES: Record<ToastKind, { ring: string; bg: string; icon: JSX.Element; iconClass: string }> = {
    info: {
        ring: "border-primary/40",
        bg: "bg-primary/10",
        icon: <Info size={14} />,
        iconClass: "text-primary",
    },
    progress: {
        ring: "border-primary/40",
        bg: "bg-primary/10",
        icon: <Loader2 size={14} className="animate-spin" />,
        iconClass: "text-primary",
    },
    success: {
        ring: "border-status-completed-border",
        bg: "bg-status-completed-bg",
        icon: <CheckCircle2 size={14} />,
        iconClass: "text-status-completed-fg",
    },
    error: {
        ring: "border-status-failed-border",
        bg: "bg-status-failed-bg",
        icon: <AlertCircle size={14} />,
        iconClass: "text-status-failed-fg",
    },
    warning: {
        ring: "border-status-processing-border",
        bg: "bg-status-processing-bg",
        icon: <AlertTriangle size={14} />,
        iconClass: "text-status-processing-fg",
    },
};

function ToastCard({ toast }: { toast: Toast }) {
    const tc = useTranslations("common");
    const dismiss = useToastStore((s) => s.dismiss);
    const style = KIND_STYLES[toast.kind];
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-auto w-[340px] rounded-lg border ${style.ring} ${style.bg} backdrop-blur-sm shadow-lg px-3 py-2.5 flex items-start gap-2.5`}
        >
            <span className={`mt-0.5 shrink-0 ${style.iconClass}`}>{style.icon}</span>
            <div className="min-w-0 flex-1">
                {toast.projectTitle && (
                    <p className="font-mono text-sm uppercase tracking-[0.16em] text-text-muted mb-0.5 truncate">
                        {toast.projectTitle}
                    </p>
                )}
                <p className="text-sm font-medium text-foreground leading-snug">{toast.title}</p>
                {toast.body && (
                    <div className="mt-0.5">
                        <p className={`text-sm text-text-secondary leading-snug ${toast.body.length > 120 ? "line-clamp-3" : ""}`}>
                            {toast.body}
                        </p>
                        {(toast.kind === "error" && toast.body.length > 40) && (
                            <button
                                onClick={() => { navigator.clipboard.writeText(toast.body!); }}
                                className="mt-1 text-sm text-text-muted hover:text-foreground transition-colors"
                            >
                                {tc("copyErrorDetails")}
                            </button>
                        )}
                    </div>
                )}
                {toast.action && (
                    <button
                        onClick={() => {
                            toast.action!.onClick();
                            dismiss(toast.id);
                        }}
                        className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-elevated border border-glass-border text-sm font-medium text-foreground hover:bg-hover-bg transition-colors"
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={() => dismiss(toast.id)}
                aria-label={tc("dismiss")}
                className="shrink-0 -mr-1 p-1 rounded text-text-muted hover:text-foreground transition-colors"
            >
                <X size={12} />
            </button>
        </motion.div>
    );
}

export default function ToastContainer() {
    const toasts = useToastStore((s) => s.toasts);
    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col-reverse gap-2 max-h-screen overflow-hidden">
            <AnimatePresence initial={false}>
                {toasts.map((t) => (
                    <ToastCard key={t.id} toast={t} />
                ))}
            </AnimatePresence>
        </div>
    );
}
