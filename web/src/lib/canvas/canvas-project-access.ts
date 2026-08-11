import type { CanvasProject, CanvasSaveStatus } from "@/stores/canvas/use-canvas-store";

export type CanvasSaveError = { code?: string; message?: string; details?: string; hint?: string };

export function partitionCanvasProjects(projects: CanvasProject[], userId: string) {
    return projects.reduce(
        (result, project) => {
            result[project.ownerId === userId ? "own" : "shared"].push(project);
            return result;
        },
        { own: [] as CanvasProject[], shared: [] as CanvasProject[] },
    );
}

export function isCanvasReadOnly(project: CanvasProject | null | undefined, userId: string) {
    return Boolean(project && project.ownerId !== userId);
}

export function cloneCanvasProject(source: CanvasProject, owner: { id: string; ownerId: string; ownerName: string; ownerUsername: string; now: string }): CanvasProject {
    const copy = structuredClone(source);
    return {
        ...copy,
        id: owner.id,
        ownerId: owner.ownerId,
        ownerName: owner.ownerName,
        ownerUsername: owner.ownerUsername,
        title: `${source.title} - 副本`,
        createdAt: owner.now,
        updatedAt: owner.now,
        version: 1,
    };
}

const blockedCodes = new Set(["401", "403", "42501", "P0002", "PGRST301", "PGRST302"]);

export function classifyCanvasSaveError(error: CanvasSaveError): Extract<CanvasSaveStatus, "retrying" | "blocked"> {
    return error.code && blockedCodes.has(error.code) ? "blocked" : "retrying";
}

export function canvasSaveDiagnostic(projectId: string, error: CanvasSaveError, status: CanvasSaveStatus) {
    return { projectId, status, code: error.code || "unknown", message: error.message || "unknown", details: error.details || "", hint: error.hint || "", occurredAt: new Date().toISOString() };
}
