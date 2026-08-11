import { CheckCircle2, CircleDot, LoaderCircle, RefreshCw, SearchCheck, Sparkles, TriangleAlert } from "lucide-react";

import type { TopicFactorySummary } from "@/lib/content-production/topic-factory";

export function TopicFactoryProgress({
    summary,
    total,
    selectedPath,
}: {
    summary: TopicFactorySummary;
    total: number;
    selectedPath: string[];
}) {
    const items = total
        ? [
            { label: "生成中", value: summary.generating, icon: LoaderCircle, active: summary.generating > 0 },
            { label: "验证中", value: summary.reviewing, icon: SearchCheck, active: summary.reviewing > 0 },
            { label: "调整中", value: summary.revising, icon: RefreshCw, active: summary.revising > 0 },
            { label: "去 AI 化", value: summary.humanizing, icon: Sparkles, active: summary.humanizing > 0 },
            { label: "已通过", value: summary.readyPass, icon: CheckCircle2, active: summary.readyPass > 0 },
            { label: "质量提示", value: summary.readyWarning, icon: TriangleAlert, active: summary.readyWarning > 0 },
            { label: "失败", value: summary.failed, icon: TriangleAlert, active: summary.failed > 0 },
        ]
        : [{ label: "定义方向", value: 0, icon: CircleDot, active: true }];

    return (
        <div className="flex min-h-11 shrink-0 items-center gap-5 overflow-x-auto border-b border-border bg-background px-4 text-xs text-muted-foreground">
            <span className="shrink-0 font-medium text-foreground">内容生产流程</span>
            <div className="flex shrink-0 items-center gap-4">
                {items.map(({ label, value, icon: Icon, active }) => (
                    <span key={label} className={active ? "flex items-center gap-1.5 text-foreground" : "flex items-center gap-1.5 opacity-55"}>
                        <Icon className={`size-3.5 ${["生成中", "调整中", "去 AI 化"].includes(label) && active ? "animate-spin" : ""}`} />
                        {label}{total ? ` ${value}` : ""}
                    </span>
                ))}
            </div>
            {selectedPath.length ? (
                <div className="ml-auto flex shrink-0 items-center gap-1.5" aria-label="当前内容路径">
                    {selectedPath.map((title, index) => (
                        <span key={`${title}-${index}`} className={index === selectedPath.length - 1 ? "text-foreground" : ""}>
                            {index ? " / " : ""}{title}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
