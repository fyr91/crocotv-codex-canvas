import { create } from "zustand";

import type { CourseFlowProject, CourseFlowScene, CourseFlowSegment, CourseFlowSnapshot } from "@/types/course-flow";

type OptimisticOperation = { operationId: string; snapshot: unknown };
type CourseFlowState = CourseFlowSnapshot & {
    optimistic: Record<string, OptimisticOperation>;
    hydrate: (snapshot: CourseFlowSnapshot) => void;
    patchProject: (patch: Partial<CourseFlowProject>) => void;
    setSegments: (segments: CourseFlowSegment[]) => void;
    patchSegment: (id: string, patch: Partial<CourseFlowSegment>) => void;
    setScene: (scene: CourseFlowScene | null) => void;
    begin: (key: string, snapshot: unknown) => string;
    isCurrent: (key: string, operationId: string) => boolean;
    finish: (key: string, operationId: string) => void;
};

const empty: CourseFlowSnapshot = { project: null as never, role: null, roles: [], segments: [], scene: null };

export const useCourseFlowStore = create<CourseFlowState>()((set, get) => ({
    ...empty,
    optimistic: {},
    hydrate: (snapshot) => set({ ...snapshot, optimistic: {} }),
    patchProject: (patch) => set((state) => ({ project: { ...state.project, ...patch } })),
    setSegments: (segments) => set({ segments }),
    patchSegment: (id, patch) => set((state) => ({ segments: state.segments.map((segment) => segment.id === id ? { ...segment, ...patch } : segment) })),
    setScene: (scene) => set({ scene }),
    begin: (key, snapshot) => {
        const operationId = crypto.randomUUID();
        set((state) => ({ optimistic: { ...state.optimistic, [key]: { operationId, snapshot } } }));
        return operationId;
    },
    isCurrent: (key, operationId) => get().optimistic[key]?.operationId === operationId,
    finish: (key, operationId) => set((state) => {
        if (state.optimistic[key]?.operationId !== operationId) return state;
        const optimistic = { ...state.optimistic };
        delete optimistic[key];
        return { optimistic };
    }),
}));
