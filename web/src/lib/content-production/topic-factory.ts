import type {
    ContentNode,
    ContentTopicFactoryPhase,
    ContentTopicFactorySnapshot,
} from "@/types/content-production";

export type TopicFactorySummary = {
    readyPass: number;
    readyWarning: number;
    reviewing: number;
    generating: number;
    revising: number;
    humanizing: number;
    failed: number;
};

const phases = new Set<ContentTopicFactoryPhase>([
    "queued",
    "generating",
    "persisting",
    "reviewing",
    "revising",
    "humanizing",
    "ready_pass",
    "ready_warning",
    "error",
    "canceled",
]);

const optimisticLaneStrategies = [
    "从目标受众正在经历的具体处境和现实痛点切入",
    "从利益冲突、立场对撞或艰难选择切入",
    "从反常识结论、认知误区或关键信息差切入",
    "从人物选择、行为变化及其意外结果切入",
    "从趋势变化、系统性影响及未来利益后果切入",
];

export function createOptimisticTopicFactoryNodes(input: {
    topicId: string;
    attemptId: string;
    rootNodeId: string;
    createdBy: string;
    batchId: string;
    createdAt: string;
}): ContentNode[] {
    return optimisticLaneStrategies.map((strategy, index) => {
        const laneNumber = index + 1;
        return {
            id: `optimistic-topic-factory:${input.batchId}:${laneNumber}`,
            topicId: input.topicId,
            attemptId: input.attemptId,
            parentId: input.rootNodeId,
            nodeType: "angle",
            title: `选题分支 ${laneNumber}`,
            summary: "",
            sortOrder: index,
            data: {
                topicFactory: {
                    version: 2,
                    batchId: `optimistic:${input.batchId}`,
                    laneNumber,
                    laneStrategy: strategy,
                    phase: "queued",
                    reviewCycle: 1,
                    runId: `optimistic-topic-factory-run:${input.batchId}:${laneNumber}`,
                    latestGeminiInteractionId: null,
                    candidate: null,
                    citations: [],
                    review: null,
                    score: null,
                    warning: null,
                    error: null,
                },
            },
            status: "running",
            revision: 1,
            createdBy: input.createdBy,
            hiddenAt: null,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
        };
    });
}

export function mergeOptimisticTopicFactoryNodes(serverNodes: ContentNode[], optimisticNodes: ContentNode[]) {
    if (!optimisticNodes.length) return serverNodes;
    const realLanes = new Set(serverNodes.flatMap((node) => {
        if (node.hiddenAt || !node.parentId || node.id.startsWith("optimistic-topic-factory:")) return [];
        const snapshot = contentTopicFactorySnapshot(node);
        return snapshot ? [`${node.parentId}:${snapshot.laneNumber}`] : [];
    }));
    return [
        ...serverNodes,
        ...optimisticNodes.filter((node) => {
            const snapshot = contentTopicFactorySnapshot(node);
            return snapshot && !realLanes.has(`${node.parentId}:${snapshot.laneNumber}`);
        }),
    ];
}

export async function runOptimisticTopicFactoryStart<T>(input: {
    nodes: ContentNode[];
    publish: (nodes: ContentNode[]) => void;
    save: () => Promise<void>;
    start: () => Promise<T>;
}) {
    input.publish(input.nodes);
    try {
        await input.save();
        return await input.start();
    } catch (error) {
        const message = error instanceof Error ? error.message : "选题任务启动失败";
        const failedAt = new Date().toISOString();
        input.publish(input.nodes.map((node) => ({
            ...node,
            summary: message,
            status: "failed",
            noticeKind: "failure",
            noticeUnread: true,
            noticeAt: failedAt,
            updatedAt: failedAt,
            data: {
                ...node.data,
                topicFactory: {
                    ...(node.data.topicFactory as Record<string, unknown>),
                    phase: "error",
                    error: message,
                },
            },
        })));
        throw error;
    }
}

export function contentTopicFactorySnapshot(node: ContentNode | null | undefined): ContentTopicFactorySnapshot | null {
    const value = node?.data.topicFactory;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const snapshot = value as Partial<ContentTopicFactorySnapshot>;
    if (
        typeof snapshot.batchId !== "string"
        || typeof snapshot.laneNumber !== "number"
        || typeof snapshot.runId !== "string"
        || typeof snapshot.phase !== "string"
        || !phases.has(snapshot.phase as ContentTopicFactoryPhase)
    ) return null;
    if ((value as Record<string, unknown>).version !== 2) return null;
    const review = objectRecord(snapshot.review) as ContentTopicFactorySnapshot["review"];
    return {
        batchId: snapshot.batchId,
        laneNumber: snapshot.laneNumber,
        laneStrategy: typeof snapshot.laneStrategy === "string" ? snapshot.laneStrategy : "",
        phase: snapshot.phase as ContentTopicFactoryPhase,
        reviewCycle: typeof snapshot.reviewCycle === "number" ? snapshot.reviewCycle : 1,
        runId: snapshot.runId,
        latestGeminiInteractionId: typeof snapshot.latestGeminiInteractionId === "string" ? snapshot.latestGeminiInteractionId : null,
        candidate: snapshot.candidate || null,
        citations: Array.isArray(snapshot.citations) ? snapshot.citations : [],
        review: review || null,
        score: typeof snapshot.score === "number" ? snapshot.score : null,
        warning: typeof snapshot.warning === "string" ? snapshot.warning : null,
        error: typeof snapshot.error === "string" ? snapshot.error : null,
    };
}

function objectRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export function topicFactorySummary(snapshots: ContentTopicFactorySnapshot[]): TopicFactorySummary {
    return snapshots.reduce<TopicFactorySummary>((summary, snapshot) => {
        if (snapshot.phase === "ready_pass") summary.readyPass += 1;
        else if (snapshot.phase === "ready_warning") summary.readyWarning += 1;
        else if (snapshot.phase === "reviewing") summary.reviewing += 1;
        else if (["queued", "generating", "persisting"].includes(snapshot.phase)) summary.generating += 1;
        else if (snapshot.phase === "revising") summary.revising += 1;
        else if (snapshot.phase === "humanizing") summary.humanizing += 1;
        else if (snapshot.phase === "error") summary.failed += 1;
        return summary;
    }, { readyPass: 0, readyWarning: 0, reviewing: 0, generating: 0, revising: 0, humanizing: 0, failed: 0 });
}

export function canExpandTopicAngle(node: ContentNode) {
    const snapshot = contentTopicFactorySnapshot(node);
    return node.nodeType === "angle"
        && Boolean(snapshot?.candidate);
}

export function topicFactoryScoreColor(score: number) {
    if (score > 95) return "green" as const;
    if (score >= 90) return "blue" as const;
    if (score >= 85) return "gold" as const;
    return undefined;
}

export function topicFactoryPhaseLabel(phase: ContentTopicFactoryPhase) {
    const labels: Record<ContentTopicFactoryPhase, string> = {
        queued: "排队中",
        generating: "正在生成",
        persisting: "正在保存",
        reviewing: "正在验证",
        revising: "根据反馈调整",
        humanizing: "正在去 AI 化",
        ready_pass: "已通过",
        ready_warning: "已完成，有质量提示",
        error: "生成失败",
        canceled: "已停止",
    };
    return labels[phase];
}
