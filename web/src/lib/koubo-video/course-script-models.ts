import { decodeChannelModel, providerCapabilityForModel, providerIdForModel, type AiConfig } from "@/stores/use-config-store";

export function courseScriptModels(config: AiConfig) {
    return config.textModels.filter((model) => providerCapabilityForModel(model) === "llm"
        && ["gemini", "ark"].includes(providerIdForModel(model) || ""));
}

export function courseScriptModelOption(config: AiConfig, modelId: string | null) {
    return courseScriptModels(config).find((model) => decodeChannelModel(model)?.channelId === modelId) || "";
}
