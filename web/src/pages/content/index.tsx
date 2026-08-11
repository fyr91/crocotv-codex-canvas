import { Button, Empty, Tag } from "antd";
import { BarChart3, CheckCircle2, Inbox, LayoutGrid, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useContentProductionUiStore, type ContentHubTab } from "@/stores/use-content-production-ui-store";
import { useUserStore } from "@/stores/use-user-store";
import { LibraryPage } from "@/components/layout/page-shell";
import { TopicPool } from "./components/topic-pool";
import { TopicWorkspaceGrid } from "./components/topic-workspace-grid";
import { ContentStatistics } from "./components/content-statistics";
import { useContentProductionRealtime, useContentTopicsQuery } from "./use-content-production";

const tabs = [
    { value: "workspace", label: "我的工作台", icon: <LayoutGrid className="size-4" /> },
    { value: "pool", label: "公共 Topic 池", icon: <Inbox className="size-4" /> },
    { value: "completed", label: "已完成", icon: <CheckCircle2 className="size-4" /> },
    { value: "statistics", label: "数据统计", icon: <BarChart3 className="size-4" /> },
] satisfies Array<{ value: ContentHubTab; label: string; icon: React.ReactNode }>;

export default function ContentPage() {
    const navigate = useNavigate();
    const profile = useUserStore((state) => state.profile);
    const activeTab = useContentProductionUiStore((state) => state.activeTab);
    const setActiveTab = useContentProductionUiStore((state) => state.setActiveTab);
    const completed = useContentTopicsQuery({ status: "completed", ownerId: profile?.id });
    useContentProductionRealtime(Boolean(profile));

    return (
        <LibraryPage title="内容生产中心" description="管理 Topic 的领取、生产进度与交付结果。" contentClassName="gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <nav className="flex flex-wrap gap-2" aria-label="内容生产中心栏目">
                    {tabs.map(({ value, label, icon }) => {
                        const active = activeTab === value;
                        return (
                            <Tag.CheckableTag
                                key={value}
                                checked={active}
                                className={cn("filter-chip content-hub-tab !inline-flex min-h-8 items-center justify-center !py-0 [&>span]:inline-flex [&>span]:items-center [&>span]:justify-center", active && "is-active")}
                                onChange={() => setActiveTab(value)}
                            >
                                <span className="inline-flex items-center justify-center gap-2">
                                    {icon}
                                    <span>{label}</span>
                                </span>
                            </Tag.CheckableTag>
                        );
                    })}
                </nav>
                {profile?.role === "superuser" ? (
                    <Button icon={<Settings2 className="size-4" />} onClick={() => navigate("/content/settings")}>
                        AI 编排配置
                    </Button>
                ) : null}
            </div>

            {activeTab === "pool" ? <TopicPool /> : null}
            {activeTab === "workspace" ? <TopicWorkspaceGrid /> : null}
            {activeTab === "completed" ? (
                completed.data?.length ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {completed.data.map((topic) => (
                            <article key={topic.id} className="rounded-2xl border border-stone-200 p-5 dark:border-stone-800">
                                <h3 className="font-semibold">{topic.title}</h3>
                                <p className="mt-2 text-sm text-stone-500">
                                    Completion v{topic.latestCompletionVersion}
                                    {topic.hasPostCompletionChanges ? " · 存在完成后的新修改" : ""}
                                </p>
                            </article>
                        ))}
                    </div>
                ) : !completed.isLoading ? (
                    <Empty description="还没有已完成 Topic" />
                ) : null
            ) : null}
            {activeTab === "statistics" ? <ContentStatistics /> : null}
        </LibraryPage>
    );
}
