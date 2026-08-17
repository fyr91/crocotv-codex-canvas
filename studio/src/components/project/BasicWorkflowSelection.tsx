"use client";

import { Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Shared workflow picker for new projects and series.
 *
 * Only the basic R2V workflow is currently available. Keeping this as one
 * component prevents the two creation dialogs from drifting apart again.
 */
export default function BasicWorkflowSelection() {
    const t = useTranslations("project");
    const tc = useTranslations("common");

    return (
        <div>
            <label className="block text-sm font-medium text-foreground mb-2">
                {t("workflowMode")}
            </label>
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    aria-pressed="true"
                    className="relative p-4 rounded-xl border-2 border-primary bg-primary/10 text-left transition-all"
                >
                    <div className="flex items-center gap-2 mb-1.5">
                        <Zap size={16} className="text-primary" />
                        <span className="font-medium text-sm text-foreground">{t("workflowR2V")}</span>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">
                        {t("workflowR2VDesc")}
                    </p>
                    <span className="recommendation-badge absolute top-2 right-2">
                        {tc("recommended")}
                    </span>
                </button>

                <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="relative p-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] text-left opacity-50 cursor-not-allowed"
                >
                    <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles size={16} className="text-text-secondary" />
                        <span className="font-medium text-sm text-text-secondary">{t("workflowComingSoon")}</span>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">
                        {t("workflowComingSoonDesc")}
                    </p>
                </button>
            </div>
        </div>
    );
}
