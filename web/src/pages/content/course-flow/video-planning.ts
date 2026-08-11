import type { CourseFlowAudioVersion, CourseFlowMode, CourseFlowSegment, CourseFlowStep, CourseFlowVideoOutput } from "@/types/course-flow";

export const courseFlowStepOrder = ["role", "script_scene", "audio", "video_plan", "video", "export"] as const satisfies readonly CourseFlowStep[];

export function courseFlowExportDescription(sceneMode: CourseFlowMode) {
    return sceneMode === "green_screen"
        ? "ZIP 按 Material、LTX、Audio、Scene 和 Script 五个目录组织，可直接交给后续剪辑。"
        : "ZIP 按 Material、Audio 和 Script 三个目录组织，可直接交给后续剪辑。";
}

export function furthestCourseFlowStep(current: CourseFlowStep, destination: CourseFlowStep) {
    return courseFlowStepOrder.indexOf(destination) > courseFlowStepOrder.indexOf(current) ? destination : current;
}

export function selectedCourseAudio(segment: CourseFlowSegment): CourseFlowAudioVersion | null {
    const audio = segment.audioVersions.find((item) => item.id === segment.selectedAudioId);
    return audio?.status === "ready" && audio.durationMs > 0 ? audio : null;
}

export function isMaterialPlanFresh(segment: CourseFlowSegment) {
    return Boolean(segment.selectedAudioId && segment.materialShots.length && segment.materialShots.every((shot) => (
        shot.sourceSegmentRevision === segment.revision
        && shot.sourceAudioVersionId === segment.selectedAudioId
    )));
}

export function materialPlanState(segment: CourseFlowSegment, planning: boolean, error?: string) {
    if (planning) return "planning" as const;
    if (error) return "failed" as const;
    if (!isMaterialPlanFresh(segment)) return "stale" as const;
    if (segment.materialShots.some((shot) => !shot.prompt.trim() || shot.durationSeconds <= 0 || shot.durationSeconds > 15)) return "invalid" as const;
    return "ready" as const;
}

export function segmentsNeedingMaterialPlan(segments: CourseFlowSegment[], planningSegmentIds: Set<string>) {
    return segments.filter((segment) => selectedCourseAudio(segment) && !planningSegmentIds.has(segment.id) && !isMaterialPlanFresh(segment));
}

export function courseVideoGenerationPhase(sceneMode: CourseFlowMode, segments: CourseFlowSegment[]) {
    if (sceneMode === "green_screen") {
        if (segments.some((segment) => segment.ltxVideo?.status === "failed")) return "blocked" as const;
        if (segments.some((segment) => !segment.ltxVideo || segment.ltxVideo.status !== "ready")) return "ltx" as const;
    }
    const materialVideos = segments.flatMap((segment) => segment.materialShots.map((shot) => shot.video));
    if (materialVideos.some((video) => video?.status === "failed")) return "blocked" as const;
    if (materialVideos.some((video) => !video || video.status !== "ready")) return "material" as const;
    return "complete" as const;
}

export function mapCourseFlowMaterialShot(row: Record<string, unknown>, video: CourseFlowVideoOutput | null) {
    return {
        id: String(row.id),
        position: Number(row.position),
        prompt: String(row.prompt || ""),
        durationSeconds: Number(row.duration_seconds),
        sourceSegmentRevision: Number(row.source_segment_revision),
        sourceAudioVersionId: String(row.source_audio_version_id),
        storyboardPrompt: String(row.storyboard_prompt || ""),
        storyboardSourcePrompt: String(row.storyboard_source_prompt || ""),
        storyboardAssetId: row.storyboard_asset_id ? String(row.storyboard_asset_id) : null,
        storyboardUrl: String(row.storyboard_url || ""),
        storyboardGenerationId: row.storyboard_generation_id ? String(row.storyboard_generation_id) : null,
        storyboardStatus: String(row.storyboard_status || "queued") as "queued" | "running" | "ready" | "failed",
        storyboardErrorMessage: row.storyboard_error_message ? String(row.storyboard_error_message) : null,
        storyboardClientRequestId: row.storyboard_client_request_id ? String(row.storyboard_client_request_id) : null,
        video,
    };
}

export async function runOptimisticShotPromptSave({ previousPrompt, nextPrompt, save, isCurrent, apply }: {
    previousPrompt: string;
    nextPrompt: string;
    save: () => Promise<void>;
    isCurrent: () => boolean;
    apply: (prompt: string) => void;
}) {
    try { await save(); }
    catch (error) {
        if (isCurrent()) apply(previousPrompt);
        throw error;
    }
    return nextPrompt;
}
