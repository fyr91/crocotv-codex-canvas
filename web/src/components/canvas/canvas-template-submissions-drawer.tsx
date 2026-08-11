import { App, Button, Drawer, Empty, Popconfirm, Tag } from "antd";

import { withdrawCanvasTemplate, type CanvasTemplate, type CanvasTemplateStatus } from "@/services/api/canvas-templates";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

const statusMeta: Record<CanvasTemplateStatus, { label: string; color?: string }> = {
    pending: { label: "待审核", color: "gold" },
    published: { label: "已发布", color: "green" },
    rejected: { label: "已驳回", color: "red" },
    withdrawn: { label: "已撤回" },
};

export function CanvasTemplateSubmissionsDrawer({ open, templates, projects, onClose, onRefresh, onResubmit }: { open: boolean; templates: CanvasTemplate[]; projects: CanvasProject[]; onClose: () => void; onRefresh: () => void; onResubmit: (template: CanvasTemplate, project: CanvasProject) => void }) {
    const { message } = App.useApp();
    const withdraw = async (id: string) => {
        try {
            await withdrawCanvasTemplate(id);
            message.success("已撤回提交");
            onRefresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "撤回失败");
        }
    };
    return (
        <Drawer title="我的模板提交" width={440} open={open} onClose={onClose}>
            {templates.length ? <div className="space-y-3">{templates.map((template) => {
                const meta = statusMeta[template.status];
                const source = projects.find((project) => project.id === template.sourceProjectId);
                return (
                    <article key={template.id} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-medium">{template.title}</h3><p className="mt-1 text-xs text-stone-500">{new Date(template.createdAt).toLocaleString("zh-CN")}</p></div><Tag color={meta.color}>{meta.label}</Tag></div>
                        {template.description ? <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-400">{template.description}</p> : null}
                        {template.status === "rejected" && template.rejectionReason ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">驳回原因：{template.rejectionReason}</p> : null}
                        {template.status === "pending" || template.status === "rejected" ? <div className="mt-3 flex justify-end gap-2">
                            {template.status === "pending" ? <Popconfirm title="确认撤回这次模板提交？" onConfirm={() => void withdraw(template.id)}><Button size="small" type="text">撤回</Button></Popconfirm> : null}
                            {template.status === "rejected" ? <Button size="small" type="text" disabled={!source} title={source ? undefined : "源画布已删除，无法重新提交"} onClick={() => source && onResubmit(template, source)}>重新提交</Button> : null}
                        </div> : null}
                    </article>
                );
            })}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有模板提交" />}
        </Drawer>
    );
}
