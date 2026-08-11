import { Card, Statistic } from "antd";
import type { StatisticProps } from "antd";

export function MetricCard({ title, value, loading }: { title: string; value: StatisticProps["value"]; loading?: boolean }) {
    return (
        <Card className="h-full" loading={loading} styles={{ body: { minHeight: 104, display: "flex", alignItems: "center" } }}>
            <Statistic title={title} value={value ?? 0} />
        </Card>
    );
}
