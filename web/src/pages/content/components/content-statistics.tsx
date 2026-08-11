import { DatePicker, Empty, Segmented, Select, Skeleton, Table, Tag } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";

import { contentStatisticsRange, type ContentStatisticsPeriod } from "@/lib/content-production/content-statistics";
import { useUserStore } from "@/stores/use-user-store";
import { useContentMembersQuery, useContentProductionStatsQuery } from "../use-content-production";

type Period = ContentStatisticsPeriod | "custom";

export function ContentStatistics() {
    const profile = useUserStore((state) => state.profile);
    const [period, setPeriod] = useState<Period>("week");
    const [custom, setCustom] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, "day").startOf("day"), dayjs().add(1, "day").startOf("day")]);
    const [memberId, setMemberId] = useState<string>();
    const members = useContentMembersQuery(Boolean(profile));
    const range = useMemo(() => period === "custom"
        ? { start: custom[0].format(), end: custom[1].format() }
        : contentStatisticsRange(period), [custom, period]);
    const stats = useContentProductionStatsQuery(range.start, range.end, memberId);

    return (
        <section>
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <Segmented<Period>
                    value={period}
                    onChange={setPeriod}
                    options={[
                        { value: "day", label: "今日" },
                        { value: "week", label: "本周" },
                        { value: "month", label: "本月" },
                        { value: "custom", label: "自定义" },
                    ]}
                />
                {period === "custom" ? (
                    <DatePicker.RangePicker
                        value={custom}
                        allowClear={false}
                        onChange={(value) => {
                            if (value?.[0] && value[1]) setCustom([value[0].startOf("day"), value[1].add(1, "day").startOf("day")]);
                        }}
                    />
                ) : null}
                <Select
                    allowClear
                    className="min-w-48"
                    value={memberId}
                    placeholder="团队全部成员"
                    options={(members.data || []).map((member) => ({ value: member.id, label: member.id === profile?.id ? `${member.displayName}（我）` : member.displayName }))}
                    onChange={setMemberId}
                />
                <span className="ml-auto text-xs text-stone-400">{dayjs(range.start).format("YYYY-MM-DD")} 至 {dayjs(range.end).subtract(1, "second").format("YYYY-MM-DD")}</span>
            </div>
            {stats.isLoading ? <Skeleton active /> : stats.data ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                        <Metric label="创建 Topic" value={stats.data.topics.created} />
                        <Metric label="领取 Attempt" value={stats.data.topics.claimed} />
                        <Metric label="完成 Topic" value={stats.data.topics.completed} />
                        <Metric label="放弃 Attempt" value={stats.data.topics.abandoned} />
                        <Metric label="生成 Run" value={stats.data.generation.total} />
                        <Metric label="AI Clip" value={stats.data.media.aiClips} />
                    </div>
                    <div className="mt-5 grid gap-4 lg:grid-cols-3">
                        <Distribution title="Topic 来源" values={stats.data.topics.bySource} />
                        <Distribution title="内容类型" values={stats.data.topics.byWorkflow} />
                        <Distribution title="自由 Tags" values={stats.data.topics.topTags} />
                        <Distribution title="生成阶段" values={stats.data.generation.byStage} />
                        <Distribution title="媒体分布" values={stats.data.media.distribution} />
                        <div className="rounded-2xl border border-stone-200 p-5 dark:border-stone-800">
                            <h3 className="font-medium">生成效率</h3>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <Stat label="平均 Run / 完成 Topic" value={stats.data.efficiency.averageRuns} />
                                <Stat label="Run 最少 / 最多" value={`${stats.data.efficiency.minimumRuns} / ${stats.data.efficiency.maximumRuns}`} />
                                <Stat label="平均 AI Clip" value={stats.data.efficiency.averageClips} />
                                <Stat label="Clip 最少 / 最多" value={`${stats.data.efficiency.minimumClips} / ${stats.data.efficiency.maximumClips}`} />
                                <Stat label="选中 Clip" value={stats.data.clips.selected} />
                                <Stat label="AI Clip 利用率" value={`${Math.round(stats.data.clips.utilization * 100)}%`} />
                            </dl>
                        </div>
                    </div>
                </>
            ) : <Empty description="暂无统计数据" />}
        </section>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return <div className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800"><div className="text-2xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-xs text-stone-500">{label}</div></div>;
}

function Distribution({ title, values }: { title: string; values: Record<string, number> }) {
    const rows = Object.entries(values).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    return (
        <div className="rounded-2xl border border-stone-200 p-5 dark:border-stone-800">
            <h3 className="mb-3 font-medium">{title}</h3>
            {!rows.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" /> : (
                <Table
                    size="small"
                    rowKey="name"
                    showHeader={false}
                    pagination={{ pageSize: 6, hideOnSinglePage: true }}
                    dataSource={rows}
                    columns={[
                        { dataIndex: "name", render: (value) => <Tag>{value}</Tag> },
                        { dataIndex: "count", align: "right" },
                    ]}
                />
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return <div><dt className="text-xs text-stone-500">{label}</dt><dd className="mt-1 font-medium tabular-nums">{value}</dd></div>;
}
