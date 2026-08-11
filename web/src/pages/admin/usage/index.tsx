import { App, Card, DatePicker, Segmented, Select, Table } from "antd";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { jobColumns } from "@/pages/usage";
import { getAdminUsage, type AdminUsageData, type UsageJob, type UsageUserSummary } from "@/services/api/usage";
import { AdminPage } from "@/components/layout/page-shell";
import { MetricCard } from "@/components/ui/metric-card";

dayjs.extend(isoWeek);

type PeriodMode = "week" | "month";
const UsageCharts = lazy(() => import("./components/usage-charts").then((module) => ({ default: module.UsageCharts })));

const emptyData: AdminUsageData = {
    summary: {},
    trend: [],
    users: [],
    jobs: [],
    analytics: { categories: { text: 0, image: 0, video: 0, audio: 0 }, users: [] },
};

export default function AdminUsagePage() {
    const { message } = App.useApp();
    const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
    const [period, setPeriod] = useState(dayjs());
    const [selectedUser, setSelectedUser] = useState("");
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AdminUsageData>(emptyData);
    const range = useMemo(() => {
        const from = periodMode === "week" ? period.startOf("isoWeek") : period.startOf("month");
        const to = periodMode === "week" ? from.add(1, "week") : from.add(1, "month");
        return { from: from.toDate(), to: to.toDate() };
    }, [period, periodMode]);

    useEffect(() => {
        setLoading(true);
        void getAdminUsage(range)
            .then(setData)
            .catch((error) => message.error(error instanceof Error ? error.message : "统计加载失败"))
            .finally(() => setLoading(false));
    }, [range]);

    const columns = [
        { title: "用户", render: (_: unknown, row: UsageUserSummary) => row.display_name || row.username },
        { title: "任务", dataIndex: "totalJobs" },
        { title: "成功率", dataIndex: "successRate", render: (value: number) => `${((value || 0) * 100).toFixed(1)}%` },
        { title: "图片", dataIndex: "imageCount" },
        { title: "视频 Token", dataIndex: "videoTokens" },
        { title: "语音字符数", dataIndex: "speechCharacters", render: (value: number) => Number(value || 0).toLocaleString() },
        { title: "音乐", dataIndex: "musicTracks" },
        { title: "预估费用（参考）", dataIndex: "estimatedCost", render: (value: number) => `¥${Number(value || 0).toFixed(4)}` },
    ];
    const user = data.users.find((item) => item.id === selectedUser);
    const summary = user || data.summary;
    const jobs = selectedUser ? data.jobs.filter((job) => job.user_id === selectedUser) : data.jobs;

    return (
        <AdminPage
            title={user ? `${user.display_name || user.username} · 使用情况` : "全局使用看板"}
            description="查看整体及个人用量；全部费用均为参考价格估算。"
            actions={
                    <div className="flex flex-wrap gap-2">
                        <Select
                            className="min-w-40"
                            value={selectedUser || undefined}
                            allowClear
                            placeholder="全部用户"
                            onChange={(value) => setSelectedUser(value || "")}
                            options={data.users.map((item) => ({ value: item.id, label: item.display_name || item.username }))}
                        />
                        <Segmented<PeriodMode> value={periodMode} onChange={setPeriodMode} options={[{ label: "按周", value: "week" }, { label: "按月", value: "month" }]} />
                        <DatePicker
                            key={periodMode}
                            picker={periodMode}
                            value={period}
                            allowClear={false}
                            format={periodMode === "week" ? "YYYY-wo" : "YYYY年M月"}
                            onChange={(value) => value && setPeriod(value)}
                        />
                    </div>
            }
        >

                <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard title="任务总数" value={summary.totalJobs || 0} loading={loading} />
                    <MetricCard title="成功任务" value={summary.succeededJobs || 0} loading={loading} />
                    <MetricCard title="失败任务" value={summary.failedJobs || 0} loading={loading} />
                    <MetricCard title="参考费用（CNY）" value={Number(summary.estimatedCost || 0).toFixed(4)} loading={loading} />
                </div>

                <Suspense fallback={<div className="mb-6 grid gap-3 lg:grid-cols-3"><Card loading /><Card loading /><Card loading /></div>}>
                    <UsageCharts analytics={data.analytics} loading={loading} />
                </Suspense>

                <Card title="按用户统计（点击可查看个人）" className="mb-6">
                    <Table rowKey="id" loading={loading} dataSource={data.users} columns={columns} onRow={(row) => ({ onClick: () => setSelectedUser(row.id), className: "cursor-pointer" })} scroll={{ x: 900 }} pagination={{ pageSize: 20 }} />
                </Card>
                <Card title="最近生成记录">
                    <Table rowKey="id" loading={loading} dataSource={jobs} columns={[{ title: "用户", width: 120, render: (_: unknown, row: UsageJob) => row.user?.display_name || row.user?.username || "—" }, ...jobColumns]} scroll={{ x: 1050 }} pagination={{ pageSize: 20 }} />
                </Card>
        </AdminPage>
    );
}
