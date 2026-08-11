import { useQuery } from "@tanstack/react-query";

import { summarizeKouboGroup } from "@/lib/koubo-video/workflow";
import { WorkspaceProjectActivity, WorkspaceProjectHeader, WorkspaceProjectMetrics } from "./workspace-project-card-parts";
import { WorkspaceProjectCard } from "./workspace-project-card";
import type { VideoWorkflowType } from "@/types/content-production";

export function KouboProjectCard({ projectId, workflowType, title, updatedAt, onOpen, onDelete }: { projectId: string; workflowType: VideoWorkflowType; title: string; updatedAt: string; onOpen: () => void; onDelete: () => void }) {
    const workspace = useQuery({ queryKey: ["koubo-workspace", workflowType, projectId], queryFn: () => import("@/services/api/koubo-video").then(({ getKouboWorkspace }) => getKouboWorkspace(projectId, workflowType)) });
    const data = workspace.data;
    const summary = data ? summarizeKouboGroup(data.videoCandidates) : { completed: 0, total: 0, running: 0, failed: 0 };
    return (
        <WorkspaceProjectCard openLabel={`打开 ${title}`} time={updatedAt} onOpen={onOpen} onDelete={onDelete}>
            <WorkspaceProjectHeader title={title} unreadClassName={data?.noticeUnread ? "bg-blue-500" : undefined} />
            <WorkspaceProjectMetrics items={[{ label: "已完成", value: `${summary.completed}/${summary.total}` }, { label: "运行中", value: summary.running }, { label: "失败", value: summary.failed }]} />
            <WorkspaceProjectActivity message={data?.latestMessage || "暂无新的生成动态"} />
        </WorkspaceProjectCard>
    );
}
