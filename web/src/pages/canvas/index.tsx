import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "antd";
import { Plus } from "lucide-react";

import { CanvasProjectCard } from "@/components/canvas/canvas-project-card";
import { LibraryPage } from "@/components/layout/page-shell";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

export default function CanvasPage() {
    const navigate = useNavigate();
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const initialize = useCanvasStore((state) => state.initialize);
    const createProject = useCanvasStore((state) => state.createProject);
    useEffect(() => { if (!hydrated) void initialize(); }, [hydrated, initialize]);
    const createAndEnter = () => navigate(`/canvas/${createProject(`CrocoTV 画布 ${projects.length + 1}`)}`);

    return <LibraryPage title="我的画布" description="每张画布独立保存在本地项目文件夹；节点、连线和生成资源不会上传或共享。" width="6xl" header={<div className="flex justify-end"><Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>新建画布</Button></div>}>
        {!hydrated ? <section className="flex min-h-[360px] items-center justify-center border-y border-stone-200 text-sm text-stone-500">正在读取本地画布...</section> : projects.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <CanvasProjectCard key={project.id} project={project} />)}</div> : <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><h3 className="text-lg font-medium">还没有本地画布</h3><p className="mt-3 text-sm text-stone-500">新建后会立即创建独立项目文件夹。</p><Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={createAndEnter}>新建画布</Button></div>}
    </LibraryPage>;
}
