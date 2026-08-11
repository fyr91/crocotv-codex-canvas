import { contentNodePath } from "./content-tree";
import type { ContentGenerationRun, ContentNode, ContentNodeType, ContentStage } from "@/types/content-production";
import type { ViewportTransform } from "@/types/canvas";

export type ContentWorkboardMode = "global" | "focus" | "collapse";
export type ContentNodePanelKind = "text" | "image" | "video" | "audio" | "music" | "batch";
export type ContentWorkboardViewState = {
    selectedNodeId: string | null;
    viewport: ViewportTransform;
};
export type ContentWorkboardViewAction =
    | { type: "select"; nodeId: string | null }
    | { type: "viewport"; value: ViewportTransform | ((current: ViewportTransform) => ViewportTransform) };

export function contentWorkboardViewReducer(state: ContentWorkboardViewState, action: ContentWorkboardViewAction): ContentWorkboardViewState {
    if (action.type === "select") return { ...state, selectedNodeId: action.nodeId };
    return {
        ...state,
        viewport: typeof action.value === "function" ? action.value(state.viewport) : action.value,
    };
}

export function startConfirmedRegeneration(submit: () => Promise<void>, onError: (error: unknown) => void): void {
    void submit().catch(onError);
}

export function contentWorkboardNodes(nodes: ContentNode[], selectedNodeId: string | null, mode: ContentWorkboardMode) {
    const visible = nodes.filter((node) => !node.hiddenAt);
    if (!selectedNodeId || mode === "global") return visible;

    const selected = visible.find((node) => node.id === selectedNodeId);
    if (!selected) return visible;
    const pathIds = new Set(contentNodePath(visible, selected.id).map((node) => node.id));

    if (mode === "collapse") {
        const hiddenDescendants = descendantIds(visible, selected.id);
        hiddenDescendants.delete(selected.id);
        return visible.filter((node) => !hiddenDescendants.has(node.id));
    }

    const descendants = descendantIds(visible, selected.id);
    return visible.filter((node) => pathIds.has(node.id) || descendants.has(node.id));
}

function descendantIds(nodes: ContentNode[], rootId: string) {
    const children = new Map<string, string[]>();
    for (const node of nodes) {
        if (!node.parentId) continue;
        children.set(node.parentId, [...(children.get(node.parentId) || []), node.id]);
    }
    const result = new Set<string>();
    const visit = (id: string) => {
        result.add(id);
        for (const childId of children.get(id) || []) visit(childId);
    };
    visit(rootId);
    return result;
}

export function contentBranchNodes(nodes: ContentNode[], rootId: string) {
    const visible = nodes.filter((node) => !node.hiddenAt);
    if (!visible.some((node) => node.id === rootId)) return [];
    const branchIds = descendantIds(visible, rootId);
    return visible.filter((node) => branchIds.has(node.id));
}

export function contentNodeProducingRun(node: ContentNode | null, runs: ContentGenerationRun[]) {
    if (!node) return null;
    const factory = objectValue(node.data.topicFactory);
    const storyline = objectValue(node.data.storylineWorkflow);
    const storyboard = objectValue(node.data.storyboardWorkflow);
    const runId = [node.data.runId, factory.runId, storyline.runId, storyboard.runId]
        .find((value): value is string => typeof value === "string" && Boolean(value));
    const exact = runId ? runs.find((run) => run.id === runId) : undefined;
    if (exact) return exact;
    return runs
        .filter((run) => run.resultNodeId === node.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] || null;
}

export function createOptimisticContentBranchNode(input: {
    topicId: string;
    attemptId: string;
    parentNode: ContentNode;
    createdBy: string;
    requestId: string;
    stage: ContentStage;
    createdAt: string;
}): ContentNode {
    const storyline = input.stage === "storyline_script";
    return {
        id: `optimistic-content-branch:${input.requestId}`,
        topicId: input.topicId,
        attemptId: input.attemptId,
        parentId: input.parentNode.id,
        nodeType: storyline ? "storyline" : defaultChildType(input.parentNode.nodeType),
        title: storyline ? "故事线" : "生成结果",
        summary: storyline ? "正在生成故事线" : "正在生成",
        sortOrder: 0,
        data: { stage: input.stage, clientRequestId: input.requestId },
        status: "running",
        revision: 1,
        createdBy: input.createdBy,
        hiddenAt: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
    };
}

export function mergeOptimisticContentBranchNode(serverNodes: ContentNode[], optimisticNode: ContentNode | null) {
    if (!optimisticNode) return serverNodes;
    const clientRequestId = optimisticNode.data.clientRequestId;
    if (serverNodes.some((node) => node.data.clientRequestId === clientRequestId)) return serverNodes;
    return [...serverNodes, optimisticNode];
}

export function contentWorkboardShortcut(input: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
}) {
    const modifier = input.metaKey || input.ctrlKey;
    if (modifier && !input.altKey && !input.shiftKey && input.key.toLowerCase() === "z") return "undo" as const;
    if (!modifier && !input.altKey && !input.shiftKey && ["Backspace", "Delete"].includes(input.key)) return "delete" as const;
    return null;
}

export function contentNodePanelKind(nodeType: ContentNodeType): ContentNodePanelKind {
    if (nodeType === "image" || nodeType === "storyboard_prompt") return "image";
    if (nodeType === "video") return "video";
    if (nodeType === "tts") return "audio";
    if (nodeType === "music") return "music";
    if (nodeType === "batch") return "batch";
    return "text";
}

const childTypes: Partial<Record<ContentNodeType, ContentNodeType>> = {
    topic: "orientation",
    angle: "storyline",
    orientation: "storyline",
    storyline: "script",
    script: "shot",
    shot: "storyboard_prompt",
    resource_requirements: "storyboard_prompt",
    storyboard_prompt: "image",
    image: "video",
    tts: "video",
    music: "video",
    video: "batch",
    text: "text",
};

export function defaultChildType(nodeType: ContentNodeType): ContentNodeType {
    return childTypes[nodeType] || "text";
}

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}
