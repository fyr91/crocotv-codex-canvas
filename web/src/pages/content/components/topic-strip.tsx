import { Button } from "antd";
import { ChevronLeft, LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";

import { topicModuleState } from "@/lib/content-production/content-stage";
import type { TopicStatusSummary } from "@/lib/content-production/topic-workspace";
import type { ContentTopic } from "@/types/content-production";
import { cn } from "@/lib/utils";

export function TopicStrip({ topics, summaries, currentTopicId, status, actions, onOpen, onOverview }: { topics: ContentTopic[]; summaries: Map<string, TopicStatusSummary>; currentTopicId: string; status?: ReactNode; actions?: ReactNode; onOpen: (topicId: string) => void; onOverview: () => void }) {
    return (
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-[var(--surface-raised)] px-3">
            <Button type="text" icon={<ChevronLeft className="size-4" />} onClick={onOverview}>总览</Button>
            <div className="h-5 w-px bg-border" />
            <div className="hide-scrollbar flex min-w-28 flex-1 gap-1 overflow-x-auto">
                {topics.map((topic) => {
                    const summary = summaries.get(topic.id) || { running: 0, unread: 0, attention: 0, failures: 0, latestMessage: "", latestAt: null };
                    const state = topicModuleState({ ...summary, completed: topic.status === "completed" });
                    return (
                        <button
                            key={topic.id}
                            type="button"
                            className={cn("flex h-9 max-w-56 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition hover:bg-accent", topic.id === currentTopicId && "bg-accent font-medium")}
                            onClick={() => onOpen(topic.id)}
                        >
                            <LayoutGrid className="size-3.5 shrink-0" />
                            <span className="truncate">{topic.title}</span>
                            {summary.unread ? <span className={cn("size-2 rounded-full", state.kind === "failure" ? "bg-red-500" : state.kind === "attention" ? "bg-amber-500" : "bg-blue-500")} /> : null}
                        </button>
                    );
                })}
            </div>
            {status}
            {actions ? <div className="hide-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto">{actions}</div> : null}
        </div>
    );
}
