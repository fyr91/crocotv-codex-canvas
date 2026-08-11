import { App, Button, Modal, Result, Select, Skeleton } from "antd";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { summarizeOwnedTopic } from "@/lib/content-production/topic-workspace";
import { videoWorkflowDefinition } from "@/lib/koubo-video/initialization";
import { topicModuleState } from "@/lib/content-production/content-stage";
import { useContentProductionUiStore } from "@/stores/use-content-production-ui-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ContentWorkflowProject } from "@/types/content-production";
import { useContentNoticeNodesQuery, useContentWorkflowProjectsQuery, useDeleteContentWorkflowProjectMutation, useKouboNoticesQuery, useOwnerContentRunsQuery } from "../use-content-production";
import { useContentNodeNoticeTone } from "../use-content-node-notice-tone";
import { TopicStatusModule } from "./topic-status-module";
import { AddContentProjectModal } from "./add-content-project-modal";
import { KouboProjectCard } from "./koubo-project-card";
import { CourseFlowProjectCard } from "./course-flow-project-card";

type SortMode = "recent" | "created" | "status";

export function TopicWorkspaceGrid() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const ownerId = useUserStore((state) => state.profile?.id || "");
    const notificationMode = useContentProductionUiStore((state) => state.notificationMode);
    const setNotificationMode = useContentProductionUiStore((state) => state.setNotificationMode);
    const [sortMode, setSortMode] = useState<SortMode>("recent");
    const [addOpen, setAddOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ContentWorkflowProject | null>(null);
    const projects = useContentWorkflowProjectsQuery();
    const runs = useOwnerContentRunsQuery(ownerId);
    const noticeNodes = useContentNoticeNodesQuery(ownerId);
    const kouboNotices = useKouboNoticesQuery(ownerId);
    const deleteProject = useDeleteContentWorkflowProjectMutation();
    const summaries = useMemo(() => new Map((projects.data || []).flatMap((project) => project.workflowType === "topic_content_v1" ? [[project.topicId, summarizeOwnedTopic(project.topicId, runs.data || [], noticeNodes.data || [])] as const] : [])), [noticeNodes.data, projects.data, runs.data]);
    const ordered = useMemo(() => [...(projects.data || [])].sort((a, b) => {
        if (sortMode === "created") return b.createdAt.localeCompare(a.createdAt);
        if (sortMode === "status") {
            const aPriority = a.workflowType === "topic_content_v1" ? topicModuleState({ ...(summaries.get(a.topicId) || emptySummary), completed: false }).priority : 0;
            const bPriority = b.workflowType === "topic_content_v1" ? topicModuleState({ ...(summaries.get(b.topicId) || emptySummary), completed: false }).priority : 0;
            return bPriority - aPriority || b.updatedAt.localeCompare(a.updatedAt);
        }
        return b.updatedAt.localeCompare(a.updatedAt);
    }), [projects.data, sortMode, summaries]);
    useContentNodeNoticeTone([...(noticeNodes.data || []), ...(kouboNotices.data || [])], notificationMode, noticeNodes.isFetched && kouboNotices.isFetched);

    if (projects.isLoading || runs.isLoading || noticeNodes.isLoading || kouboNotices.isLoading) return <Skeleton active />;
    if (projects.isError) return <Result status="error" title="项目列表读取失败" extra={<Button onClick={() => void projects.refetch()}>重新加载</Button>} />;

    return (
        <section>
            <div className="mb-5 flex items-center justify-end gap-3">
                <Select
                    value={notificationMode}
                    onChange={setNotificationMode}
                    className="w-28"
                    options={[
                        { value: "all", label: "提醒音开启" },
                        { value: "mute", label: "提醒音静音" },
                    ]}
                />
                <Select<SortMode>
                    value={sortMode}
                    onChange={setSortMode}
                    className="w-36"
                    options={[
                        { value: "recent", label: "最近更新" },
                        { value: "created", label: "创建时间" },
                        { value: "status", label: "需要处理优先" },
                    ]}
                />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <button type="button" onClick={() => setAddOpen(true)} className="flex min-h-48 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-[var(--surface-raised)] p-4 text-center shadow-[var(--elevation-card)] transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--elevation-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Plus className="size-6" />
                    <span className="mt-3 font-semibold">添加项目</span>
                    <span className="mt-1 text-sm text-muted-foreground">选择内容生产流程</span>
                </button>
                {ordered.map((project) => project.workflowType === "topic_content_v1" ? (
                    <TopicStatusModule key={project.id} topic={project.topic} summary={summaries.get(project.topicId) || emptySummary} onOpen={() => navigate(`/content/topics/${project.topicId}`)} onDelete={() => setDeleteTarget(project)} />
                ) : project.workflowType === "course-flow" ? (
                    <CourseFlowProjectCard key={project.id} projectId={project.id} title={project.title} updatedAt={project.updatedAt} onOpen={() => navigate(`/content/course-flow/${project.id}`)} onDelete={() => setDeleteTarget(project)} />
                ) : (
                    <KouboProjectCard key={project.id} projectId={project.id} workflowType={project.workflowType} title={project.title} updatedAt={project.updatedAt} onOpen={() => navigate(`/content/${videoWorkflowDefinition(project.workflowType).routeSegment}/${project.id}`)} onDelete={() => setDeleteTarget(project)} />
                ))}
            </div>
            <AddContentProjectModal open={addOpen} onClose={() => setAddOpen(false)} onOpened={(path) => navigate(path)} />
            <Modal
                title="删除项目？"
                open={Boolean(deleteTarget)}
                centered
                onCancel={() => !deleteProject.isPending && setDeleteTarget(null)}
                footer={
                    <>
                        <Button disabled={deleteProject.isPending} onClick={() => setDeleteTarget(null)}>取消</Button>
                        <Button
                            danger
                            type="primary"
                            loading={deleteProject.isPending}
                            onClick={() => void (async () => {
                                if (!deleteTarget) return;
                                try {
                                    await deleteProject.mutateAsync(deleteTarget.id);
                                    setDeleteTarget(null);
                                    message.success("项目已删除");
                                } catch (error) {
                                    message.error(error instanceof Error ? error.message : "项目删除失败，请稍后重试");
                                }
                            })()}
                        >
                            删除
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-stone-500">
                    {deleteTarget?.workflowType === "topic_content_v1"
                        ? deleteTarget.topic.status === "completed"
                            ? "只会从我的工作台移除，已完成内容仍保留在“已完成”中。"
                            : "Topic 会退回公共 Topic 池，当前 Attempt 会保留用于统计。"
                        : "项目内的文案、分段和生成记录也会一起移除。"}
                </p>
            </Modal>
        </section>
    );
}

const emptySummary = { running: 0, unread: 0, attention: 0, failures: 0, latestMessage: "", latestAt: null };
