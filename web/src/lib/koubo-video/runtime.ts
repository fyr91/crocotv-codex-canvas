import { modelOptionLabel, modelOptionName, providerIdForModel, type AiConfig } from "@/stores/use-config-store";

export function isExpressiveSpeechModel(value: string) {
    return providerIdForModel(value) === "doubao_speech" && modelOptionName(value) === "seed-tts-2.0-expressive";
}

export function isLtx23VideoModel(value: string) {
    return providerIdForModel(value) === "ltx" && modelOptionName(value).startsWith("ltx-2.3");
}

export function isSeedream5LightImageModel(value: string) {
    return providerIdForModel(value) === "ark" && modelOptionName(value) === "doubao-seedream-5-0-260128";
}

export function isNanoBananaLiteImageModel(value: string) {
    return providerIdForModel(value) === "runware" && modelOptionName(value) === "google:nano-banana@2-lite";
}

export function expressiveSpeechModels(config: AiConfig) {
    return config.audioModels.filter(isExpressiveSpeechModel).map((value) => ({ value, label: modelOptionLabel(config, value) }));
}

export function ltx23VideoModels(config: AiConfig) {
    return config.videoModels.filter(isLtx23VideoModel).map((value) => ({ value, label: modelOptionLabel(config, value) }));
}

export function kouboImageModels(config: AiConfig) {
    return [
        ...config.imageModels.filter(isNanoBananaLiteImageModel),
        ...config.imageModels.filter(isSeedream5LightImageModel),
    ].map((value) => ({ value, label: modelOptionLabel(config, value) }));
}
