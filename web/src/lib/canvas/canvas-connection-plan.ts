import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ConnectionHandle } from "@/types/canvas";

type NormalizedConnection = Omit<CanvasConnection, "id">;
type NormalizeConnection = (handle: ConnectionHandle, targetNodeId: string) => NormalizedConnection | null;

export function connectionHandlesForSelection(anchor: ConnectionHandle, selectedIds: ReadonlySet<string>, nodes: CanvasNodeData[]) {
    if (!selectedIds.has(anchor.nodeId) || selectedIds.size < 2) return [anchor];
    const handles = [anchor];
    nodes.forEach((node) => {
        if (node.id === anchor.nodeId || !selectedIds.has(node.id) || node.type === CanvasNodeType.Comment || node.type === CanvasNodeType.Group) return;
        handles.push({
            nodeId: node.id,
            handleType: anchor.handleType,
            port: node.type === CanvasNodeType.WorkflowGroup ? (anchor.handleType === "source" ? "workflow-output" : "workflow-input") : undefined,
        });
    });
    return handles;
}
export function planCanvasConnections(
    handles: ConnectionHandle[],
    targetNodeId: string,
    existing: CanvasConnection[],
    normalize: NormalizeConnection,
    createId: () => string,
) {
    const connectionKeys = new Set(existing.map(connectionKey));
    const connections: CanvasConnection[] = [];
    let skipped = 0;

    handles.forEach((handle) => {
        const normalized = normalize(handle, targetNodeId);
        if (!normalized) {
            skipped += 1;
            return;
        }
        const key = connectionKey(normalized);
        if (connectionKeys.has(key)) {
            skipped += 1;
            return;
        }
        connectionKeys.add(key);
        connections.push({ id: createId(), ...normalized });
    });
    return { connections, skipped };
}

function connectionKey(connection: NormalizedConnection) {
    return [connection.fromNodeId, connection.toNodeId, connection.fromPort || "", connection.toPort || ""].join(":");
}
