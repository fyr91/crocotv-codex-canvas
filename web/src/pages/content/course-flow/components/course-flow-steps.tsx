import { Check } from "lucide-react";
import * as React from "react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";

import type { CourseFlowMode, CourseFlowStep } from "@/types/course-flow";
import { courseFlowStepOrder } from "../video-planning";

const labels: Record<CourseFlowStep, string> = { role: "角色", script_scene: "文案与场景", audio: "音频", video_plan: "视频规划", video: "视频生成", export: "导出" };
const Activity = (React as unknown as { Activity: ComponentType<{ mode: "visible" | "hidden"; children: ReactNode }> }).Activity;

export function CourseFlowSteps({ current, availableThrough, sceneMode = "green_screen", onSelect }: { current: CourseFlowStep; availableThrough: CourseFlowStep; sceneMode?: CourseFlowMode | null; onSelect: (step: CourseFlowStep) => void }) {
    const steps = courseFlowStepOrder.map((key) => ({ key, label: key === "script_scene" && sceneMode !== "green_screen" ? "课程文案" : labels[key] }));
    const active = steps.findIndex((step) => step.key === current);
    const available = steps.findIndex((step) => step.key === availableThrough);
    return (
        <nav aria-label="课程制作步骤" className="grid h-14 grid-cols-6 border-b border-border bg-[var(--surface-raised)] px-2 sm:px-8">
            {steps.map((step, index) => (
                <button key={step.key} type="button" onClick={() => index <= available && onSelect(step.key)} disabled={index > available} className={`relative flex min-w-0 cursor-pointer items-center justify-center gap-2 text-xs transition-colors sm:text-sm ${index === active ? "font-semibold text-foreground" : "text-muted-foreground"} disabled:cursor-default`}>
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${index < available || index === active ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                        {index < available && index !== active ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className="hidden truncate sm:inline">{step.label}</span>
                    {index === active ? <span className="absolute inset-x-4 bottom-0 h-0.5 bg-foreground" /> : null}
                </button>
            ))}
        </nav>
    );
}

export function CourseFlowStepCache({ active, children }: { active: boolean; children: ReactNode }) {
    const [visited, setVisited] = useState(active);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (active) setVisited(true);
    }, [active]);
    useEffect(() => {
        if (!active) containerRef.current?.querySelectorAll<HTMLMediaElement>("audio, video").forEach((media) => { if (!media.paused) media.pause(); });
    }, [active]);

    if (!visited && !active) return null;
    return <div ref={containerRef} aria-hidden={!active} className={active ? "contents" : "hidden"}><Activity mode={active ? "visible" : "hidden"}>{children}</Activity></div>;
}
