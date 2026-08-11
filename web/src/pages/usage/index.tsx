import { App, Button, Card, Select, Table, Tag } from "antd";
import { useEffect, useState } from "react";

import { cancelGeneration, getMyUsage, type UsageJob, type UsageSummary } from "@/services/api/usage";
import { AdminPage } from "@/components/layout/page-shell";
import { MetricCard } from "@/components/ui/metric-card";

export default function UsagePage() {
    const { message } = App.useApp(); const [days, setDays] = useState(30); const [loading, setLoading] = useState(true); const [cancelingId, setCancelingId] = useState(""); const [summary, setSummary] = useState<UsageSummary | null>(null); const [jobs, setJobs] = useState<UsageJob[]>([]);
    useEffect(() => { setLoading(true); void getMyUsage(days).then((data) => { setSummary(data.summary); setJobs(data.jobs); }).catch((error) => message.error(error instanceof Error ? error.message : "使用统计加载失败")).finally(() => setLoading(false)); }, [days]);
    const cancel = async (jobId: string) => { setCancelingId(jobId); try { await cancelGeneration(jobId); const data = await getMyUsage(days); setSummary(data.summary); setJobs(data.jobs); message.success("任务已取消"); } catch (error) { message.error(error instanceof Error ? error.message : "取消失败"); } finally { setCancelingId(""); } };
    const columns = [...jobColumns, { title: "操作", width: 80, render: (_: unknown, row: UsageJob) => row.capability === "video" && ["queued", "running"].includes(row.status) ? <Button type="link" size="small" loading={cancelingId === row.id} onClick={() => void cancel(row.id)}>取消</Button> : "—" }];
    return <AdminPage title="我的使用统计" description="用量与费用仅作内部统计，费用为管理员配置的参考价格估算。" actions={<Select value={days} onChange={setDays} options={[{ value: 7, label: "近 7 天" }, { value: 30, label: "近 30 天" }, { value: 90, label: "近 90 天" }]} />}>
        <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard title="生成任务" value={summary?.total_jobs} loading={loading} /><MetricCard title="成功率" value={summary?.total_jobs ? `${(Number(summary.succeeded_jobs || 0) / Number(summary.total_jobs) * 100).toFixed(1)}%` : "0%"} loading={loading} /><MetricCard title="LLM 输入 Token" value={summary?.input_tokens} loading={loading} /><MetricCard title="LLM 输出 Token" value={summary?.output_tokens} loading={loading} /><MetricCard title="图片" value={summary?.image_count} loading={loading} /><MetricCard title="视频 Token" value={summary?.video_tokens} loading={loading} /><MetricCard title="语音字符数" value={Number(summary?.speech_characters || 0).toLocaleString()} loading={loading} /><MetricCard title="音乐" value={summary?.music_tracks} loading={loading} /><MetricCard title="预估费用（参考，CNY）" value={Number(summary?.estimated_cost || 0).toFixed(4)} loading={loading} /></div>
        <Card title="生成记录"><Table rowKey="id" loading={loading} dataSource={jobs} scroll={{ x: 980 }} pagination={{ pageSize: 20 }} columns={columns} /></Card>
    </AdminPage>;
}

const labels: Record<string, string> = { llm: "文本", image: "图片", video: "视频", speech: "语音", music: "音乐" };
export const jobColumns: any[] = [
    { title: "时间", dataIndex: "created_at", width: 170, render: (value: string) => new Date(value).toLocaleString("zh-CN") },
    { title: "类型", dataIndex: "capability", width: 80, render: (value: string) => labels[value] || value },
    { title: "模型", dataIndex: "model_key", width: 180 },
    { title: "Prompt", dataIndex: "prompt", ellipsis: true },
    { title: "状态", dataIndex: "status", width: 90, render: (value: string) => <Tag color={value === "succeeded" ? "green" : value === "failed" ? "red" : value === "canceled" ? "default" : "blue"}>{value === "succeeded" ? "成功" : value === "failed" ? "失败" : value === "canceled" ? "已取消" : value === "queued" ? "排队中" : "生成中"}</Tag> },
    { title: "预估费用（参考）", dataIndex: "estimated_cost", width: 140, render: (value: number | null) => value == null ? "—" : `¥${Number(value).toFixed(4)}` },
];
