import {
    imageSizePresetsForModel,
    modelConfigForModel,
    modelOptionName,
    providerIdForModel,
    type AiConfig,
} from "@/stores/use-config-store";
import type { CourseFlowRole, CourseFlowScene } from "@/types/course-flow";
import type { ReferenceImage } from "@/types/image";

export const COURSE_SCENE_RATIOS = ["16:9", "4:3", "1:1", "9:16"] as const;
export type CourseSceneAspectRatio = typeof COURSE_SCENE_RATIOS[number];

export function courseSceneImageModel(config: AiConfig) {
    return config.imageModels.find((model) => providerIdForModel(model) === "runware" && modelOptionName(model) === "openai:gpt-image@2") || "";
}

export function courseSceneRatioOptions(model: string) {
    const presets = imageSizePresetsForModel(model);
    return COURSE_SCENE_RATIOS
        .filter((ratio) => Object.values(presets).some((sizes) => Boolean(sizes[ratio])))
        .map((ratio) => ({ label: ratio, value: ratio }));
}

export function courseSceneImageSize(model: string, ratio: CourseSceneAspectRatio) {
    for (const sizes of Object.values(imageSizePresetsForModel(model))) {
        if (sizes[ratio]) return sizes[ratio];
    }
    throw new Error(`GPT Image 2 不支持 ${ratio} 画面比例`);
}

export function courseSceneReferences(role: CourseFlowRole, scene: CourseFlowScene | null, referenceCurrentScene: boolean): ReferenceImage[] {
    const references: ReferenceImage[] = [{
        id: role.id,
        name: role.name,
        type: "image",
        dataUrl: role.designSheetUrl,
        url: role.designSheetUrl,
        storageKey: role.designSheetAssetId,
    }];
    if (!referenceCurrentScene) return references;
    if (!scene?.assetId || !scene.url) throw new Error("当前课程场景图不可用，请取消参考后重新生成");
    references.push({
        id: "current-course-scene",
        name: "当前课程场景",
        type: "image",
        dataUrl: scene.url,
        url: scene.url,
        storageKey: scene.assetId,
    });
    return references;
}

const ltxSizes: Record<CourseSceneAspectRatio, string> = {
    "16:9": "1024x576",
    "4:3": "1024x768",
    "1:1": "768x768",
    "9:16": "1088x1920",
};

export function courseSceneLtxSize(model: string, ratio: CourseSceneAspectRatio) {
    const capabilities = modelConfigForModel(model).ltxCapabilities as { workflows?: Array<{ inputMode?: string; aspectRatioPresets?: Array<{ options?: Array<{ value?: string }> }> }> } | undefined;
    const workflow = capabilities?.workflows?.find((item) => item.inputMode === "multimodal");
    const size = ltxSizes[ratio];
    const supported = workflow?.aspectRatioPresets?.some((group) => group.options?.some((option) => option.value === size));
    if (!supported) throw new Error(`LTX 不支持课程画面的 ${ratio} 比例`);
    return size;
}
