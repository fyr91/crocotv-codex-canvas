import { imageSizePresetsForModel, modelOptionName, providerIdForModel, type AiConfig } from "@/stores/use-config-store";
import type { CourseFlowMaterialShot, CourseSceneAspectRatio } from "@/types/course-flow";

export function courseMaterialStoryboardModel(config: AiConfig) {
    return config.imageModels.find((model) => providerIdForModel(model) === "runware" && modelOptionName(model) === "google:nano-banana@2-lite") || "";
}

export function courseMaterialStoryboardPrompt(systemPrompt: string, contentPrompt: string) {
    const instruction = systemPrompt.trim();
    const content = contentPrompt.trim();
    if (!instruction) throw new Error("素材分镜图生成 Prompt 不能为空");
    if (!content) throw new Error("画面素材提示词不能为空");
    return `${instruction} detailed scene: ${content}`;
}

export function courseMaterialStoryboardSize(model: string, ratio: CourseSceneAspectRatio) {
    for (const sizes of Object.values(imageSizePresetsForModel(model))) {
        if (sizes[ratio]) return sizes[ratio];
    }
    throw new Error(`分镜图不支持 ${ratio} 画面比例`);
}

export function courseMaterialStoryboardState(shot: CourseFlowMaterialShot) {
    if (shot.storyboardStatus === "running") return "running" as const;
    if (shot.storyboardStatus === "queued") return "queued" as const;
    if (shot.storyboardStatus === "failed") return "failed" as const;
    if (shot.prompt.trim() !== shot.storyboardSourcePrompt.trim()) return "stale" as const;
    return shot.storyboardAssetId && shot.storyboardUrl ? "ready" as const : "queued" as const;
}

export function composeH3MaterialVideoPrompt(stylePrompt: string, contentPrompt: string) {
    const style = stylePrompt.trim();
    const content = contentPrompt.trim();
    if (!style) throw new Error("内容素材统一风格不能为空");
    if (!content) throw new Error("画面素材提示词不能为空");
    return `分镜参考：\n参考 <Picture 1> 生成当前视频镜头。\n\n当前画面描述：\n${content}\n\n统一视觉风格：\n${style}`;
}

export function courseMaterialH3Selection(ratio: CourseSceneAspectRatio) {
    if (ratio === "4:3") return { quality: "standard_480p", size: "640x480" };
    if (ratio === "9:16") return { quality: "standard_portrait_480p", size: "480x864" };
    return { quality: "preview", size: "864x480" };
}
