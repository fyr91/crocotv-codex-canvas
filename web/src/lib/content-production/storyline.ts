import type {
    ContentNode,
    ContentStorylineCandidate,
    ContentStorylinePhase,
    ContentStorylineSnapshot,
} from "@/types/content-production";

const phases = new Set<ContentStorylinePhase>([
    "producer_running",
    "reviewer_running",
    "repairing",
    "accepted",
    "needs_owner_attention",
    "failed",
]);

export function contentStorylineSnapshot(node: ContentNode | null | undefined): ContentStorylineSnapshot | null {
    const value = node?.data.storylineWorkflow;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const snapshot = value as Partial<ContentStorylineSnapshot>;
    if (
        node?.nodeType !== "storyline"
        || !["generate", "optimize", "rebuild"].includes(String(snapshot.operation))
        || !phases.has(snapshot.phase as ContentStorylinePhase)
        || typeof snapshot.runId !== "string"
    ) return null;
    const candidate = snapshot.candidate && typeof snapshot.candidate === "object"
        && snapshot.candidate.format === "crocotv.storyline"
        && snapshot.candidate.version === 2
        ? snapshot.candidate as ContentStorylineCandidate
        : null;
    return {
        operation: snapshot.operation as ContentStorylineSnapshot["operation"],
        phase: snapshot.phase as ContentStorylinePhase,
        round: typeof snapshot.round === "number" ? snapshot.round : 1,
        runId: snapshot.runId,
        sourceNodeId: typeof snapshot.sourceNodeId === "string" ? snapshot.sourceNodeId : "",
        upstreamAngleNodeId: typeof snapshot.upstreamAngleNodeId === "string" ? snapshot.upstreamAngleNodeId : "",
        parentInteractionId: typeof snapshot.parentInteractionId === "string" ? snapshot.parentInteractionId : null,
        latestGeminiInteractionId: typeof snapshot.latestGeminiInteractionId === "string" ? snapshot.latestGeminiInteractionId : null,
        optimizationDirection: typeof snapshot.optimizationDirection === "string" ? snapshot.optimizationDirection : null,
        candidate,
        review: snapshot.review && typeof snapshot.review === "object"
            ? snapshot.review as ContentStorylineSnapshot["review"]
            : null,
        lastError: typeof snapshot.lastError === "string" ? snapshot.lastError : null,
    };
}

export function validateContentStorylineCandidate(candidate: ContentStorylineCandidate | null | undefined) {
    if (!candidate) return ["故事线内容尚未生成"];
    const issues: string[] = [];
    if (candidate.format !== "crocotv.storyline" || candidate.version !== 2) issues.push("故事线版本必须为 V2");
    if (!candidate.positioning?.core_narrative_anchor?.trim()) issues.push("核心爆点不能为空");
    if (!candidate.positioning?.emotional_value?.trim()) issues.push("情绪价值不能为空");
    if (!Array.isArray(candidate.positioning?.emotional_curve) || candidate.positioning.emotional_curve.filter(nonEmpty).length < 3) {
        issues.push("情绪曲线至少需要 3 个阶段");
    }
    if (!Array.isArray(candidate.positioning?.opening_visual_beats) || candidate.positioning.opening_visual_beats.length < 2) {
        issues.push("前三秒至少需要 2 个视觉节拍");
    }
    if (!candidate.five_act?.setup || Object.values(candidate.five_act.setup).some((value) => !nonEmpty(value))) {
        issues.push("Setup 的冲突、动作和悬念必须完整");
    }
    if (!Array.isArray(candidate.five_act?.escalation?.layers) || candidate.five_act.escalation.layers.length < 2) {
        issues.push("Escalation 至少需要 2 层压力加码");
    }
    if (!candidate.five_act?.reveal || Object.values(candidate.five_act.reveal).some((value) => !nonEmpty(value))) {
        issues.push("Reveal 的真相、合理性和爆点关系必须完整");
    }
    if (!candidate.five_act?.payoff || Object.values(candidate.five_act.payoff).some((value) => !nonEmpty(value))) {
        issues.push("Payoff 的结果、情绪释放和观众价值必须完整");
    }
    if (!candidate.five_act?.cta_bridge || Object.values(candidate.five_act.cta_bridge).some((value) => !nonEmpty(value))) {
        issues.push("CTA_Bridge 的过渡、目标行为和动机必须完整");
    }
    return issues;
}

