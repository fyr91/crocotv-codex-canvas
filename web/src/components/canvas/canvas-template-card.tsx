import { Button } from "antd";
import { LayoutTemplate } from "lucide-react";

import { templateNodeCounts } from "@/lib/canvas/canvas-template";
import type { CanvasTemplate } from "@/services/api/canvas-templates";

export function CanvasTemplateCard({ template, onUse }: { template: CanvasTemplate; onUse: (template: CanvasTemplate) => void }) {
    const counts = templateNodeCounts(template.document.nodes || []);
    return (
        <article className="flex min-h-44 cursor-pointer flex-col justify-between rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-5 shadow-[var(--elevation-card)] transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--elevation-card-hover)]">
            <div className="min-w-0">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-sunken)]"><LayoutTemplate className="size-4" /></span>
                    <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold">{template.title}</h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600 dark:text-stone-400">{template.description || "可直接使用的画布模板"}</p>
                    </div>
                </div>
                <p className="mt-4 text-xs text-stone-500">{counts.total} 个节点 · 来自 {template.creatorName || "内部用户"}</p>
            </div>
            <div className="mt-6 flex items-end justify-between gap-3">
                <p className="text-xs text-stone-500">发布于 {formatDate(template.publishedAt || template.updatedAt)}</p>
                <Button type="text" size="small" icon={<LayoutTemplate className="size-4" />} onClick={() => onUse(template)}>使用模板</Button>
            </div>
        </article>
    );
}

function formatDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
