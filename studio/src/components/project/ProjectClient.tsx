"use client";

import { useEffect, useState, useMemo } from "react";
import { Palette, Layout, Film, BookOpen, Users, Video, Settings, MessageSquareCode, Clapperboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { useProjectStore } from "@/store/projectStore";
import { areCastAssetsComplete, isScriptStepComplete } from "@/lib/projectStepCompletion";
import { useEditorStore } from "@/store/editorStore";
import PipelineSidebar from "@/components/layout/PipelineSidebar";
import EpisodeMiniList from "@/components/layout/EpisodeMiniList";
import type { BreadcrumbSegment } from "@/components/layout/BreadcrumbBar";
// PropertiesPanel removed in R2V v2 — chrome is owned per-step now.
// ScriptProcessor right rail will become "Previously on..."; other steps
// have their own SidePanelHeader-driven side columns.
import Cast from "@/components/modules/Cast";
import VideoGenerator from "@/components/modules/VideoGenerator";
import VideoAssembly from "@/components/modules/VideoAssembly";
import ConsistencyVault from "@/components/modules/ConsistencyVault";
import ArtDirection from "@/components/modules/ArtDirection";
import StoryboardComposer from "@/components/modules/StoryboardComposer";
import ModelSettingsModal from "@/components/common/ModelSettingsModal";
import PromptConfigModal from "@/components/project/PromptConfigModal";
import StoryboardR2V from "@/components/modules/StoryboardR2V";
import ScriptEntityExtractionConfirm from "@/components/modules/ScriptEditor/components/ScriptEntityExtractionConfirm";
import dynamic from "next/dynamic";

const CreativeCanvas = dynamic(() => import("@/components/canvas/CreativeCanvas"), { ssr: false });
const ScriptEditorShell = dynamic(() => import("@/components/modules/ScriptEditor/ScriptEditorShell"), { ssr: false });

// PR-3m · Steps 7-9 (Voice / Final Mix / Export) deprecated. Their
// functionality moved into:
//   - Voice  → Cast voice binding + Storyboard DialogueAudioRow (PR-3g-3j)
//   - Mix    → Assembly Mix phase tab (PR-3k)
//   - Export → Assembly Export phase tab (PR-3k)
// Both legacy and unified projects now share the 6-step shape.
const LEGACY_STEPS = [
    { id: "script", labelKey: "stepScript", englishLabel: "SCRIPT", icon: BookOpen },
    { id: "art_direction", labelKey: "stepArtDirection", englishLabel: "ART DIRECTION", icon: Palette },
    { id: "assets", labelKey: "stepAssets", englishLabel: "ASSETS", icon: Users },
    { id: "storyboard", labelKey: "stepStoryboard", englishLabel: "STORYBOARD", icon: Layout },
    { id: "motion", labelKey: "stepMotion", englishLabel: "MOTION", icon: Video },
    { id: "assembly", labelKey: "stepAssembly", englishLabel: "ASSEMBLY", icon: Film },
];

// PR-3f (r2v-workflow-v3) — Unified workflow: 5 steps including Cast.
// Per-shot tabMode toggle (t2i_i2v vs direct_r2v) inside Storyboard
// replaces the project-level i2v_legacy / r2v split. Backend enum
// value remains "r2v" for backward compat — UI normalizes to "Unified".
// Legacy `assets` step is dropped — Cast supersedes ConsistencyVault
// for unified projects (ConsistencyVault stays only for legacy workflow).
const UNIFIED_STEPS = [
    { id: "script", labelKey: "stepScript", englishLabel: "SCRIPT", icon: BookOpen },
    { id: "art_direction", labelKey: "stepArtDirection", englishLabel: "ART DIRECTION", icon: Palette },
    { id: "cast", labelKey: "stepCast", englishLabel: "CAST & ASSETS", icon: Users },
    { id: "storyboard_r2v", labelKey: "stepStoryboard", englishLabel: "STORYBOARD", icon: Clapperboard },
    { id: "assembly", labelKey: "stepAssembly", englishLabel: "ASSEMBLY", icon: Film },
];

export default function ProjectClient({ id, breadcrumbSegments }: { id: string; breadcrumbSegments?: BreadcrumbSegment[] }) {
    const [activeStep, setActiveStep] = useState("script");
    const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
    const [promptConfigOpen, setPromptConfigOpen] = useState(false);
    const t = useTranslations("project");
    const tp = useTranslations("pipeline");

    const selectProject = useProjectStore((state) => state.selectProject);
    const currentProject = useProjectStore((state) => state.currentProject);
    const scriptDirty = useEditorStore((state) => state.isDirty);

    // R2V v2 Phase 6 — content_mode lives on the parent series; fetch on
    // mount when project has series_id, default to "scripted" otherwise.
    const [seriesContentMode, setSeriesContentMode] = useState<"scripted" | "freeform">("scripted");
    useEffect(() => {
        const sid = currentProject?.series_id;
        if (!sid) {
            setSeriesContentMode("scripted");
            return;
        }
        let cancelled = false;
        import("@/lib/api").then(({ api }) => api.getSeries(sid))
            .then((s: any) => { if (!cancelled) setSeriesContentMode(s?.content_mode === "freeform" ? "freeform" : "scripted"); })
            .catch(() => { if (!cancelled) setSeriesContentMode("scripted"); });
        return () => { cancelled = true; };
    }, [currentProject?.series_id]);

    const steps = useMemo(() => {
        // PR-3f routing: backend enum "r2v" → unified workbench (5 steps).
        // Anything else (i2v_legacy, missing) → legacy 9-step path. Old
        // projects without workflow_mode default to legacy for backward
        // compat (spec §3.2).
        let base;
        if (currentProject?.workflow_mode !== "r2v") {
            base = LEGACY_STEPS;
        } else if (seriesContentMode === "freeform") {
            // Phase 6 — freeform mode: skip Script step, episodes start at
            // Style. Re-number labels accordingly.
            base = UNIFIED_STEPS
                .filter(s => s.id !== "script");
        } else {
            // Scripted unified flow: Cast is always present (per-episode view
            // of frame-referenced assets). Series-level shared assets are
            // managed in SeriesDetailPage.
            base = UNIFIED_STEPS;
        }

        // Per-step stage status (conservative signals from project state —
        // NOT wizard done-checks; see storyboard-r2v-unified mock). Script
        // has no field on the episode, so it stays status-less (honest —
        // don't fabricate a "done" we can't verify). Assembly is soft-gated
        // (lock + label) when there are no shots yet, but stays CLICKABLE
        // (no navigation behavior change).
        const frames = currentProject?.frames ?? [];
        const chars = currentProject?.characters ?? [];
        const scenes = currentProject?.scenes ?? [];
        const props = currentProject?.props ?? [];
        const bound = chars.filter(c => c.voice_id).length;
        const frameCount = frames.length;
        const hasArt = !!currentProject?.art_direction;
        const hasMerged = !!currentProject?.merged_video_url;
        const scriptReady = isScriptStepComplete(currentProject?.entity_extraction_stale, scriptDirty);
        const castReady = areCastAssetsComplete(chars, scenes, props);
        const statusFor = (id: string): { status?: "ready" | "idle" | "gated"; statusLabel?: string } => {
            switch (id) {
                case "script":
                    return scriptReady ? { status: "ready", statusLabel: tp("railScriptReady") } : { status: "idle" };
                case "art_direction":
                    return hasArt ? { status: "ready", statusLabel: tp("railArtReady") } : { status: "idle" };
                case "cast":
                    return castReady
                        ? (bound > 0
                            ? { status: "ready", statusLabel: tp("railCastBound", { n: chars.length, m: bound }) }
                            : { status: "ready", statusLabel: tp("railCast", { n: chars.length }) })
                        : { status: "idle", statusLabel: chars.length > 0 ? tp("railCast", { n: chars.length }) : undefined };
                case "storyboard_r2v":
                case "storyboard":
                    return frameCount > 0 ? { status: "ready", statusLabel: tp("railShots", { n: frameCount }) } : { status: "idle" };
                case "assembly":
                    return hasMerged
                        ? { status: "ready", statusLabel: tp("railAssembled") }
                        : (frameCount > 0 ? { status: "ready", statusLabel: tp("railAssemblyReady") } : { status: "gated", statusLabel: tp("railAssemblyGated") });
                default:
                    return {};
            }
        };
        return base.map((s, index) => ({ ...s, label: `${index + 1}. ${tp(s.labelKey as any)}`, ...statusFor(s.id) }));
    }, [currentProject, scriptDirty, seriesContentMode, tp]);

    const handleBackToHome = () => {
        window.location.hash = '';
    };

    // Cross-module step navigation event (used by intra-module
    // affordances like Storyboard's "画风" pill that wants to jump
    // to Art Direction without prop-drilling setActiveStep into
    // every leaf component).
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail;
            if (typeof detail !== "string") return;
            if (steps.some((s) => s.id === detail)) {
                setActiveStep(detail);
            }
        };
        document.addEventListener("lumenx:navigateStep", handler);
        return () => document.removeEventListener("lumenx:navigateStep", handler);
    }, [steps]);

    useEffect(() => {
        selectProject(id);
    }, [id, selectProject]);

    if (!currentProject) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="text-center">
                    <p className="text-text-secondary mb-4">{t("notFound")}</p>
                    <button
                        onClick={handleBackToHome}
                        className="text-primary hover:underline"
                    >
                        {t("backToList")}
                    </button>
                </div>
            </div>
        );
    }

    const segments = breadcrumbSegments || [{ label: "视频工坊", hash: "#/" }, { label: currentProject.title }];

    const settingsActions = (
        <>
            <button
                onClick={() => setPromptConfigOpen(true)}
                className="p-2 hover:bg-hover-bg rounded-lg transition-colors group"
                title={t("promptStrategyTitle")}
            >
                <MessageSquareCode size={16} className="text-text-secondary group-hover:text-primary transition-colors" />
            </button>
            <button
                onClick={() => setModelSettingsOpen(true)}
                className="p-2 hover:bg-hover-bg rounded-lg transition-colors group"
                title={t("modelSettings")}
            >
                <Settings size={16} className="text-text-secondary group-hover:text-foreground transition-colors" />
            </button>
        </>
    );

    return (
        <main className="flex h-screen w-screen bg-background overflow-hidden relative">
            {/* Background Canvas */}
            <div className="absolute inset-0 z-0 pointer-events-auto">
                <CreativeCanvas />
            </div>

            {/* Left Sidebar — unified PipelineSidebar with integrated breadcrumb */}
            <div className="relative z-20 h-full flex flex-col overflow-hidden">
                <PipelineSidebar
                    activeStep={activeStep}
                    onStepChange={setActiveStep}
                    steps={steps}
                    projectLabel={currentProject.title}
                    projectSubLabel={currentProject.episode_number ? `EP.${String(currentProject.episode_number).padStart(2, "0")}` : undefined}
                    breadcrumbSegments={segments}
                    headerActions={settingsActions}
                    topSlot={
                        currentProject?.series_id ? (
                            <EpisodeMiniList
                                seriesId={currentProject.series_id}
                                currentProjectId={id}
                                activeStep={activeStep}
                            />
                        ) : null
                    }
                />
            </div>

            {/* Model Settings Modal */}
            <ModelSettingsModal
                isOpen={modelSettingsOpen}
                onClose={() => setModelSettingsOpen(false)}
            />

            {/* Prompt Config Modal */}
            <PromptConfigModal
                isOpen={promptConfigOpen}
                onClose={() => setPromptConfigOpen(false)}
            />
            <ScriptEntityExtractionConfirm />

            {/* Main Content Area — no z-index to avoid trapping fixed modals in a stacking context */}
            <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 overflow-hidden relative">
                    {/* Global Atelier atmosphere — shared across every step so the
                        pipeline reads as one surface (bloom + grain, pointer-events
                        none, content sits above on z-10). */}
                    <div className="atelier-page-bloom" aria-hidden="true" />
                    <div className="atelier-page-grain" aria-hidden="true" />
                    <div className="relative z-10 h-full flex flex-col overflow-hidden">
                        {activeStep === "script" && <ScriptEditorShell mode="embedded" projectId={currentProject.id} />}
                        {activeStep === "art_direction" && <ArtDirection />}
                        {activeStep === "cast" && <Cast />}
                        {activeStep === "assets" && <ConsistencyVault />}  {/* legacy i2v only */}
                        {activeStep === "storyboard" && <StoryboardComposer />}
                        {activeStep === "storyboard_r2v" && <StoryboardR2V />}
                        {activeStep === "motion" && <VideoGenerator />}
                        {activeStep === "assembly" && <VideoAssembly />}
                    </div>
                </div>
            </div>
        </main>
    );
}
