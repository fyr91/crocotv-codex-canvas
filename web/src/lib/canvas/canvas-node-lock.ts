import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function isCanvasNodeLocked(node: CanvasNodeData | undefined, nodes: CanvasNodeData[]) {
    if (!node) return false;
    if (node.metadata?.remoteOperationActive) return true;
    if (node.locked) return true;
    const groupId = node.metadata?.groupId;
    return Boolean(groupId && nodes.find((item) => item.id === groupId)?.locked);
}

export function isCanvasNodeLockBusy(nodeId: string, nodes: CanvasNodeData[]) {
    const ids = lockTargetIds(nodeId, nodes, false);
    return nodes.some((node) => ids.has(node.id) && (node.metadata?.remoteOperationActive || node.metadata?.status === "loading" || node.metadata?.commentBeautifying || node.metadata?.uploadTaskId || node.metadata?.workflowState === "waiting" || node.metadata?.workflowState === "ready" || node.metadata?.workflowState === "running"));
}

export function setCanvasNodeLocked(nodes: CanvasNodeData[], nodeId: string, locked: boolean) {
    const ids = lockTargetIds(nodeId, nodes, !locked);
    if (!ids.size) return nodes;
    return nodes.map((node) => ids.has(node.id) ? { ...node, locked } : node);
}

function lockTargetIds(nodeId: string, nodes: CanvasNodeData[], unlockParent: boolean) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return new Set<string>();
    const parent = unlockParent && node.metadata?.groupId ? nodes.find((item) => item.id === node.metadata?.groupId && item.locked) : undefined;
    const root = parent || node;
    if (root.type !== CanvasNodeType.Group && root.type !== CanvasNodeType.WorkflowGroup) return new Set([root.id]);
    return new Set([root.id, ...nodes.filter((item) => item.metadata?.groupId === root.id).map((item) => item.id)]);
}
