import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasGenerationMode } from "@/types/canvas";

export const WORKFLOW_INPUT_ID = "__workflow_input__";

export function isCanvasGroupNode(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Group || node.type === CanvasNodeType.WorkflowGroup;
}

export function createWorkflowGroup(selectedIds: Set<string>, nodes: CanvasNodeData[], connections: CanvasConnection[], createId: () => string) {
    const selected = nodes.filter((node) => selectedIds.has(node.id) && !isCanvasGroupNode(node));
    if (!selected.length) return { nodes, connections, groupId: null as string | null };

    const groupId = createId();
    const bounds = nodeBounds(selected);
    const padding = 48;
    const header = 24;
    const group: CanvasNodeData = {
        id: groupId,
        type: CanvasNodeType.WorkflowGroup,
        title: "工作流组",
        position: { x: bounds.left - padding, y: bounds.top - padding - header },
        width: Math.max(NODE_DEFAULT_SIZE[CanvasNodeType.WorkflowGroup].width, bounds.right - bounds.left + padding * 2),
        height: Math.max(NODE_DEFAULT_SIZE[CanvasNodeType.WorkflowGroup].height, bounds.bottom - bounds.top + padding * 2 + header),
        metadata: { status: "idle", workflowState: "stopped" },
    };
    const selectedIdSet = new Set(selected.map((node) => node.id));
    const resultSourceById = new Map<string, string>();
    connections.forEach((connection) => {
        if (!selectedIdSet.has(connection.fromNodeId) || !selectedIdSet.has(connection.toNodeId)) return;
        const source = nodes.find((node) => node.id === connection.fromNodeId);
        const target = nodes.find((node) => node.id === connection.toNodeId);
        if (source && target?.metadata?.content && (source.type === CanvasNodeType.Config || source.type === CanvasNodeType.Split)) resultSourceById.set(target.id, source.id);
    });

    return {
        groupId,
        connections,
        nodes: [
            ...nodes.map((node) => selectedIdSet.has(node.id)
                ? { ...node, metadata: { ...node.metadata, groupId, workflowResultOf: node.metadata?.workflowResultOf || resultSourceById.get(node.id) } }
                : node),
            group,
        ],
    };
}

export function workflowGenerationMode(node: CanvasNodeData): CanvasGenerationMode | null {
    if (node.type === CanvasNodeType.Config) return node.metadata?.generationMode || "image";
    if (node.type === CanvasNodeType.Text) return "text";
    if (node.type === CanvasNodeType.Image) return "image";
    if (node.type === CanvasNodeType.Video) return "video";
    if (node.type === CanvasNodeType.Audio) return "audio";
    if (node.type === CanvasNodeType.Music) return "music";
    return null;
}

export function workflowExecutableNodes(groupId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return nodes.filter((node) => {
        if (node.metadata?.groupId !== groupId || node.metadata.workflowRunId || node.metadata.workflowResultOf) return false;
        if (node.type === CanvasNodeType.Config || node.type === CanvasNodeType.Split) return true;
        if (!workflowGenerationMode(node) || node.metadata?.content) return false;
        const hasPrompt = Boolean(node.metadata?.prompt?.trim() || node.metadata?.musicDescription?.trim() || node.metadata?.musicLyrics?.trim());
        const hasInput = connections.some((connection) => connection.toNodeId === node.id && connection.toPort !== "workflow-output");
        return hasPrompt || hasInput;
    });
}

