import type { CourseFlowSegment } from "@/types/course-flow";

export type CourseFlowAudioRefreshMode = "missing" | "stale";

export function getCourseFlowAudioRefreshMode(segment: CourseFlowSegment): CourseFlowAudioRefreshMode | null {
    if (!segment.audioVersions.length) return "missing";
    return segment.audioVersions.some((audio) => audio.sourceSegmentRevision === segment.revision) ? null : "stale";
}
