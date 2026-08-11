import type { VideoWorkflowType } from "@/types/content-production";

export type VideoWorkflowCopy = {
    startTitle: string;
    generateScriptLabel: string;
    generationNodeTitle: string;
    generationSummary: string;
    scriptGroupTitle: string;
    segmentToggleLabel: string;
    segmentGroupLabel: string;
    generatedMessage: string;
    optimizeGroupTitle: string;
};

const copy = {
    "koubo-video": {
        startTitle: "开始制作口播视频",
        generateScriptLabel: "生成口播文案",
        generationNodeTitle: "口播文案生成",
        generationSummary: "正在生成结构化口播文案",
        scriptGroupTitle: "口播文案组",
        segmentToggleLabel: "拆分为口播片段",
        segmentGroupLabel: "口播文案段",
        generatedMessage: "口播文案已生成",
        optimizeGroupTitle: "按要求优化整组口播文案",
    },
    "course-video": {
        startTitle: "开始制作课程视频",
        generateScriptLabel: "生成课程文案",
        generationNodeTitle: "课程文案生成",
        generationSummary: "正在生成结构化课程文案",
        scriptGroupTitle: "课程文案组",
        segmentToggleLabel: "拆分为视频文案片段",
        segmentGroupLabel: "课程文案片段",
        generatedMessage: "课程文案已生成",
        optimizeGroupTitle: "按要求优化整组课程文案",
    },
} satisfies Record<VideoWorkflowType, VideoWorkflowCopy>;

export function videoWorkflowCopy(workflowType: VideoWorkflowType) {
    return copy[workflowType];
}
