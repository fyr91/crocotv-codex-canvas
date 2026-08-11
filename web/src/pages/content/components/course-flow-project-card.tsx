import { useQuery } from "@tanstack/react-query";

import { WorkspaceProjectActivity, WorkspaceProjectHeader, WorkspaceProjectMetrics } from "./workspace-project-card-parts";
import { WorkspaceProjectCard } from "./workspace-project-card";

const stepLabels = { role: "选择角色", script_scene: "文案与场景", audio: "确认音频", video: "生成视频", export: "可导出" } as const;

export function CourseFlowProjectCard({ projectId, title, updatedAt, onOpen, onDelete }: { projectId: string; title: string; updatedAt: string; onOpen: () => void; onDelete: () => void }) {
    const workspace = useQuery({ queryKey: ["course-flow-card", projectId], queryFn: () => import("@/services/api/course-flow").then(({ getCourseFlowSnapshot }) => getCourseFlowSnapshot(projectId)), staleTime: 30_000 });
    const data = workspace.data;
    const videoTotal = data?.segments.reduce((count, segment) => count + 1 + segment.materialShots.length, 0) || 0;
    const videoReady = data?.segments.reduce((count, segment) => count + (segment.ltxVideo?.status === "ready" ? 1 : 0) + segment.materialShots.filter((shot) => shot.video?.status === "ready").length, 0) || 0;
    return (
        <WorkspaceProjectCard openLabel={`打开 ${title}`} time={updatedAt} onOpen={onOpen} onDelete={onDelete}>
            <WorkspaceProjectHeader title={title} />
            <WorkspaceProjectMetrics items={[{ label: "片段", value: data?.segments.length || 0 }, { label: "视频", value: `${videoReady}/${videoTotal}` }, { label: "步骤", value: data ? stepLabels[data.project.currentStep] : "读取中" }]} />
            <WorkspaceProjectActivity message={workspace.isError ? "项目状态读取失败" : data ? `当前：${stepLabels[data.project.currentStep]}` : "正在读取项目"} />
        </WorkspaceProjectCard>
    );
}
