import type { CourseFlowScene } from "@/types/course-flow";

export async function runCourseSceneReplacement({ previous, optimistic, request, isCurrent, apply }: {
    previous: CourseFlowScene | null;
    optimistic: CourseFlowScene;
    request: () => Promise<CourseFlowScene>;
    isCurrent: () => boolean;
    apply: (scene: CourseFlowScene | null) => void;
}) {
    apply(optimistic);
    try {
        const scene = await request();
        if (isCurrent()) apply(scene);
        return scene;
    } catch (error) {
        if (isCurrent()) apply(previous);
        throw error;
    }
}
