type DocumentNode = {
    id: string;
    metadata?: {
        content?: string;
        storageKey?: string;
        uploadTaskId?: string;
        commentBeautifying?: boolean;
        groupId?: string;
        workflowState?: string;
        workflowRunId?: string;
        workflowResultOf?: string;
        workflowBatchIndex?: number;
        reasoningText?: string;
        reasoningState?: "streaming" | "complete";
    };
};

type DocumentConnection = {
    fromNodeId: string;
    toNodeId: string;
    fromPort?: string;
    toPort?: string;
};

export function canvasProjectDocument<Node extends DocumentNode, Connection extends DocumentConnection, Session>(project: {
    nodes: Node[];
    connections: Connection[];
    chatSessions: Session[];
    activeChatId: string | null;
    showImageInfo: boolean;
    viewport: { x: number; y: number; k: number };
}) {
    const pendingNodeIds = new Set(project.nodes.filter((node) => node.metadata?.uploadTaskId).map((node) => node.id));
    return {
        nodes: project.nodes
            .filter((node) => !pendingNodeIds.has(node.id))
            .map((node) => {
                const { commentBeautifying: _commentBeautifying, ...metadata } = node.metadata || {};
                return { ...node, metadata: metadata.storageKey ? { ...metadata, content: "" } : metadata };
            }),
        connections: project.connections.filter((connection) => !pendingNodeIds.has(connection.fromNodeId) && !pendingNodeIds.has(connection.toNodeId)),
        chatSessions: project.chatSessions,
        activeChatId: project.activeChatId,
        backgroundMode: "lines",
        showImageInfo: project.showImageInfo,
        viewport: project.viewport,
    };
}
