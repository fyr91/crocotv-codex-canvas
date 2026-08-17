import type { ReactNode } from "react";
import { useEffect } from "react";
import { ProConfigProvider } from "@ant-design/pro-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { useExclusiveMediaPlayback } from "@/hooks/use-exclusive-media-playback";
import { getAntThemeConfig } from "@/lib/app-theme";
import { initializeSharedTheme, readSharedThemeCookie, subscribeSharedTheme } from "@/lib/shared-theme";
import { useConfigStore, type ProviderCatalogModel } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } } });
const imageSizePresets = {
    "1K": { auto: "1K", "1:1": "1024x1024", "4:3": "1200x896", "3:4": "896x1200", "3:2": "1264x848", "2:3": "848x1264", "16:9": "1376x768", "9:16": "768x1376", "21:9": "1584x672" },
};
const h3Settings = {
    qualities: [
        { id: "preview", label: "480p", ratios: [{ label: "480p", ratio: "16:9", size: "864x480", width: 864, height: 480, recommended: true }] },
        { id: "base_768p", label: "720p", ratios: [{ label: "720p", ratio: "16:9", size: "1344x768", width: 1344, height: 768 }] },
        { id: "standard_480p", label: "480p", ratios: [{ label: "480p", ratio: "4:3", size: "640x480", width: 640, height: 480 }] },
        { id: "standard_768p", label: "720p", ratios: [{ label: "720p", ratio: "4:3", size: "1024x768", width: 1024, height: 768 }] },
        { id: "portrait_preview", label: "480p", ratios: [{ label: "480p", ratio: "9:16", size: "480x864", width: 480, height: 864 }] },
        { id: "portrait_768p", label: "720p", ratios: [{ label: "720p", ratio: "9:16", size: "768x1344", width: 768, height: 1344 }] },
        { id: "standard_portrait_480p", label: "480p", ratios: [{ label: "480p", ratio: "3:4", size: "480x640", width: 480, height: 640 }] },
        { id: "standard_portrait_768p", label: "720p", ratios: [{ label: "720p", ratio: "3:4", size: "768x1024", width: 768, height: 1024 }] },
    ],
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    counts: [1, 2, 3],
    supports: { promptEnhance: true },
};
const localModels: ProviderCatalogModel[] = [
    { id: "coding-plan-doubao-turbo", provider_id: "coding_plan", capability: "llm", model_key: "doubao-seed-2.1-turbo", display_name: "豆包 Seed 2.1 Turbo", is_default: true, config: { inputModalities: ["text", "image"] } },
    { id: "coding-plan-deepseek-flash", provider_id: "coding_plan", capability: "llm", model_key: "deepseek-v4-flash", display_name: "DeepSeek V4 Flash", is_default: false, config: { inputModalities: ["text"] } },
    { id: "coding-plan-deepseek-pro", provider_id: "coding_plan", capability: "llm", model_key: "deepseek-v4-pro", display_name: "DeepSeek V4 Pro", is_default: false, config: { inputModalities: ["text"] } },
    { id: "coding-plan-minimax-m3", provider_id: "coding_plan", capability: "llm", model_key: "minimax-m3", display_name: "MiniMax M3", is_default: false, config: { inputModalities: ["text"] } },
    { id: "coding-plan-kimi-k3", provider_id: "coding_plan", capability: "llm", model_key: "kimi-k3", display_name: "Kimi K3", is_default: false, config: { inputModalities: ["text"] } },
    { id: "coding-plan-glm-53", provider_id: "coding_plan", capability: "llm", model_key: "glm-5.3", display_name: "GLM 5.3", is_default: false, config: { inputModalities: ["text"] } },
    { id: "bigmodel-glm-5v", provider_id: "bigmodel", capability: "llm", model_key: "glm-5v-turbo", display_name: "GLM 5V Turbo", is_default: false, config: { inputModalities: ["text", "image", "video"] } },
    { id: "runware-gemini-pro", provider_id: "runware", capability: "llm", model_key: "google:gemini@3.1-pro", display_name: "Runware · Gemini 3.1 Pro", is_default: false, config: { inputModalities: ["text", "image", "video", "audio"] } },
    { id: "runware-gemini-flash", provider_id: "runware", capability: "llm", model_key: "google:gemini@3-flash", display_name: "Runware · Gemini 3 Flash", is_default: false, config: { inputModalities: ["text", "image", "video", "audio"] } },
    { id: "runware-gemini-flash-lite", provider_id: "runware", capability: "llm", model_key: "google:gemini@3.1-flash-lite", display_name: "Runware · Gemini 3.1 Flash Lite", is_default: false, config: { inputModalities: ["text", "image", "video", "audio"] } },
    { id: "runware-lite", provider_id: "runware", capability: "image", model_key: "google:nano-banana@2-lite", display_name: "Nano Banana 2 Lite", is_default: true, config: { imageSizePresets, maxInputAssets: 14, supportsPromptOptimize: false, supportsMaskEdit: false, inputModalities: ["text", "image"] } },
    { id: "runware-nano", provider_id: "runware", capability: "image", model_key: "google:4@1", display_name: "Nano Banana", is_default: false, config: { imageSizePresets, maxInputAssets: 14, supportsPromptOptimize: false, supportsMaskEdit: false, inputModalities: ["text", "image"] } },
    { id: "runware-gpt-image-02", provider_id: "runware", capability: "image", model_key: "openai:gpt-image@2", display_name: "GPT Image 02", is_default: false, config: { imageSizePresets, maxInputAssets: 8, supportsPromptOptimize: false, supportsMaskEdit: false, inputModalities: ["text", "image"] } },
    { id: "minimax-h3", provider_id: "minimax_h3", capability: "video", model_key: "minimax-h3", display_name: "MiniMax H3", is_default: true, config: { capabilitiesSource: "minimax-h3-fixed-v3", maxPromptChars: 20_000, videoInputModes: ["text", "firstFrame", "firstLastFrame", "multimodal"], inputLimits: { firstFrame: { images: { min: 1, max: 1 } }, firstLastFrame: { images: { min: 2, max: 2 } }, multimodal: { images: { min: 1, max: 9 }, audios: { min: 0, max: 3 } } }, videoSettingsByInputMode: { text: h3Settings, firstFrame: h3Settings, firstLastFrame: h3Settings, multimodal: h3Settings }, inputModalities: ["text", "image", "audio"] } },
    { id: "volc-speech", provider_id: "volcengine", capability: "speech", model_key: "volcengine:seed-tts-2.0-expressive", display_name: "火山引擎 Seed-TTS 2.0", is_default: true, config: { inputModalities: ["text"] } },
    { id: "suno-music", provider_id: "suno", capability: "music", model_key: "V4_5ALL", display_name: "Suno V4.5 All", is_default: true, config: { inputModalities: ["text"] } },
];

export function AppProviders({ children }: { children: ReactNode }) {
    useExclusiveMediaPlayback();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const setProviderCatalog = useConfigStore((state) => state.setProviderCatalog);
    useEffect(() => {
        setProviderCatalog(localModels);
    }, [setProviderCatalog]);
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        document.documentElement.style.colorScheme = theme;
    }, [theme]);
    useEffect(() => {
        let active = true;
        let receivedEvent = false;
        const applyTheme = (nextTheme: "light" | "dark") => {
            if (active && useThemeStore.getState().theme !== nextTheme) setTheme(nextTheme);
        };
        const unsubscribe = subscribeSharedTheme((nextTheme) => {
            receivedEvent = true;
            applyTheme(nextTheme);
        });
        const fallback = readSharedThemeCookie() ?? useThemeStore.getState().theme;
        void initializeSharedTheme(fallback).then((nextTheme) => {
            if (!receivedEvent) applyTheme(nextTheme);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [setTheme]);
    return <ConfigProvider locale={zhCN} theme={getAntThemeConfig(theme === "dark")}><ProConfigProvider dark={theme === "dark"}><App><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></App></ProConfigProvider></ConfigProvider>;
}
