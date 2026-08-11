import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Input, Table, Tag } from "antd";
import { CircleCheck, CircleDashed, CircleX, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LibraryPage } from "@/components/layout/page-shell";
import { cn } from "@/lib/utils";
import { listContentFactoryTasks } from "@/services/api/content-factory";
import type { FactoryStatus, FactoryTask } from "@/types/content-factory";
import { CreateVideoModal } from "./components/create-video-modal";

const filters: Array<{ value: "all" | FactoryStatus; label: string }> = [
    { value: "all", label: "全部" }, { value: "automating", label: "自动运行" }, { value: "partial_failure", label: "失败" }, { value: "ready", label: "待确认" }, { value: "completed", label: "已完成" },
];

export default function ContentFactoryPage() {
    const navigate = useNavigate();
    const query = useQuery({ queryKey: ["content-factory-tasks"], queryFn: listContentFactoryTasks, refetchInterval: 5_000 });
    const [createOpen, setCreateOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
    const data = useMemo(() => (query.data || []).filter((task) => (!search.trim() || `${task.title}${task.roleName}`.toLowerCase().includes(search.trim().toLowerCase())) && matchesFilter(task.status, filter)), [filter, query.data, search]);
    const summary = useMemo(() => ({ all: query.data?.length || 0, running: query.data?.filter((item) => ["automating", "exporting"].includes(item.status)).length || 0, failed: query.data?.filter((item) => ["partial_failure", "failed"].includes(item.status)).length || 0, completed: query.data?.filter((item) => item.status === "completed").length || 0 }), [query.data]);
    return (
        <LibraryPage title="内容工厂实验室" description="从分段文案到音频、画面与成片的自动化视频生产。" contentClassName="gap-5 pb-10">
            <div className="grid gap-3 sm:grid-cols-4">
                {[{ label: "全部任务", value: summary.all }, { label: "自动运行", value: summary.running }, { label: "需要处理", value: summary.failed }, { label: "已完成", value: summary.completed }].map((item) => <div key={item.label} className="rounded-2xl border border-border bg-[var(--surface-raised)] px-5 py-4"><div className="text-xs text-muted-foreground">{item.label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</div></div>)}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Input prefix={<Search className="size-4" />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务或角色" allowClear className="max-w-64" />
                    <nav className="flex flex-wrap gap-1" aria-label="任务状态筛选">{filters.map((item) => <Tag.CheckableTag key={item.value} checked={filter === item.value} className={cn("filter-chip", filter === item.value && "is-active")} onChange={() => setFilter(item.value)}>{item.label}</Tag.CheckableTag>)}</nav>
                </div>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>添加视频</Button>
            </div>
            <div className="min-h-0 overflow-x-auto rounded-2xl border border-border bg-[var(--surface-raised)]">
                <Table<FactoryTask> rowKey="id" loading={query.isLoading} dataSource={data} pagination={{ pageSize: 10 }} locale={{ emptyText: <Empty description={query.isError ? "任务读取失败，请刷新重试" : "还没有视频任务"} /> }} onRow={(record) => ({ onClick: () => navigate(`/content-factory/${record.id}`), className: "cursor-pointer" })} columns={[
                    { title: "内容任务", dataIndex: "title", width: 310, render: (_, item) => <div><div className="font-medium">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">更新于 {new Date(item.updatedAt).toLocaleString()}</div></div> },
                    { title: "角色", dataIndex: "roleName", width: 150 },
                    { title: "流程进度", width: 280, render: (_, item) => <div><div className="flex items-center gap-2 text-sm"><span>{stageLabel(item.currentStage)}</span><span className="text-muted-foreground">{item.readyCount} / {item.sectionCount} 段</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"><div className="h-full bg-[var(--action-primary)]" style={{ width: `${item.sectionCount ? item.readyCount / item.sectionCount * 100 : 0}%` }} /></div></div> },
                    { title: "自动化状态", width: 190, render: (_, item) => <StatusLabel status={item.status} /> },
                    { title: "结果", width: 130, render: (_, item) => <Tag color={item.status === "completed" ? "success" : item.status === "ready" ? "processing" : ["failed", "partial_failure"].includes(item.status) ? "error" : "default"}>{resultLabel(item.status)}</Tag> },
                ]} />
            </div>
            <CreateVideoModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </LibraryPage>
    );
}

function StatusLabel({ status }: { status: FactoryStatus }) {
    if (["failed", "partial_failure"].includes(status)) return <span className="inline-flex items-center gap-2 text-[var(--status-danger-foreground)]"><CircleX className="size-4" />生成失败</span>;
    if (["ready", "completed"].includes(status)) return <span className="inline-flex items-center gap-2 text-[var(--status-success-foreground)]"><CircleCheck className="size-4" />{status === "ready" ? "等待确认" : "已完成"}</span>;
    return <span className="inline-flex items-center gap-2"><CircleDashed className="size-4 animate-spin" />{status === "draft" ? "等待确认文案" : status === "stale" ? "内容有变更" : status === "exporting" ? "正在导出" : "自动生成中"}</span>;
}
function stageLabel(stage: FactoryTask["currentStage"]) { return ({ script: "文案", audio: "音频", visual_prompt: "画面提示词", image: "画面", video: "视频", export: "导出" } as const)[stage]; }
function resultLabel(status: FactoryStatus) { return status === "completed" ? "成功" : status === "ready" ? "可确认" : ["failed", "partial_failure"].includes(status) ? "失败" : status === "draft" ? "待开始" : "进行中"; }
function matchesFilter(status: FactoryStatus, filter: (typeof filters)[number]["value"]) { return filter === "all" || filter === "partial_failure" && ["partial_failure", "failed"].includes(status) || status === filter; }