export function workflowTemplateDependencies(node: CanvasNodeData, groupId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const dependencyIds = new Set<string>();
    const incoming = connections.some((connection) => connection.toNodeId === node.id && connection.toPort !== "workflow-output");
    const hasPrompt = Boolean(node.metadata?.composerContent?.trim() || node.metadata?.prompt?.trim() || node.metadata?.musicDescription?.trim() || node.metadata?.musicLyrics?.trim());
    if ((node.type === CanvasNodeType.Split && !incoming) || (node.type === CanvasNodeType.Config && !incoming && !hasPrompt)) dependencyIds.add(`__missing_input__:${node.id}`);
    const tokenIds = promptReferenceIds(node);
    tokenIds.forEach((id) => dependencyIds.add(id));
    if (node.metadata?.videoFirstFrameNodeId) dependencyIds.add(node.metadata.videoFirstFrameNodeId);
    if (node.metadata?.videoLastFrameNodeId) dependencyIds.add(node.metadata.videoLastFrameNodeId);

    const explicitComposer = node.type === CanvasNodeType.Config || node.type === CanvasNodeType.Split ? Boolean(node.metadata?.composerContent?.trim()) : false;
    connections.forEach((connection) => {
        if (connection.toNodeId !== node.id || connection.toPort === "workflow-output") return;
        if (connection.fromNodeId === groupId || !explicitComposer || !tokenIds.length) dependencyIds.add(connection.fromNodeId);
    });

    const executableIds = new Set(workflowExecutableNodes(groupId, nodes, connections).map((item) => item.id));
    const dependencies = new Set<string>();
    dependencyIds.forEach((id) => {
        const source = nodes.find((item) => item.id === id);
        if (id === groupId || source?.type === CanvasNodeType.WorkflowGroup) {
            dependencies.add(WORKFLOW_INPUT_ID);
            return;
        }
        const templateId = source?.metadata?.workflowResultOf || (executableIds.has(id) ? id : undefined);
        if (templateId) {
            dependencies.add(templateId);
            return;
        }
        if (!source?.metadata?.content && source?.type !== CanvasNodeType.Text) dependencies.add(id);
    });
    return [...dependencies];
}

export function workflowReadyNodeIds(executable: CanvasNodeData[], dependencies: Map<string, string[]>, results: Map<string, string[]>, started: Set<string>) {
    return executable
        .filter((node) => !started.has(node.id) && (dependencies.get(node.id) || []).every((dependencyId) => results.has(dependencyId)))
        .map((node) => node.id);
}

export function workflowBatchInputs(groupId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return connections.flatMap((connection) => connection.toNodeId === groupId && connection.toPort === "workflow-input" ? [nodeById.get(connection.fromNodeId)].filter((node): node is CanvasNodeData => Boolean(node)) : []);
}

export function workflowInputGroupForNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const node = nodes.find((item) => item.id === nodeId);
    const groupId = node?.metadata?.groupId;
    if (!groupId || !connections.some((connection) => connection.fromNodeId === groupId && connection.toNodeId === nodeId && connection.fromPort === "workflow-input")) return null;
    return nodes.find((item) => item.id === groupId && item.type === CanvasNodeType.WorkflowGroup) || null;
}

export function workflowOutputTemplateIds(groupId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return [...new Set(connections.flatMap((connection) => {
        if (connection.toNodeId !== groupId || connection.toPort !== "workflow-output") return [];
        const source = nodeById.get(connection.fromNodeId);
        return source ? [source.metadata?.workflowResultOf || source.id] : [];
    }))];
}

export function attachWorkflowOutputResults(groupId: string, runId: string, outputIds: string[], nodes: CanvasNodeData[], connections: CanvasConnection[], createId: () => string) {
    const group = nodes.find((node) => node.id === groupId && node.type === CanvasNodeType.WorkflowGroup);
    const outputSet = new Set(outputIds.filter((id) => {
        const node = nodes.find((item) => item.id === id);
        return node?.metadata?.workflowRunId === runId;
    }));
    if (!group || !outputSet.size) return { nodes, connections };
    const outputNodes = nodes.filter((node) => outputSet.has(node.id));
    const removableBatchRootIds = new Set(outputNodes.flatMap((node) => {
        const root = node.metadata?.batchRootId ? nodes.find((item) => item.id === node.metadata?.batchRootId) : null;
        return root?.metadata?.workflowRunId === runId && root.metadata.batchChildIds?.every((id) => outputSet.has(id)) ? [root.id] : [];
    }));
    const minX = Math.min(...outputNodes.map((node) => node.position.x));
    const offsetX = group.position.x + group.width + 96 - minX;
    return {
        nodes: nodes.filter((node) => !removableBatchRootIds.has(node.id)).map((node) => outputSet.has(node.id)
            ? { ...node, position: { ...node.position, x: node.position.x + offsetX }, metadata: { ...node.metadata, groupId: undefined, batchRootId: undefined } }
            : node),
        connections: [
            ...connections.filter((connection) => !outputSet.has(connection.toNodeId) && !removableBatchRootIds.has(connection.fromNodeId) && !removableBatchRootIds.has(connection.toNodeId)),
            ...outputNodes.map((node): CanvasConnection => ({ id: createId(), fromNodeId: groupId, toNodeId: node.id, fromPort: "workflow-output" })),
        ],
    };
}

