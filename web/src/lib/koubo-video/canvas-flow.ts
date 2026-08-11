import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import type { ContentNode } from "@/types/content-production";
import type { KouboAudioNode, KouboWorkspace } from "@/types/koubo-video";
import { sortedSegments } from "./workflow";
import { videoWorkflowCopy, type VideoWorkflowCopy } from "./workflow-copy";

export type KouboFlowNode = {
    id: string;
    content: ContentNode;
    canvas: CanvasNodeData;
    kind: "script-group" | "segment" | "audio" | "image" | "video";
    sourceId?: string;
};

const nodeWidth = 280;
const columnStep = 360;
const nodeGap = 40;

type NodeRect = { x: number; y: number; width: number; height: number };

export function kouboCanvasFlow(
    workspace: KouboWorkspace,
    collapsedGroupIds: ReadonlySet<string>,
    pendingScript: boolean | readonly string[] = false,
    measuredNodeHeights: Readonly<Record<string, number>> = {},
    copy: Pick<VideoWorkflowCopy, "startTitle" | "generationNodeTitle" | "scriptGroupTitle"> = videoWorkflowCopy("koubo-video"),
) {
    const nodes: KouboFlowNode[] = [];
    const pairs: Array<readonly [string, string]> = [];
    const parentById = new Map<string, string>();
    const imageById = new Map(workspace.imageResults.map((image) => [image.id, image]));
    const audioByParentId = new Map<string, KouboAudioNode[]>();
    for (const audio of workspace.audioNodes) {
        if (!audio.parentAudioNodeId) continue;
        audioByParentId.set(audio.parentAudioNodeId, [...(audioByParentId.get(audio.parentAudioNodeId) || []), audio]);
    }
    const audioChildren = (audioId: string) =>
        [...(audioByParentId.get(audioId) || [])].sort((a, b) => (a.segmentIndex || 0) - (b.segmentIndex || 0));
    const addNode = (node: KouboFlowNode, parentId: string) => {
        nodes.push(node);
        pairs.push([parentId, node.id]);
        parentById.set(node.id, parentId);
        return node;
    };
    const addAudioBranch = (
        audio: KouboAudioNode,
        parentId: string,
        x: number,
        title: string,
    ) => {
        const audioNode = addNode(flowNode(
            `koubo-audio-${audio.id}`,
            title,
            audioStatusLabel(audio),
            "tts",
            x,
            0,
            "audio",
            workspace.projectId,
            audio.status === "ready" ? "succeeded" : audio.status === "failed" ? "failed" : "running",
            audio.id,
            {
                assetId: audio.assetId,
                url: audio.url,
                sourceType: audio.sourceType,
                parentAudioNodeId: audio.parentAudioNodeId,
                segmentIndex: audio.segmentIndex,
                imageResultId: audio.imageResultId,
                firstFrameUrl: audio.imageResultId ? imageById.get(audio.imageResultId)?.url : undefined,
                compactStatusOnly: true,
            },
            measuredNodeHeights,
        ), parentId);
        for (const [childIndex, child] of audioChildren(audio.id).entries()) {
            addAudioBranch(child, audioNode.id, x + columnStep, `${title} · 片段 ${childIndex + 1}`);
        }
        return audioNode;
    };

    for (const group of workspace.scriptGroups) {
        const segments = sortedSegments(workspace.segments.filter((segment) => segment.scriptGroupId === group.id));
        const groupNode = addNode(flowNode(
            `koubo-script-group-${group.id}`,
            copy.scriptGroupTitle,
            `${segments.length} 个文案段 · 每段可独立编辑与生成音频`,
            "script",
            400,
            0,
            "script-group",
            workspace.projectId,
            "succeeded",
            group.id,
            { sourceType: group.sourceType, sourceInput: group.sourceInput },
            measuredNodeHeights,
        ), "koubo-start");
        if (collapsedGroupIds.has(group.id)) continue;
        const segmentNodes = segments.map((segment, segmentIndex) => addNode(flowNode(
                `koubo-segment-${segment.id}`,
                `文案 ${segmentIndex + 1}`,
                segment.text,
                "text",
                760,
                0,
                "segment",
                workspace.projectId,
                "succeeded",
                segment.id,
                { voiceDirection: segment.voiceDirection, scriptGroupId: segment.scriptGroupId },
                measuredNodeHeights,
            ), groupNode.id));
        for (const [segmentIndex, segment] of segments.entries()) {
            const segmentNode = segmentNodes[segmentIndex];
            const roots = workspace.audioNodes.filter((audio) => audio.segmentId === segment.id && !audio.parentAudioNodeId);
            for (const audio of roots) addAudioBranch(audio, segmentNode.id, 1120, `音频 ${segmentIndex + 1}`);
        }
    }

    const standaloneAudio = workspace.audioNodes.filter((audio) => !audio.segmentId && !audio.parentAudioNodeId);
    for (const [audioIndex, audio] of standaloneAudio.entries()) {
        addAudioBranch(audio, "koubo-start", 400, `音频 ${audioIndex + 1}`);
    }

    const start = flowNode(
        "koubo-start",
        copy.startTitle,
        "",
        "text",
        40,
        0,
        "script-group",
        workspace.projectId,
        "succeeded",
        undefined,
        {},
        measuredNodeHeights,
    );
    start.canvas.width = 288;
    const pendingScriptIds = Array.isArray(pendingScript)
        ? pendingScript
        : pendingScript ? ["koubo-script-generation"] : [];
    const pendingScriptCanvases = pendingScriptIds.map((id) =>
        canvasNode(id, copy.generationNodeTitle, 448, measuredHeight(measuredNodeHeights, id, 224)));
    for (const pendingCanvas of pendingScriptCanvases) parentById.set(pendingCanvas.id, start.id);
    layoutTree(
        [start.canvas, ...nodes.map((node) => node.canvas), ...pendingScriptCanvases],
        parentById,
        start.id,
    );

    const placedRects: NodeRect[] = [
        start.canvas,
        ...nodes.map((node) => node.canvas),
        ...pendingScriptCanvases,
    ].map(nodeRect);
    const coreBottom = Math.max(...placedRects.map((rect) => rect.y + rect.height));
    const existingNodeById = new Map(nodes.map((node) => [node.id, node]));
    const furthestAudioX = (audioId: string): number => {
        const audioNode = existingNodeById.get(`koubo-audio-${audioId}`);
        return Math.max(audioNode?.canvas.position.x || 0, ...audioChildren(audioId).map((child) => furthestAudioX(child.id)));
    };
    const imageLayouts = workspace.imageResults.map((image, imageIndex) => {
        const linkedAudios = workspace.audioNodes.filter((audio) => audio.imageResultId === image.id);
        const linkedAudioNodes = linkedAudios
            .map((audio) => existingNodeById.get(`koubo-audio-${audio.id}`))
            .filter((node): node is KouboFlowNode => Boolean(node));
        const height = measuredHeight(measuredNodeHeights, `koubo-image-${image.id}`, 260);
        return {
            image,
            imageIndex,
            linkedAudioNodes,
            x: linkedAudioNodes.length ? Math.max(...linkedAudios.map((audio) => furthestAudioX(audio.id))) + columnStep : 1480,
            desiredY: linkedAudioNodes.length
                ? linkedAudioNodes.reduce((total, node) => total + centerY(node.canvas), 0) / linkedAudioNodes.length - height / 2
                : coreBottom + nodeGap + imageIndex * (height + nodeGap),
            height,
        };
    });
    const imageNodesById = new Map<string, KouboFlowNode>();
    for (const layout of [...imageLayouts].sort((a, b) => Number(Boolean(b.linkedAudioNodes.length)) - Number(Boolean(a.linkedAudioNodes.length)))) {
        const y = availableY(layout.x, layout.desiredY, nodeWidth, layout.height, placedRects);
        const imageNode = flowNode(
            `koubo-image-${layout.image.id}`,
            `角色口播图 ${layout.imageIndex + 1}`,
            statusLabel(layout.image.status),
            "image",
            layout.x,
            y,
            "image",
            workspace.projectId,
            contentStatus(layout.image.status),
            layout.image.id,
            {
                assetId: layout.image.assetId,
                url: layout.image.url,
                sourceType: layout.image.sourceType,
                prompt: layout.image.prompt,
                aspectRatio: layout.image.aspectRatio,
                roleImage: true,
            },
            measuredNodeHeights,
        );
        imageNodesById.set(layout.image.id, imageNode);
        placedRects.push(nodeRect(imageNode.canvas));
    }
    for (const { image, linkedAudioNodes } of imageLayouts) {
        const imageNode = imageNodesById.get(image.id)!;
        nodes.push(imageNode);
        pairs.push(...linkedAudioNodes.map((audioNode) => [audioNode.id, imageNode.id] as const));
        const candidates = workspace.videoCandidates.filter((candidate) => candidate.imageResultId === image.id);
        const videoHeights = candidates.map((candidate) => measuredHeight(measuredNodeHeights, `koubo-video-${candidate.id}`, 224));
        const videosHeight = videoHeights.reduce((total, height, index) => total + height + (index ? nodeGap : 0), 0);
        let nextVideoY = centerY(imageNode.canvas) - videosHeight / 2;
        for (const [videoIndex, candidate] of candidates.entries()) {
            const height = videoHeights[videoIndex];
            const x = imageNode.canvas.position.x + columnStep;
            const y = availableY(x, nextVideoY, nodeWidth, height, placedRects);
            const videoNode = flowNode(
                `koubo-video-${candidate.id}`,
                `口播视频 ${videoIndex + 1}`,
                candidate.generationStage === "queued"
                    ? "排队中"
                    : candidate.status === "running" && typeof candidate.progress === "number"
                    ? `生成中 · ${Math.round(candidate.progress)}%`
                    : statusLabel(candidate.status),
                "video",
                x,
                y,
                "video",
                workspace.projectId,
                contentStatus(candidate.status),
                candidate.id,
                {
                    assetId: candidate.assetId,
                    url: candidate.url,
                    audioNodeId: candidate.audioNodeId,
                    imageResultId: candidate.imageResultId,
                    progress: candidate.progress,
                    generationStage: candidate.generationStage || (candidate.status === "queued" ? "queued" : null),
                },
                measuredNodeHeights,
            );
            nodes.push(videoNode);
            pairs.push([imageNode.id, videoNode.id]);
            placedRects.push(nodeRect(videoNode.canvas));
            nextVideoY = y + height + nodeGap;
        }
    }

    const byId = new Map([start, ...nodes].map((node) => [node.id, node]));
    const edges = pairs.flatMap(([fromId, toId]) => {
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (!from || !to) return [];
        const connection: CanvasConnection = { id: `${fromId}-${toId}`, fromNodeId: fromId, toNodeId: toId };
        return [{ connection, from: from.canvas, to: to.canvas }];
    });
    return {
        nodes,
        edges,
        startCanvas: start.canvas,
        pendingScriptCanvases,
        pendingScriptY: pendingScriptCanvases[0]?.position.y ?? coreBottom + nodeGap,
    };
}

