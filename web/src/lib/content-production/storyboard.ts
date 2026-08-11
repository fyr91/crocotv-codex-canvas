import type {
    ContentNode,
    ContentStoryboardHeader,
    ContentStoryboardNode,
    ContentStoryboardSnapshot,
} from "@/types/content-production";

const operations = new Set(["generate", "regenerate", "optimize", "optimize_node"]);
const phases = new Set(["producer_running", "accepted", "failed", "canceled"]);

export function contentStoryboardSnapshot(node: ContentNode | null | undefined): ContentStoryboardSnapshot | null {
    const value = node?.data.storyboardWorkflow;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const snapshot = value as Partial<ContentStoryboardSnapshot>;
    if (
        !["batch", "shot"].includes(node?.nodeType || "")
        || !operations.has(String(snapshot.operation))
        || !phases.has(String(snapshot.phase))
        || typeof snapshot.runId !== "string"
    ) return null;
    return {
        operation: snapshot.operation as ContentStoryboardSnapshot["operation"],
        phase: snapshot.phase as ContentStoryboardSnapshot["phase"],
        runId: snapshot.runId,
        sourceNodeId: typeof snapshot.sourceNodeId === "string" ? snapshot.sourceNodeId : "",
        groupId: typeof snapshot.groupId === "string" ? snapshot.groupId : String(node?.data.storyboardGroupId || node?.id || ""),
        parentInteractionId: typeof snapshot.parentInteractionId === "string" ? snapshot.parentInteractionId : null,
        latestGeminiInteractionId: typeof snapshot.latestGeminiInteractionId === "string" ? snapshot.latestGeminiInteractionId : null,
        optimizationDirection: typeof snapshot.optimizationDirection === "string" ? snapshot.optimizationDirection : null,
        header: isHeader(snapshot.header) ? snapshot.header : null,
        node: isStoryboardNode(snapshot.node) ? snapshot.node : isStoryboardNode(node?.data.structuredOutput) ? node?.data.structuredOutput as ContentStoryboardNode : null,
        lastError: typeof snapshot.lastError === "string" ? snapshot.lastError : null,
    };
}

export function collapsedStoryboardNodes(nodes: ContentNode[], collapsedGroupIds: Set<string>) {
    if (!collapsedGroupIds.size) return nodes;
    const hidden = new Set(nodes.filter((node) => {
        const groupId = String(node.data.storyboardGroupId || "");
        return groupId && node.id !== groupId && collapsedGroupIds.has(groupId);
    }).map((node) => node.id));
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of nodes) {
            if (node.parentId && hidden.has(node.parentId) && !hidden.has(node.id)) {
                hidden.add(node.id);
                changed = true;
            }
        }
    }
    return nodes.filter((node) => !hidden.has(node.id));
}

function isHeader(value: unknown): value is ContentStoryboardHeader {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const header = value as Partial<ContentStoryboardHeader>;
    return typeof header.storyline_title === "string"
        && Number.isInteger(header.total_nodes)
        && Boolean(header.metadata && typeof header.metadata === "object");
}

function isStoryboardNode(value: unknown): value is ContentStoryboardNode {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const node = value as Partial<ContentStoryboardNode>;
    return typeof node.node_id === "string"
        && Number.isInteger(node.scene_number)
        && typeof node.scene_id === "string"
        && Boolean(node.script_content && typeof node.script_content === "object")
        && Array.isArray(node.keyframes);
}
