import { topicModuleState } from "@/lib/content-production/content-stage";
import type { TopicStatusSummary } from "@/lib/content-production/topic-workspace";
import type { ContentTopic } from "@/types/content-production";
import { cn } from "@/lib/utils";
import { WorkspaceProjectActivity, WorkspaceProjectHeader, WorkspaceProjectMetrics } from "./workspace-project-card-parts";
import { WorkspaceProjectCard } from "./workspace-project-card";

const stateStyles = {
    failure: "border-destructive/60",
    attention: "border-amber-400 dark:border-amber-700",
    unread: "border-primary ring-1 ring-primary/20",
    running: "border-border",
    completed: "border-emerald-300 dark:border-emerald-800",
    idle: "border-border",
} as const;

export function TopicStatusModule({ topic, summary, onOpen, onDelete }: { topic: ContentTopic; summary: TopicStatusSummary; onOpen: () => void; onDelete: () => void }) {
    const state = topicModuleState({ ...summary, completed: topic.status === "completed" });
    return (
        <WorkspaceProjectCard openLabel={`打开 ${topic.title}`} time={summary.latestAt || topic.updatedAt} className={cn("group cursor-pointer", stateStyles[state.kind])} onOpen={onOpen} onDelete={onDelete}>
            <WorkspaceProjectHeader title={topic.title} unreadClassName={summary.unread ? summary.failures ? "bg-red-500" : summary.attention ? "bg-amber-500" : "bg-blue-500" : undefined} />

            <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{topic.originalTopic}</p>
            <WorkspaceProjectMetrics items={[{ label: "运行中", value: summary.running }, { label: "需处理", value: summary.attention }, { label: "失败", value: summary.failures }]} />
            <WorkspaceProjectActivity message={summary.latestMessage || "暂无新的生成动态"} />
        </WorkspaceProjectCard>
    );
}