function layoutTree(nodes: CanvasNodeData[], parentById: ReadonlyMap<string, string>, rootId: string) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const children = new Map<string, CanvasNodeData[]>();
    for (const node of nodes) {
        const parentId = parentById.get(node.id);
        if (!parentId) continue;
        children.set(parentId, [...(children.get(parentId) || []), node]);
    }
    const subtreeHeights = new Map<string, number>();
    const subtreeHeight = (id: string): number => {
        const cached = subtreeHeights.get(id);
        if (cached !== undefined) return cached;
        const node = byId.get(id)!;
        const items = children.get(id) || [];
        const childrenHeight = items.reduce((total, child, index) => total + subtreeHeight(child.id) + (index ? nodeGap : 0), 0);
        const height = Math.max(node.height, childrenHeight);
        subtreeHeights.set(id, height);
        return height;
    };
    const place = (id: string, top: number) => {
        const node = byId.get(id)!;
        const height = subtreeHeight(id);
        const items = children.get(id) || [];
        const childrenHeight = items.reduce((total, child, index) => total + subtreeHeight(child.id) + (index ? nodeGap : 0), 0);
        node.position.y = top + (height - node.height) / 2;
        let childTop = top + (height - childrenHeight) / 2;
        for (const child of items) {
            place(child.id, childTop);
            childTop += subtreeHeight(child.id) + nodeGap;
        }
    };
    place(rootId, 40);
}

