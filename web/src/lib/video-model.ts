import type { AiConfig } from "@/stores/use-config-store";

export function activeVideoModel(config: Pick<AiConfig, "model" | "videoModel">) {
    return config.videoModel || config.model;
}

export function bindActiveVideoModel<T extends Pick<AiConfig, "model" | "videoModel">>(config: T, model: string): T {
    return { ...config, model, videoModel: model };
}

export function usesLtxDirectPreview(providerId?: string) {
    return providerId === "ltx";
}
