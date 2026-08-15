"use client";
/**
 * StepPageHeader — unified mock-aligned page header for every R2V workflow
 * step. Replaces the old Charcoal StepHeader with the Atelier "wb-head"
 * pattern: mono eyebrow (STEP 0N · NAME) + Fraunces display title +
 * optional info pills + subtitle + trailing actions slot.
 *
 * Used by ScriptProcessor / ArtDirection / Cast / StoryboardR2V /
 * VideoAssembly so the whole pipeline reads as one coherent surface.
 *
 * Mock ref: docs/design/tasty-sam/storyboard-r2v-unified.html `.wb-head`.
 */
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

const STEP_NAME_KEYS = {
    SCRIPT: "stepScript",
    STYLE: "stepArtDirection",
    CAST: "stepCast",
    "STORYBOARD R2V": "stepStoryboard",
    ASSEMBLY: "stepAssembly",
    "STORYBOARD COMPOSER": "stepStoryboard",
    "ASSET LIBRARY": "stepAssets",
    "MOTION GENERATOR": "stepMotion",
} as const;

export function useLocalizedStepName(englishName: string) {
    const t = useTranslations("pipeline");
    const key = STEP_NAME_KEYS[englishName.toUpperCase() as keyof typeof STEP_NAME_KEYS];
    return key ? t(key) : englishName;
}

export interface StepPageHeaderProps {
    /** 1-based step number; rendered as the primary-colored eyebrow numeral. */
    stepNumber: number;
    /** English chrome name (e.g. "Script" / "Storyboard R2V"). */
    englishName: string;
    /** Localized title (Fraunces display). */
    title: string;
    /** Localized subtitle one-liner. */
    subtitle: string;
    /** Info pills row, sits inline with the title (画风 / 模型 / 计数 …).
     *  Each pill should use the shared capsule style; caller composes them. */
    pills?: ReactNode;
    /** Right-aligned actions (queue button, generate CTA, counters …). */
    trailing?: ReactNode;
}

export default function StepPageHeader({
    stepNumber,
    englishName,
    title,
    subtitle,
    pills,
    trailing,
}: StepPageHeaderProps) {
    const t = useTranslations("pipeline");
    const localizedName = useLocalizedStepName(englishName);
    const stepStr = String(stepNumber).padStart(2, "0");
    return (
        <header className="shrink-0 border-b border-border-subtle px-7 pt-[22px] pb-4">
            <div className="flex items-start gap-5">
                <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-normal uppercase tracking-[0.22em] text-text-muted">
                        <span>{t("stepPrefix")}</span>
                        <span className="ml-1.5 font-medium text-primary">{stepStr}</span>
                        <span className="mx-1.5">·</span>
                        <span>{localizedName}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-3.5">
                        <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
                            {title}
                        </h1>
                        {pills ? <div className="flex items-center gap-2">{pills}</div> : null}
                    </div>
                    <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p>
                </div>
                {trailing ? (
                    <div className="flex items-center gap-2 shrink-0 pt-1">{trailing}</div>
                ) : null}
            </div>
        </header>
    );
}

/** Shared pill capsule — callers compose <Pill key="…" value="…" /> for each
 *  info chip so all steps share one visual. */
export function StepPill({ label, value }: { label: string; value: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-surface-inset px-2.5 py-1 font-mono text-sm text-text-secondary">
            <span className="text-text-muted">{label}</span>
            <span className="text-primary">{value}</span>
        </span>
    );
}
