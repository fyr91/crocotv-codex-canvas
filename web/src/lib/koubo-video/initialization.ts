import type { ContentVideoWorkflowType } from "@/types/content-production";

const definitions = {
    "koubo-video": { label: "口播视频", routeSegment: "koubo-video" },
    "course-video": { label: "课程视频", routeSegment: "course-video" },
    "course-flow": { label: "课程视频", routeSegment: "course-flow" },
} satisfies Record<ContentVideoWorkflowType, { label: string; routeSegment: string }>;

export function videoWorkflowDefinition(workflowType: ContentVideoWorkflowType) {
    return definitions[workflowType];
}

export function buildVideoInitializationPath(workflowType: ContentVideoWorkflowType, projectId: string, clientRequestId: string) {
    return `/content/${definitions[workflowType].routeSegment}/${projectId}?initialize=${encodeURIComponent(clientRequestId)}`;
}

export function buildKouboInitializationPath(projectId: string, clientRequestId: string) {
    return buildVideoInitializationPath("koubo-video", projectId, clientRequestId);
}

export function readKouboInitialization(search: string) {
    const clientRequestId = new URLSearchParams(search).get("initialize");
    return clientRequestId ? { clientRequestId } : null;
}
