import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeMetadata } from "@/types/canvas";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 340, height: 240, title: "图片" },
    [CanvasNodeType.Text]: { width: 340, height: 240, title: "文本" },
    [CanvasNodeType.Comment]: { width: 380, height: 260, title: "注释" },
    [CanvasNodeType.Config]: { width: 420, height: 240, title: "生成模组" },
    [CanvasNodeType.Split]: { width: 420, height: 240, title: "拆分" },
    [CanvasNodeType.Video]: { width: 420, height: 236, title: "视频" },
    [CanvasNodeType.Audio]: { width: 340, height: 120, title: "音频" },
    [CanvasNodeType.Music]: { width: 340, height: 140, title: "音乐" },
    [CanvasNodeType.Group]: { width: 760, height: 480, title: "组" },
    [CanvasNodeType.WorkflowGroup]: { width: 760, height: 480, title: "工作流组" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Comment]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Comment],
        metadata: { content: "", status: "idle", commentColor: "default" },
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.Split]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Split],
        metadata: { content: "", status: "idle", splitCount: "auto" },
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Music]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Music],
        metadata: { content: "", status: "idle", musicInstrumental: false, musicStyles: [], musicStyleWeight: 0.65, musicWeirdnessConstraint: 0.65 },
    },
    [CanvasNodeType.Group]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Group],
        metadata: { status: "idle" },
    },
    [CanvasNodeType.WorkflowGroup]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.WorkflowGroup],
        metadata: { status: "idle", workflowState: "stopped" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
