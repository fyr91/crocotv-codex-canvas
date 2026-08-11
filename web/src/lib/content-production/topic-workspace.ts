import type { ContentNodeStatus, ContentRunStatus } from "@/types/content-production";

export type TopicStatusSummary = {
    running: number;
    unread: number;
    attention: number;
    failures: number;
    latestMessage: string;
    latestAt: string | null;
};

type RunLike = { topicId: string; status: ContentRunStatus | ContentNodeStatus; stage: string; updatedAt: string };
type NoticeNodeLike = {
    topicId: string;
    noticeKind?: "success" | "attention" | "failure" | null;
    noticeUnread?: boolean;
    noticeAt?: string | null;
};

const activeRunStates = new Set(["queued", "producer_running", "reviewer_running", "repairing", "running"]);

export function summarizeOwnedTopic(topicId: string, runs: RunLike[], nodes: NoticeNodeLike[]): TopicStatusSummary {
    const topicRuns = runs.filter((run) => run.topicId === topicId);
    const unread = nodes.filter((item) => item.topicId === topicId && item.noticeUnread);
    const latestNotice = [...unread].sort((a, b) => String(b.noticeAt || "").localeCompare(String(a.noticeAt || "")))[0];
    const latestRun = [...topicRuns].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return {
        running: topicRuns.filter((run) => activeRunStates.has(run.status)).length,
        unread: unread.length,
        attention: unread.filter((item) => item.noticeKind === "attention").length,
        failures: unread.filter((item) => item.noticeKind === "failure").length,
        latestMessage: latestNotice
            ? latestNotice.noticeKind === "failure" ? "有生成失败的节点" : latestNotice.noticeKind === "attention" ? "有需要处理的节点" : "有未查看的生成结果"
            : latestRun ? `${latestRun.stage} 正在生成` : "",
        latestAt: latestNotice?.noticeAt || latestRun?.updatedAt || null,
    };
}