function availableY(x: number, desiredY: number, width: number, height: number, placed: NodeRect[]) {
    let y = desiredY;
    while (true) {
        const collisions = placed.filter((item) =>
            x < item.x + item.width + nodeGap
            && x + width + nodeGap > item.x
            && y < item.y + item.height + nodeGap
            && y + height + nodeGap > item.y);
        if (!collisions.length) return y;
        y = Math.max(...collisions.map((item) => item.y + item.height + nodeGap));
    }
}

function nodeRect(node: CanvasNodeData): NodeRect {
    return { x: node.position.x, y: node.position.y, width: node.width, height: node.height };
}

function centerY(node: CanvasNodeData) {
    return node.position.y + node.height / 2;
}

function measuredHeight(heights: Readonly<Record<string, number>>, id: string, fallback: number) {
    const height = heights[id];
    return typeof height === "number" && Number.isFinite(height) ? Math.max(fallback, height) : fallback;
}

function canvasNode(id: string, title: string, x: number, height: number): CanvasNodeData {
    return { id, title, type: CanvasNodeType.Text, position: { x, y: 0 }, width: nodeWidth, height };
}

function flowNode(
    id: string,
    title: string,
    summary: string,
    nodeType: ContentNode["nodeType"],
    x: number,
    y: number,
    kind: KouboFlowNode["kind"],
    projectId: string,
    status: ContentNode["status"],
    sourceId?: string,
    data: Record<string, unknown> = {},
    measuredNodeHeights: Readonly<Record<string, number>> = {},
): KouboFlowNode {
    const now = new Date(0).toISOString();
    const fallbackHeight = nodeType === "tts" ? 176 : nodeType === "image" && data.roleImage === true ? 260 : 224;
    return {
        id,
        kind,
        sourceId,
        canvas: {
            id,
            title,
            type: CanvasNodeType.Text,
            position: { x, y },
            width: nodeWidth,
            height: measuredHeight(measuredNodeHeights, id, fallbackHeight),
        },
        content: {
            id,
            topicId: projectId,
            attemptId: projectId,
            parentId: null,
            nodeType,
            title,
            summary,
            sortOrder: 0,
            data,
            status,
            revision: 1,
            createdBy: "",
            hiddenAt: null,
            createdAt: now,
            updatedAt: now,
        },
    };
}

function statusLabel(status: string) {
    return status === "draft" ? "待生成" : status === "queued" ? "排队中" : status === "running" ? "生成中" : status === "failed" ? "生成失败" : status === "stale" ? "已过期" : "已生成";
}

function audioStatusLabel(audio: KouboAudioNode) {
    if (["queued", "running"].includes(audio.status) && audio.generationStage === "tone_optimizing") return "语气优化";
    if (["queued", "running"].includes(audio.status) && audio.generationStage === "speech_generating") return "语音生成";
    return statusLabel(audio.status);
}

function contentStatus(status: string): ContentNode["status"] {
    return status === "ready" ? "succeeded" : status === "failed" ? "failed" : status === "draft" ? "idle" : "running";
}
