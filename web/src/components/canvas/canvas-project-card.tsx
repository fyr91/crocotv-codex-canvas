import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { App, Button, Input } from "antd";

import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";

export function CanvasProjectCard({ project }: { project: CanvasProject }) {
    const navigate = useNavigate();
    const { modal, message } = App.useApp();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(project.title);
    const saveTitle = () => { renameProject(project.id, title); setEditing(false); };
    const remove = () => modal.confirm({ title: "删除画布", content: `“${project.title}”会移入本地回收站目录。`, okText: "删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: async () => { await deleteProjects([project.id]); message.success("画布已移入本地回收站"); } });

    return <article className="group flex min-h-44 cursor-pointer flex-col justify-between rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-5 shadow-[var(--elevation-card)] transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--elevation-card-hover)]" onClick={() => !editing && navigate(`/canvas/${project.id}`)}>
        <div className="flex items-start gap-3">
            {editing ? <Input className="min-w-0" value={title} onClick={(event) => event.stopPropagation()} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus /> : <button type="button" className="min-w-0 cursor-pointer text-left" onClick={(event) => { event.stopPropagation(); navigate(`/canvas/${project.id}`); }}><h2 className="truncate text-xl font-semibold">{project.title}</h2><p className="mt-3 text-sm leading-6 text-stone-600">{project.nodes.length} 个节点 · {project.connections.length} 条连线</p></button>}
        </div>
        <div className="mt-8 flex items-end justify-between gap-3">
            <p className="text-xs text-stone-500">更新于 {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
            <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                {editing ? <><Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} /><Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={() => setEditing(false)} /></> : <><Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} aria-label="重命名" /><Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} onClick={remove} aria-label="删除" /></>}
            </div>
        </div>
    </article>;
}
