import type { CourseFlowSegment } from "@/types/course-flow";

export function courseSegmentConfirmationFields(row: { confirmed_script_revision?: number | null; confirmed_plan_audio_id?: string | null }) {
    return {
        confirmedScriptRevision: row.confirmed_script_revision == null ? null : Number(row.confirmed_script_revision),
        confirmedPlanAudioId: row.confirmed_plan_audio_id || null,
    };
}

export function isCourseScriptConfirmed(segment: CourseFlowSegment) {
    return segment.confirmedScriptRevision === segment.revision;
}

export function isCoursePlanConfirmed(segment: CourseFlowSegment) {
    return Boolean(segment.selectedAudioId && segment.confirmedPlanAudioId === segment.selectedAudioId);
}

export function removeCourseSegment(segments: CourseFlowSegment[], segmentId: string) {
    return segments.filter((segment) => segment.id !== segmentId).map((segment, position) => ({ ...segment, position }));
}

export function restoreCourseSegment(segments: CourseFlowSegment[], deleted: CourseFlowSegment, previousId: string | null, nextId: string | null) {
    if (segments.some((segment) => segment.id === deleted.id)) return segments;
    const restored = [...segments];
    const previousIndex = previousId ? restored.findIndex((segment) => segment.id === previousId) : -1;
    const nextIndex = nextId ? restored.findIndex((segment) => segment.id === nextId) : -1;
    const insertionIndex = previousIndex >= 0 ? previousIndex + 1 : nextIndex >= 0 ? nextIndex : Math.min(deleted.position, restored.length);
    restored.splice(insertionIndex, 0, deleted);
    return restored.map((segment, position) => ({ ...segment, position }));
}

export function courseSegmentDividerKey(previousId: string, nextId: string) {
    return `${previousId}:${nextId}`;
}
