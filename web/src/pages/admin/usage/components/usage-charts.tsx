import { Card, Empty, theme as antdTheme } from "antd";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";
import type { UsageAnalytics, UsageAnalyticsUser } from "@/services/api/usage";

type ChartKey = "mediaJobs" | "successRate" | "videoTokens";
const compactNumberFormatter = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

export function UsageCharts({ analytics, loading }: { analytics?: UsageAnalytics; loading: boolean }) {
    const users = analytics?.users || [];
    const mediaUsers = [...users].sort((a, b) => b.mediaJobs - a.mediaJobs || a.username.localeCompare(b.username, "zh-CN"));
    const successUsers = [...users].sort((a, b) => b.successRate - a.successRate || b.totalJobs - a.totalJobs || a.username.localeCompare(b.username, "zh-CN"));
    const tokenUsers = [...users].sort((a, b) => b.videoTokens - a.videoTokens || a.username.localeCompare(b.username, "zh-CN"));

    return (
        <div className="mb-6 grid gap-3 lg:grid-cols-3">
            <CompactUserBarChart
                title="用户媒体生成次数"
                users={mediaUsers}
                dataKey="mediaJobs"
                loading={loading}
                valueFormatter={(value) => Math.round(value).toLocaleString()}
                detail={(user) => `媒体生成 ${user.mediaJobs.toLocaleString()} 次`}
            />
            <CompactUserBarChart
                title="用户生成成功率"
                users={successUsers}
                dataKey="successRate"
                loading={loading}
                domain={[0, 1]}
                valueFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                detail={(user) => `${(user.successRate * 100).toFixed(1)}% · ${user.succeededJobs} / ${user.totalJobs}`}
            />
            <CompactUserBarChart
                title="用户视频 Token"
                users={tokenUsers}
                dataKey="videoTokens"
                loading={loading}
                valueFormatter={compactNumber}
                detail={(user) => `${user.videoTokens.toLocaleString()} 视频 Token`}
            />
        </div>
    );
}

function CompactUserBarChart({
    title,
    users,
    dataKey,
    loading,
    domain,
    valueFormatter,
    detail,
}: {
    title: string;
    users: UsageAnalyticsUser[];
    dataKey: ChartKey;
    loading: boolean;
    domain?: [number, number];
    valueFormatter: (value: number) => string;
    detail: (user: UsageAnalyticsUser) => ReactNode;
}) {
    const { token } = antdTheme.useToken();
    const resolvedDomain: [number, number] = domain || [0, Math.max(1, ...users.map((user) => Number(user[dataKey]) || 0))];
    const tooltipStyle = { background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, color: token.colorText, padding: "8px 12px" };

    return (
        <Card title={title} loading={loading} size="small" className="min-w-0">
            {users.length ? (
                <div className="max-h-80 overflow-y-auto">
                    <div style={{ height: Math.max(220, users.length * 32) }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={users} layout="vertical" margin={{ top: 4, right: 58, bottom: 4, left: 0 }} accessibilityLayer>
                                <CartesianGrid stroke={token.colorBorderSecondary} strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" domain={resolvedDomain} tickFormatter={valueFormatter} tick={{ fontSize: 10 }} stroke={token.colorTextSecondary} />
                                <YAxis type="category" dataKey="username" width={80} tickFormatter={shortName} tick={{ fontSize: 11 }} stroke={token.colorTextSecondary} />
                                <Tooltip
                                    cursor={{ fill: token.colorFillTertiary }}
                                    content={({ active, payload }) => {
                                        const user = payload?.[0]?.payload as UsageAnalyticsUser | undefined;
                                        if (!active || !user) return null;
                                        return <div style={tooltipStyle}><div className="font-medium">{user.username}</div><div>{detail(user)}</div></div>;
                                    }}
                                />
                                <Bar dataKey={dataKey} fill={token.colorPrimary} radius={[0, token.borderRadiusSM, token.borderRadiusSM, 0]} maxBarSize={16}>
                                    <LabelList dataKey={dataKey} position="right" formatter={(value) => valueFormatter(Number(value))} fill={token.colorTextSecondary} fontSize={10} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ) : <div className="flex h-56 items-center justify-center"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无用户" /></div>}
        </Card>
    );
}

function compactNumber(value: number) {
    return compactNumberFormatter.format(value);
}

function shortName(value: string) {
    return value.length > 9 ? `${value.slice(0, 8)}…` : value;
}