export function duplicateWorkflowGroup(groupId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], createId: () => string) {
    const group = nodes.find((node) => node.id === groupId && node.type === CanvasNodeType.WorkflowGroup);
    if (!group) return { nodes: [] as CanvasNodeData[], connections: [] as CanvasConnection[], groupId: null as string | null };
    const savedNodes = nodes.filter((node) => node.metadata?.groupId === groupId && !node.metadata.workflowRunId);
    const nextGroupId = createId();
    const idMap = new Map<string, string>([[groupId, nextGroupId]]);
    savedNodes.forEach((node) => idMap.set(node.id, createId()));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const nextNodes: CanvasNodeData[] = [
        { ...group, id: nextGroupId, title: `${group.title} 副本`, position: { x: group.position.x + 36, y: group.position.y + 36 }, metadata: { ...group.metadata, status: "idle", workflowState: "stopped", workflowRunId: undefined } },
        ...savedNodes.map((node) => ({
            ...node,
            id: idMap.get(node.id)!,
            position: { x: node.position.x + 36, y: node.position.y + 36 },
            metadata: remapWorkflowMetadata({ ...node.metadata, groupId: nextGroupId, workflowState: undefined }, idMap),
        })),
    ];
    const nextConnections = connections.flatMap((connection): CanvasConnection[] => {
        const fromId = idMap.get(connection.fromNodeId);
        const toId = idMap.get(connection.toNodeId);
        if (fromId && toId) return [{ ...connection, id: createId(), fromNodeId: fromId, toNodeId: toId }];
        if (!fromId && toId && nodeById.get(connection.fromNodeId)?.metadata?.groupId !== groupId) return [{ ...connection, id: createId(), toNodeId: toId }];
        return [];
    });
    return { nodes: nextNodes, connections: nextConnections, groupId: nextGroupId };
}

export function expandWorkflowGroupBounds(group: CanvasNodeData, children: CanvasNodeData[], padding = 24) {
    const right = children.reduce((value, node) => Math.max(value, node.position.x + node.width + padding), group.position.x + group.width);
    const bottom = children.reduce((value, node) => Math.max(value, node.position.y + node.height + padding), group.position.y + group.height);
    return { ...group, width: right - group.position.x, height: bottom - group.position.y };
}

export function remapWorkflowPrompt(value: string | undefined, resultIdByReferenceId: Map<string, string>) {
    if (!value) return value;
    return value.replace(/@\[node:([^\]]+)\]/g, (token, nodeId: string) => {
        const nextId = resultIdByReferenceId.get(nodeId);
        return nextId ? `@[node:${nextId}]` : token;
    });
}

function promptReferenceIds(node: CanvasNodeData) {
    const values = [node.metadata?.composerContent, node.metadata?.prompt, node.metadata?.musicDescription, node.metadata?.musicLyrics];
    const ids = new Set<string>();
    values.forEach((value) => {
        if (!value) return;
        for (const match of value.matchAll(/@\[node:([^\]]+)\]/g)) ids.add(match[1]);
    });
    return [...ids];
}

function remapWorkflowMetadata(metadata: CanvasNodeData["metadata"], idMap: Map<string, string>) {
    if (!metadata) return metadata;
    const referenceMap = new Map([...idMap.entries()]);
    return {
        ...metadata,
        composerContent: remapWorkflowPrompt(metadata.composerContent, referenceMap),
        prompt: remapWorkflowPrompt(metadata.prompt, referenceMap),
        workflowResultOf: metadata.workflowResultOf ? idMap.get(metadata.workflowResultOf) || metadata.workflowResultOf : undefined,
        videoFirstFrameNodeId: metadata.videoFirstFrameNodeId ? idMap.get(metadata.videoFirstFrameNodeId) || metadata.videoFirstFrameNodeId : undefined,
        videoLastFrameNodeId: metadata.videoLastFrameNodeId ? idMap.get(metadata.videoLastFrameNodeId) || metadata.videoLastFrameNodeId : undefined,
    };
}

function nodeBounds(nodes: CanvasNodeData[]) {
    return nodes.reduce(
        (bounds, node) => ({
            left: Math.min(bounds.left, node.position.x),
            top: Math.min(bounds.top, node.position.y),
            right: Math.max(bounds.right, node.position.x + node.width),
            bottom: Math.max(bounds.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
}
