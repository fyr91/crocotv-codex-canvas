import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import { normalizeImageSizePresets, resolveImageSizeSelection } from "@/lib/image-generation-size";
import { normalizeInputModalities, type CanvasInputModality } from "@/lib/canvas/canvas-split";
import { normalizeVideoInputModes, resolveVideoInputMode, type VideoInputMode } from "@/lib/video-input-mode";

export type ApiCallFormat = "openai" | "gemini";

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: string[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    speechModel: string;
    musicModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioVolume: string;
    audioPitch: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoAudioSetting: "auto" | "origin";
    videoReturnLastFrame: string;
    videoPromptEnhance: string;
    videoStage1Review: string;
    videoCount: string;
    videoInputMode: VideoInputMode;
    videoReferenceSizePolicy?: "match" | "max";
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    imagePromptOptimize: string;
    imageWebSearch: string;
    imageSearch: string;
    size: string;
    count: string;
    canvasImageCount: string;
};

export type WebdavSyncConfig = {
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};
export type ConfigTabKey = "channels" | "models" | "preferences" | "webdav";

export const CONFIG_STORE_KEY = "crocotv:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: "",
    apiKey: "",
    apiFormat: "openai",
    channels: [],
    model: "",
    imageModel: "",
    videoModel: "",
    textModel: "",
    speechModel: "",
    musicModel: "",
    audioVoice: "",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioVolume: "1",
    audioPitch: "0",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "480",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoAudioSetting: "auto",
    videoReturnLastFrame: "true",
    videoPromptEnhance: "true",
    videoStage1Review: "false",
    videoCount: "1",
    videoInputMode: "multimodal",
    videoReferenceSizePolicy: "match",
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    imagePromptOptimize: "false",
    imageWebSearch: "false",
    imageSearch: "false",
    size: "2K",
    count: "1",
    canvasImageCount: "1",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    url: "",
    username: "",
    password: "",
    directory: "crocotv",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
    setProviderCatalog: (models: ProviderCatalogModel[]) => void;
};

export type ProviderCatalogModel = { id: string; provider_id: string; capability: "llm" | "image" | "video" | "speech" | "music"; model_key: string; display_name: string; config: Record<string, unknown>; is_default: boolean };
const catalogCapabilities = new Map<string, ModelCapability>();
const providerCapabilities = new Map<string, ProviderCatalogModel["capability"]>();
const catalogProviderIds = new Map<string, string>();
const catalogDisplayNames = new Map<string, string>();
const catalogModelConfigs = new Map<string, Record<string, unknown>>();

function isVideoModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo");
}

function isImageModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    const catalogCapability = catalogCapabilities.get(model);
    if (catalogCapability) return catalogCapability === capability;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function providerCapabilityForModel(model: string) {
    return providerCapabilities.get(model);
}

export function providerIdForModel(model: string) {
    return catalogProviderIds.get(model);
}

export function modelConfigForModel(model: string) {
    return catalogModelConfigs.get(model) || {};
}

export function modelSupportsWebSearch(model: string) {
    return catalogModelConfigs.get(model)?.webSearch === true;
}

export function modelSupportsImagePromptOptimize(model: string) {
    return catalogModelConfigs.get(model)?.supportsPromptOptimize !== false;
}

export function modelSupportsImageWebSearch(model: string) {
    return catalogModelConfigs.get(model)?.imageWebSearch === true;
}

export function modelSupportsImageSearch(model: string) {
    return catalogModelConfigs.get(model)?.imageSearch === true;
}

export function modelSupportsMaskEdit(model: string) {
    return catalogModelConfigs.get(model)?.supportsMaskEdit !== false;
}

export function imageSizePresetsForModel(model: string) {
    return normalizeImageSizePresets(catalogModelConfigs.get(model)?.imageSizePresets);
}

export function normalizeImageSizeForModel(model: string, size?: string) {
    return resolveImageSizeSelection(imageSizePresetsForModel(model), size).size;
}

export function inputModalitiesForModel(model: string) {
    return normalizeInputModalities(catalogModelConfigs.get(model)?.inputModalities);
}

export function videoInputModesForModel(model: string) {
    return normalizeVideoInputModes(catalogModelConfigs.get(model)?.videoInputModes);
}

export function normalizeVideoInputModeForModel(model: string, value?: string) {
    return resolveVideoInputMode(videoInputModesForModel(model), value);
}

export function modelSupportsInputModalities(model: string, required: CanvasInputModality[]) {
    const supported = inputModalitiesForModel(model);
    return required.every((modality) => supported.includes(modality));
}

export function selectableModelsByInputModalities(config: AiConfig, required: CanvasInputModality[]) {
    return config.textModels.filter((model) => modelSupportsInputModalities(model, required));
}