export function createOptimisticStorylineNode(input: {
    operation: "generate" | "optimize" | "rebuild";
    sourceNode: ContentNode;
    requestId: string;
    createdAt: string;
    direction?: string;
}): ContentNode {
    const sourceSnapshot = contentStorylineSnapshot(input.sourceNode);
    const rebuild = input.operation === "rebuild";
    const parentId = rebuild ? input.sourceNode.parentId : input.sourceNode.id;
    const interactionId = input.operation === "generate"
        ? stringAt(input.sourceNode.data, ["topicFactory", "latestGeminiInteractionId"])
        : input.operation === "optimize" ? sourceSnapshot?.latestGeminiInteractionId || null : null;
    const workflow: ContentStorylineSnapshot = {
        operation: input.operation,
        phase: "producer_running",
        round: 1,
        runId: `optimistic-storyline-run:${input.requestId}`,
        sourceNodeId: input.sourceNode.id,
        upstreamAngleNodeId: input.operation === "generate"
            ? input.sourceNode.id
            : sourceSnapshot?.upstreamAngleNodeId || input.sourceNode.parentId || "",
        parentInteractionId: interactionId,
        latestGeminiInteractionId: null,
        optimizationDirection: input.operation === "optimize" ? input.direction?.trim() || null : null,
        candidate: null,
        review: null,
        lastError: null,
    };
    return {
        ...(rebuild ? input.sourceNode : {
            id: `optimistic-storyline:${input.requestId}`,
            topicId: input.sourceNode.topicId,
            attemptId: input.sourceNode.attemptId,
            parentId,
            nodeType: "storyline" as const,
            sortOrder: 0,
            revision: 1,
            createdBy: input.sourceNode.createdBy,
            hiddenAt: null,
            createdAt: input.createdAt,
        }),
        id: rebuild ? input.sourceNode.id : `optimistic-storyline:${input.requestId}`,
        parentId,
        title: input.operation === "optimize" ? "故事线优化中" : "故事线",
        summary: input.operation === "rebuild" ? "正在重构故事线" : "正在生成故事线",
        data: {
            ...(rebuild ? input.sourceNode.data : {}),
            clientRequestId: input.requestId,
            stage: "storyline_script",
            runId: workflow.runId,
            storylineWorkflow: workflow,
        },
        status: "running",
        updatedAt: input.createdAt,
    };
}

export function mergeOptimisticStorylineNode(serverNodes: ContentNode[], optimisticNode: ContentNode | null) {
    if (!optimisticNode) return serverNodes;
    const clientRequestId = optimisticNode.data.clientRequestId;
    if (serverNodes.some((node) => node.data.clientRequestId === clientRequestId)) return serverNodes;
    const snapshot = contentStorylineSnapshot(optimisticNode);
    if (snapshot?.operation !== "rebuild") return [...serverNodes, optimisticNode];

    const descendantIds = new Set<string>();
    const visit = (parentId: string) => {
        for (const node of serverNodes) {
            if (node.parentId !== parentId || descendantIds.has(node.id)) continue;
            descendantIds.add(node.id);
            visit(node.id);
        }
    };
    visit(optimisticNode.id);
    return serverNodes
        .filter((node) => !descendantIds.has(node.id))
        .map((node) => node.id === optimisticNode.id ? optimisticNode : node);
}

export async function runOptimisticStorylineStart<T>(input: {
    node: ContentNode;
    publish: (node: ContentNode) => void;
    prepare: () => Promise<ContentNode>;
    start: (sourceNode: ContentNode) => Promise<T>;
}) {
    input.publish(input.node);
    try {
        return await input.start(await input.prepare());
    } catch (error) {
        const message = error instanceof Error ? error.message : "故事线任务启动失败";
        const failedAt = new Date().toISOString();
        const snapshot = contentStorylineSnapshot(input.node);
        input.publish({
            ...input.node,
            summary: message,
            status: "failed",
            noticeKind: "failure",
            noticeUnread: true,
            noticeAt: failedAt,
            updatedAt: failedAt,
            data: {
                ...input.node.data,
                storylineWorkflow: {
                    ...(snapshot || {}),
                    phase: "failed",
                    lastError: message,
                },
            },
        });
        throw error;
    }
}

export function createStorylineSaveQueue(save: (candidate: ContentStorylineCandidate) => Promise<unknown>) {
    let tail: Promise<unknown> = Promise.resolve();
    return {
        enqueue(candidate: ContentStorylineCandidate) {
            const task = tail.catch(() => undefined).then(() => save(candidate));
            tail = task;
            return task;
        },
        flush() {
            return tail;
        },
    };
}

export function storylineCandidatePatch(
    node: ContentNode,
    candidate: ContentStorylineCandidate,
): Pick<ContentNode, "title" | "summary" | "data"> {
    const snapshot = contentStorylineSnapshot(node);
    if (!snapshot) throw new Error("当前节点不是 Storyline V2");
    const anchor = candidate.positioning.core_narrative_anchor.trim();
    return {
        title: anchor || node.title,
        summary: anchor || node.summary,
        data: {
            ...node.data,
            storylineWorkflow: {
                ...snapshot,
                candidate,
            },
        },
    };
}

function nonEmpty(value: unknown) {
    return typeof value === "string" && Boolean(value.trim());
}

function stringAt(value: Record<string, unknown>, path: string[]): string | null {
    let current: unknown = value;
    for (const key of path) {
        if (!current || typeof current !== "object" || Array.isArray(current)) return null;
        current = (current as Record<string, unknown>)[key];
    }
    return typeof current === "string" && current.trim() ? current : null;
}
