import type { ContentGlobalSettings } from "@/types/content-production";

export const CONTENT_BACKGROUND_FIELDS = [
    { name: "contentGoal", label: "内容目标", description: "为什么持续生产这类内容", sample: "建立“鳄鱼一家”育儿 IP，为家长提供实用且容易传播的育儿内容" },
    { name: "targetAudience", label: "目标受众", description: "内容主要给谁看", sample: "25–40 岁、家有 3–12 岁孩子的父母" },
    { name: "marketLanguage", label: "市场与语言", description: "面向的地区和主要语言", sample: "中国大陆，简体中文" },
    { name: "primaryPlatforms", label: "主要平台", description: "内容主要发布到哪里", sample: "抖音、小红书、视频号" },
    { name: "contentFormat", label: "内容形式", description: "默认采用的表达形式", sample: "IP 角色剧情＋育儿科普短视频" },
    { name: "defaultDurationSeconds", label: "默认时长", description: "Script 和镜头规划的默认长度", sample: "60 秒" },
    { name: "defaultAspectRatio", label: "默认画幅", description: "图片与视频生成的默认比例", sample: "9:16" },
    { name: "expressionStyle", label: "表达风格", description: "长期保持的语气和节奏", sample: "温暖、幽默、节奏紧凑、避免说教" },
] as const;

export function isContentBackgroundComplete(settings?: ContentGlobalSettings | null) {
    return Boolean(
        settings
        && settings.contentGoal.trim()
        && settings.targetAudience.trim()
        && settings.marketLanguage.trim()
        && settings.primaryPlatforms.length
        && settings.contentFormat.trim()
        && settings.defaultDurationSeconds > 0
        && settings.defaultAspectRatio.trim()
        && settings.expressionStyle.trim(),
    );
}
