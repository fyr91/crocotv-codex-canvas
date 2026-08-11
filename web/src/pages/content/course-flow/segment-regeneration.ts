import type { CourseFlowSegment } from "@/types/course-flow";

export type RegeneratedSegmentPatch = Pick<CourseFlowSegment, "text" | "voiceDirection" | "revision" | "selectedAudioId">;

export async function runSegmentRegeneration({ previous, request, isCurrent, apply }: {
    previous: CourseFlowSegment;
    request: () => Promise<RegeneratedSegmentPatch>;
    isCurrent: () => boolean;
    apply: (patch: Partial<CourseFlowSegment>) => void;
}) {
    try {
        const next = await request();
        if (!next.text.trim()) throw new Error("片段生成结果不可用");
        if (isCurrent()) apply(next);
    } catch (error) {
        if (isCurrent()) apply(previous);
        throw error;
    }
}
