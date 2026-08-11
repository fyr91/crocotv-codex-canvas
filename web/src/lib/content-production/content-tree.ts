import type { ContentNode, ContentNodeType, ContentStage } from "@/types/content-production";

export const CONTENT_NODE_WIDTH = 280;
export const CONTENT_NODE_HEIGHT = 224;
export const CONTENT_NODE_COLUMN_GAP = 120;
export const CONTENT_NODE_ROW_GAP = 44;

export function contentNodeMinimumHeight(optimizeOpen = false) {
    return optimizeOpen ? 336 : CONTENT_NODE_HEIGHT;
}

export type ContentNodeLayout = { x: number; y: number; depth: number };

function ordered(nodes: ContentNode[]) {
    return [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function layoutContentTree(nodes: ContentNode[], nodeHeights: Record<string, number> = {}): Record<string, ContentNodeLayout> {
    const visible = nodes.filter((node) => !node.hiddenAt);
    const roots = ordered(visible.filter((node) => node.parentId === null));
    if (roots.length !== 1) throw new Error("Topic 工作板必须且只能有一个根节点");

    const children = new Map<string, ContentNode[]>();
    for (const item of visible) {
        if (!item.parentId) continue;
        children.set(item.parentId, ordered([...(children.get(item.parentId) || []), item]));
    }

    const heights = new Map<string, number>();
    const visiting = new Set<string>();
    const subtreeHeight = (id: string): number => {
        if (visiting.has(id)) throw new Error("Topic 工作板不能包含循环关系");
        const cached = heights.get(id);
        if (cached != null) return cached;
        visiting.add(id);
        const items = children.get(id) || [];
        const childHeight = items.reduce((sum, child) => sum + subtreeHeight(child.id), 0) + Math.max(0, items.length - 1) * CONTENT_NODE_ROW_GAP;
        visiting.delete(id);
        const height = Math.max(nodeHeights[id] || CONTENT_NODE_HEIGHT, childHeight);
        heights.set(id, height);
        return height;
    };

    const result: Record<string, ContentNodeLayout> = {};
    const place = (item: ContentNode, depth: number, top: number) => {
        const height = subtreeHeight(item.id);
        result[item.id] = {
            x: depth * (CONTENT_NODE_WIDTH + CONTENT_NODE_COLUMN_GAP),
            y: top + (height - (nodeHeights[item.id] || CONTENT_NODE_HEIGHT)) / 2,
            depth,
        };
        let childTop = top;
        for (const child of children.get(item.id) || []) {
            place(child, depth + 1, childTop);
            childTop += subtreeHeight(child.id) + CONTENT_NODE_ROW_GAP;
        }
    };

    place(roots[0], 0, 0);
    if (Object.keys(result).length !== visible.length) throw new Error("Topic 工作板包含未连接到根节点的内容");
    return result;
}

export function contentNodePath(nodes: ContentNode[], nodeId: string) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const path: ContentNode[] = [];
    const visited = new Set<string>();
    let current = byId.get(nodeId);
    while (current) {
        if (visited.has(current.id)) throw new Error("Topic 工作板不能包含循环关系");
        visited.add(current.id);
        path.unshift(current);
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
}

const explicitStageActions: Partial<Record<ContentNodeType, ContentStage[]>> = {
    topic: ["research"],
    angle: ["storyline_script"],
    orientation: ["storyline_script"],
    storyline: ["shot_breakdown"],
    script: ["shot_breakdown"],
    shot: ["storyboard_prompt", "tts", "music"],
    resource_requirements: ["storyboard_prompt"],
    storyboard_prompt: ["storyboard_image"],
    image: ["ltx_multimodal"],
    tts: ["ltx_multimodal"],
    music: ["ltx_multimodal"],
    video: [],
    batch: [],
    text: ["storyline_script"],
};

export function contentNodeStageActions(nodeType: ContentNodeType) {
    return explicitStageActions[nodeType] || [];
}
