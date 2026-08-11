import type { AiConfig } from "@/stores/use-config-store";
import type { ContentNodeType, ContentStage } from "@/types/content-production";

export function contentMediaStage(nodeType: ContentNodeType): ContentStage | null {
    if (nodeType === "image" || nodeType === "storyboard_prompt") return "storyboard_image";
    if (nodeType === "tts") return "tts";
    if (nodeType === "music") return "music";
    if (nodeType === "video") return "video";
    return null;
}

export function ltxMultimodalConfig<T extends Pick<AiConfig, "videoInputMode" | "videoSeconds">>(config: T): T & { videoInputMode: "multimodal" } {
    return { ...config, videoInputMode: "multimodal" };
}

export function mediaNodeTypeForAssetKind(kind: "image" | "video" | "audio", audioKind?: "speech" | "music"): ContentNodeType {
    if (kind === "image") return "image";
    if (kind === "video") return "video";
    return audioKind === "music" ? "music" : "tts";
}
