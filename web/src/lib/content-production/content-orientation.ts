import type { ContentNode, ContentTopicOrientation } from "@/types/content-production";

export const CONTENT_ORIENTATION_FIELDS = [
    { name: "contentGoal", label: "内容目标", description: "这个 Topic 为什么要做", sample: "让家长理解孩子抗拒刷牙的原因，并愿意尝试新的引导方式" },
    { name: "targetAudience", label: "目标受众", description: "这条内容主要给谁看", sample: "3–8 岁孩子的家长" },
    { name: "marketLanguage", label: "市场与语言", description: "面向的地区和主要语言", sample: "中国大陆，简体中文" },
    { name: "primaryPlatforms", label: "主要平台", description: "准备发布到哪些平台", sample: "抖音、小红书" },
    { name: "contentFormat", label: "内容形式", description: "这条内容采用的表达形式", sample: "60 秒竖屏知识剧情" },
    { name: "defaultDurationSeconds", label: "目标时长", description: "Script 和镜头规划的目标长度", sample: "60 秒" },
    { name: "defaultAspectRatio", label: "目标画幅", description: "图片与视频生成采用的比例", sample: "9:16" },
    { name: "expressionStyle", label: "表达风格", description: "这条内容的语气与节奏", sample: "轻松、可信、避免说教" },
] as const;

export function isContentOrientationComplete(value: unknown): value is ContentTopicOrientation {
    if (!value || typeof value !== "object") return false;
    const orientation = value as Partial<ContentTopicOrientation>;
    return Boolean(
        nonEmpty(orientation.contentGoal)
        && nonEmpty(orientation.targetAudience)
        && nonEmpty(orientation.marketLanguage)
        && Array.isArray(orientation.primaryPlatforms)
        && orientation.primaryPlatforms.some(nonEmpty)
        && nonEmpty(orientation.contentFormat)
        && typeof orientation.defaultDurationSeconds === "number"
        && orientation.defaultDurationSeconds > 0
        && nonEmpty(orientation.defaultAspectRatio)
        && nonEmpty(orientation.expressionStyle),
    );
}

export function contentAttemptOrientationNode(nodes: ContentNode[]) {
    return nodes.find((node) => node.nodeType === "topic" && !node.parentId && !node.hiddenAt && "orientation" in node.data) || null;
}

export function contentAttemptOrientation(nodes: ContentNode[]) {
    const node = nodes.find((item) => (
        item.nodeType === "topic"
        && !item.parentId
        && !item.hiddenAt
        && isContentOrientationComplete(item.data.orientation)
    ));
    return node ? node.data.orientation as ContentTopicOrientation : null;
}

function nonEmpty(value: unknown): value is string {
    return typeof value === "string" && Boolean(value.trim());
}
