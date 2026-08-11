import { contentStorylineSnapshot } from "./storyline";
import { contentTopicFactorySnapshot } from "./topic-factory";
import type { ContentGenerationRun, ContentNode, ContentRunStatus } from "@/types/content-production";

export type ContentProductionSummary = {
    generating: number;
    reviewing: number;
    repairing: number;
    humanizing: number;
    accepted: number;
    attention: number;
    failed: number;
    total: number;
};

export function contentProductionSummary(nodes: ContentNode[], runs: ContentGenerationRun[]): ContentProductionSummary {
    const runsById = new Map(runs.map((run) => [run.id, run]));
    const current = new Map<string, ContentNode>();
    for (const node of nodes) {
        if (node.hiddenAt) continue;
        const snapshot = contentTopicFactorySnapshot(node) || contentStorylineSnapshot(node);
        if (!snapshot) continue;
        const requestId = typeof node.data.clientRequestId === "string" ? node.data.clientRequestId : "";
        const key = requestId ? `request:${requestId}` : `node:${node.id}`;
        const existing = current.get(key);
        if (!existing || (existing.id.startsWith("optimistic-") && !node.id.startsWith("optimistic-"))) {
            current.set(key, node);
        }
    }

    const summary: ContentProductionSummary = {
        generating: 0,
        reviewing: 0,
        repairing: 0,
        humanizing: 0,
        accepted: 0,
        attention: 0,
        failed: 0,
        total: 0,
    };
    for (const node of current.values()) {
        const snapshot = contentTopicFactorySnapshot(node) || contentStorylineSnapshot(node);
        if (!snapshot) continue;
        const run = runsById.get(snapshot.runId);
        const status = run?.status || snapshot.phase;
        const key = summaryKey(status);
        if (!key) continue;
        summary[key] += 1;
        summary.total += 1;
    }
    return summary;
}

function summaryKey(status: ContentRunStatus | string): keyof Omit<ContentProductionSummary, "total"> | null {
    if (["queued", "generating", "persisting", "producer_running"].includes(status)) return "generating";
    if (["reviewing", "reviewer_running"].includes(status)) return "reviewing";
    if (["revising", "repairing"].includes(status)) return "repairing";
    if (status === "humanizing") return "humanizing";
    if (["ready_pass", "accepted", "succeeded"].includes(status)) return "accepted";
    if (["ready_warning", "needs_owner_attention"].includes(status)) return "attention";
    if (["error", "failed"].includes(status)) return "failed";
    return null;
}
