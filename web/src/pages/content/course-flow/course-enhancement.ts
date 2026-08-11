import type { CourseFlowProject, CourseFlowSegment } from "@/types/course-flow";

export function buildCourseEnhancementUserPrompt(
    project: CourseFlowProject,
    segments: CourseFlowSegment[],
    instruction: string,
) {
    return JSON.stringify({
        courseDefinition: {
            sourceType: project.sourceType,
            topic: project.topic,
            audience: project.audience,
            extraPrompt: project.extraPrompt,
        },
        currentSegments: segments.map(({ text, voiceDirection }) => ({ text, voiceDirection })),
        enhancementInstruction: instruction.trim(),
    });
}

export async function runCourseEnhancement({
    previous,
    request,
    load,
    isCurrent,
    apply,
    restore,
}: {
    previous: CourseFlowSegment[];
    request: () => Promise<void>;
    load: () => Promise<CourseFlowSegment[]>;
    isCurrent: () => boolean;
    apply: (segments: CourseFlowSegment[]) => void;
    restore: (segments: CourseFlowSegment[]) => void;
}) {
    try {
        await request();
        const segments = await load();
        if (isCurrent()) apply(segments);
    } catch (error) {
        if (isCurrent()) restore(previous);
        throw error;
    }
}