export function audioModelForKind(config: AiConfig, kind: "speech" | "music") {
    const preferred = kind === "music" ? config.musicModel : config.speechModel;
    if (providerCapabilityForModel(preferred) === kind) return preferred;
    return config.audioModels.find((model) => providerCapabilityForModel(model) === kind) || "";
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    return Boolean(model.trim() && config.models.includes(model));
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => set({ isConfigOpen: true, shouldPromptContinue, configTab }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
            setProviderCatalog: (models) => set((state) => {
                catalogCapabilities.clear();
                providerCapabilities.clear();
                catalogProviderIds.clear();
                catalogDisplayNames.clear();
                catalogModelConfigs.clear();
                const options = models.map((item) => {
                    const value = encodeChannelModel(item.id, item.model_key);
                    const capability = item.capability === "llm" ? "text" : item.capability === "speech" || item.capability === "music" ? "audio" : item.capability;
                    for (const key of [value, item.model_key]) {
                        catalogCapabilities.set(key, capability);
                        providerCapabilities.set(key, item.capability);
                        catalogProviderIds.set(key, item.provider_id);
                        catalogDisplayNames.set(key, item.display_name);
                        catalogModelConfigs.set(key, item.config || {});
                    }
                    return value;
                });
                const byCapability = (capability: ModelCapability) => options.filter((value) => catalogCapabilities.get(value) === capability);
                const byProviderCapability = (capability: ProviderCatalogModel["capability"]) => options.filter((value) => providerCapabilities.get(value) === capability);
                const preferred = (capability: ModelCapability, current: string) => {
                    const candidates = byCapability(capability);
                    if (candidates.includes(current)) return current;
                    const selected = models.find((item) => (item.capability === "llm" ? "text" : item.capability === "speech" || item.capability === "music" ? "audio" : item.capability) === capability && item.is_default);
                    return selected ? encodeChannelModel(selected.id, selected.model_key) : candidates[0] || "";
                };
                const preferredProvider = (capability: "speech" | "music", current: string) => {
                    const candidates = byProviderCapability(capability);
                    if (candidates.includes(current)) return current;
                    const selected = models.find((item) => item.capability === capability && item.is_default);
                    return selected ? encodeChannelModel(selected.id, selected.model_key) : candidates[0] || "";
                };
                const channels = models.map((item) => ({ id: item.id, name: item.display_name, baseUrl: "", apiKey: "", apiFormat: "openai" as const, models: [item.model_key] }));
                const imageModel = preferred("image", state.config.imageModel);
                return { config: { ...state.config, baseUrl: "", apiKey: "", channels, models: options, imageModels: byCapability("image"), videoModels: byCapability("video"), textModels: byCapability("text"), audioModels: byCapability("audio"), imageModel, videoModel: preferred("video", state.config.videoModel), textModel: preferred("text", state.config.textModel), speechModel: preferredProvider("speech", state.config.speechModel), musicModel: preferredProvider("music", state.config.musicModel), model: options.includes(state.config.model) ? state.config.model : imageModel || options[0] || "" } };
            }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: { ...state.config, baseUrl: "", apiKey: "", channels: [], models: [], imageModels: [], videoModels: [], textModels: [], audioModels: [] }, webdav: defaultWebdavSyncConfig }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = Object.fromEntries(Object.entries(persistedState.config || {}).filter(([key]) => key in defaultConfig)) as Partial<AiConfig>;
                const config = { ...defaultConfig, ...persistedConfig, baseUrl: "", apiKey: "", channels: [], models: [], imageModels: [], videoModels: [], textModels: [], audioModels: [] };
                return {
                    ...current,
                    webdav: defaultWebdavSyncConfig,
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        imageModel: config.imageModel || "",
                        videoModel: config.videoModel || "",
                        textModel: config.textModel || "",
                        speechModel: config.speechModel || "",
                        musicModel: config.musicModel || "",
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioVolume: config.audioVolume || defaultConfig.audioVolume,
                        audioPitch: config.audioPitch || defaultConfig.audioPitch,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "480",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        videoAudioSetting: config.videoAudioSetting === "origin" ? "origin" : "auto",
                        videoReturnLastFrame: config.videoReturnLastFrame === "false" ? "false" : "true",
                        videoPromptEnhance: config.videoPromptEnhance === "false" ? "false" : "true",
                        videoStage1Review: config.videoStage1Review === "true" ? "true" : "false",
                        videoCount: /^([1-8])$/.test(config.videoCount || "") ? config.videoCount : "1",
                        imagePromptOptimize: config.imagePromptOptimize === "true" ? "true" : "false",
                        imageWebSearch: config.imageWebSearch === "true" ? "true" : "false",
                        imageSearch: config.imageSearch === "true" ? "true" : "false",
                        size: typeof config.size === "string" && config.size.trim() ? config.size : defaultConfig.size,
                        canvasImageCount: defaultConfig.canvasImageCount,
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[], channels: ModelChannel[]) {
    const allModelOptions = channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model)));
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)))
        .map((model) => normalizeModelOptionValue(model, channels))
        .filter((model) => !allModelOptions.length || allModelOptions.includes(model) || !isChannelModelValue(model));
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || "新渠道",
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        apiFormat,
        models: uniqueRawModels(channel?.models || []),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const catalogLabel = catalogDisplayNames.get(value);
    if (catalogLabel) return catalogLabel;
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel?.name || decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.includes(decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.includes(model)) || channels[0];
    return channel && channel.models.includes(model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.includes(model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: "默认渠道", baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
            models: uniqueRawModels(channel.models || []),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: "默认渠道",
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: uniqueRawModels([
                    ...(config.models || []),
                    config.model,
                    config.imageModel,
                    config.videoModel,
                    config.textModel,
                    config.speechModel,
                    config.musicModel,
                ]),
            }),
        );
    }
    return channels.map((channel) => ({ ...channel, models: uniqueRawModels(channel.models) }));
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    return apiFormat === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? "gemini" : "openai";
}

function uniqueRawModels(models: string[]) {
    return Array.from(new Set((models || []).map((model) => modelOptionName(model).trim()).filter(Boolean)));
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
