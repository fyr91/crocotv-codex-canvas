import { remapWorkflowPrompt } from "@/lib/canvas/canvas-workflow";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

export function duplicateCanvasNode(nodeId: string | ReadonlySet<string>, nodes: CanvasNodeData[], connections: CanvasConnection[], createId: () => string) {
    const selectedIds = typeof nodeId === "string" ? new Set([nodeId]) : new Set(nodeId);
    const roots = nodes.filter((node) => selectedIds.has(node.id));
    if (!roots.length) return null;

    const sources = Array.from(new Map(roots.flatMap((root) => {
        const isGroup = root.type === CanvasNodeType.Group || root.type === CanvasNodeType.WorkflowGroup;
        return isGroup
            ? [root, ...nodes.filter((node) => node.metadata?.groupId === root.id && !(root.type === CanvasNodeType.WorkflowGroup && (node.metadata.workflowRunId || node.metadata.workflowResultOf)))]
            : [root];
    }).map((node) => [node.id, node])).values());
    const sourceIds = new Set(sources.map((node) => node.id));
    const idMap = new Map(sources.map((node) => [node.id, createId()]));
    const duplicatedNodes = sources.map((node) => {
        const isRoot = selectedIds.has(node.id);
        return {
            ...node,
            id: idMap.get(node.id)!,
            title: isRoot ? `${node.title} 副本` : node.title,
            position: { x: node.position.x + 36, y: node.position.y + 36 },
            locked: false,
            metadata: duplicateMetadata(node, idMap),
        };
    });
    const duplicatedConnections = connections.flatMap((connection): CanvasConnection[] => {
        const fromId = idMap.get(connection.fromNodeId);
        const toId = idMap.get(connection.toNodeId);
        if (fromId && toId) return [{ ...connection, id: createId(), fromNodeId: fromId, toNodeId: toId }];
        if (!fromId && toId && !sourceIds.has(connection.fromNodeId)) return [{ ...connection, id: createId(), toNodeId: toId }];
        return [];
    });

    const rootIds = roots.map((root) => idMap.get(root.id)!);
    return { nodes: duplicatedNodes, connections: duplicatedConnections, rootId: rootIds[0], rootIds };
}

function duplicateMetadata(node: CanvasNodeData, idMap: Map<string, string>) {
    const metadata = node.metadata;
    if (!metadata) return metadata;
    const generatedResult = isGeneratedResult(node);
    const {
        generationJobId: _generationJobId,
        generationState: _generationState,
        persistenceState: _persistenceState,
        deliveryMode: _deliveryMode,
        isTemporaryPreview: _isTemporaryPreview,
        generationProgress: _generationProgress,
        generationStage: _generationStage,
        reasoningText: _reasoningText,
        reasoningState: _reasoningState,
        errorDetails: _errorDetails,
        imageOutputIndex: _imageOutputIndex,
        videoOutputIndex: _videoOutputIndex,
        musicBatchId: _musicBatchId,
        musicOutputIndex: _musicOutputIndex,
        uploadTaskId: _uploadTaskId,
        isBatchRoot: _isBatchRoot,
        batchRootId: _batchRootId,
        batchChildIds: _batchChildIds,
        primaryResultId: _primaryResultId,
        batchExpanded: _batchExpanded,
        workflowRunId: _workflowRunId,
        workflowResultOf: _workflowResultOf,
        workflowBatchIndex: _workflowBatchIndex,
        ...settings
    } = metadata;
    const cleaned: CanvasNodeMetadata = {
        ...settings,
        status: !generatedResult && metadata.content && metadata.status === "success" ? "success" : "idle",
        workflowState: node.type === CanvasNodeType.WorkflowGroup ? "stopped" : undefined,
        groupId: metadata.groupId ? idMap.get(metadata.groupId) || metadata.groupId : undefined,
        composerContent: remapWorkflowPrompt(metadata.composerContent, idMap),
        prompt: remapWorkflowPrompt(metadata.prompt, idMap),
        videoFirstFrameNodeId: remapId(metadata.videoFirstFrameNodeId, idMap),
        videoLastFrameNodeId: remapId(metadata.videoLastFrameNodeId, idMap),
        framePickerSourceNodeId: remapId(metadata.framePickerSourceNodeId, idMap),
        sourceVideoNodeId: remapId(metadata.sourceVideoNodeId, idMap),
    };
    if (!generatedResult) return cleaned;
    return {
        ...cleaned,
        content: undefined,
        storageKey: undefined,
        mimeType: undefined,
        bytes: undefined,
        durationMs: undefined,
        naturalWidth: undefined,
        naturalHeight: undefined,
    };
}

function isGeneratedResult(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Config || node.type === CanvasNodeType.Split || node.type === CanvasNodeType.Group || node.type === CanvasNodeType.WorkflowGroup || node.type === CanvasNodeType.Comment) return false;
    const metadata = node.metadata;
    return Boolean(metadata?.generationJobId || metadata?.generationState || metadata?.generationType || metadata?.workflowRunId || metadata?.batchRootId || metadata?.isBatchRoot || metadata?.model);
}

function remapId(id: string | undefined, idMap: Map<string, string>) {
    return id ? idMap.get(id) || id : undefined;
}
