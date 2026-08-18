import type { CSSProperties } from "react";
import { AudioLines, Image as ImageIcon, LoaderCircle, MessageSquare, Music2, Play, Settings2, Square, Video } from "lucide-react";
import { Button, Segmented, Switch } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { audioModelForKind, defaultConfig, modelMatchesCapability, modelSupportsWebSearch, normalizeImageSizeForModel, normalizeVideoInputModeForModel, providerCapabilityForModel, providerIdForModel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { musicConfigFromMetadata, validateMusicGeneration } from "@/lib/music-generation";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasVideoInputModeControl } from "./canvas-video-input-mode-control";
import { CanvasMusicSettingsPanel } from "./canvas-music-settings-panel";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { stripNonTextComposerReferences, type VideoInputMode } from "@/lib/video-input-mode";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    mentionReferences: CanvasResourceReference[];
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onStop: (nodeId: string) => void;
    onComposerToggle: () => void;
};

export function CanvasConfigNodePanel({ node, isRunning, inputSummary, mentionReferences, onConfigChange, onGenerate, onStop, onComposerToggle }: CanvasConfigNodePanelProps) {
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = node.metadata?.generationMode || "image";
    const config = buildNodeConfig(globalConfig, node, mode);
    const music = musicConfigFromMetadata(node.metadata);
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const hasAnyInput = Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasComposerContent = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim());
    const canGenerate = mode === "music" ? !validateMusicGeneration(config.model, music) : hasComposerContent || (mode === "audio" ? inputSummary.textCount > 0 : hasAnyInput);
    const stripMediaMentions = (value: string, videoInputMode: VideoInputMode) => stripNonTextComposerReferences(value, mentionReferences.map((reference) => ({ nodeId: reference.nodeId, type: reference.kind })), videoInputMode === "referenceImages" || videoInputMode === "videoEdit" ? ["text", "image"] : ["text"]);
    const changeVideoSetting = (key: keyof AiConfig, value: string) => {
        if (key !== "videoInputMode") return onConfigChange(node.id, videoConfigPatch(key, value));
        const videoInputMode = value as VideoInputMode;
        onConfigChange(node.id, { ...videoModePatch(videoInputMode), ...(videoInputMode === "multimodal" ? {} : { composerContent: stripMediaMentions(node.metadata?.composerContent || "", videoInputMode) }) });
    };
    const changeModel = (model: string) => {
        if (mode === "image") return onConfigChange(node.id, { model, size: normalizeImageSizeForModel(model, config.size) });
        if (mode !== "video") return onConfigChange(node.id, { model });
        const videoInputMode = normalizeVideoInputModeForModel(model, node.metadata?.videoInputMode);
        onConfigChange(node.id, { model, videoInputMode, ...(providerIdForModel(model) === "ltx" || videoInputMode === "multimodal" ? {} : { composerContent: stripMediaMentions(node.metadata?.composerContent || "", videoInputMode) }) });
    };
    const changeGenerationMode = (generationMode: CanvasGenerationMode) => {
        const model = generationModeModel(globalConfig, node.metadata?.model, generationMode);
        if (generationMode !== "video") return onConfigChange(node.id, { generationMode, model });
        const videoModel = model;
        const videoInputMode = normalizeVideoInputModeForModel(videoModel, node.metadata?.videoInputMode || globalConfig.videoInputMode);
        onConfigChange(node.id, { generationMode, model: videoModel, videoInputMode, ...(providerIdForModel(videoModel) === "ltx" || videoInputMode === "multimodal" ? {} : { composerContent: stripMediaMentions(node.metadata?.composerContent || "", videoInputMode) }) });
    };

    return (
        <div className="flex h-full w-full cursor-move flex-col px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="shrink-0 text-sm font-semibold">生成模组</div>
                <div className="cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                    <Segmented
                        size="small"
                        className="canvas-config-mode !rounded-md !p-0.5"
                        value={mode}
                        onChange={(value) => changeGenerationMode(value as CanvasGenerationMode)}
                        options={[
                            {
                                value: "image",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <ImageIcon className="size-3.5" />
                                        生图
                                    </span>
                                ),
                            },
                            {
                                value: "text",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <MessageSquare className="size-3.5" />
                                        文本
                                    </span>
                                ),
                            },
                            {
                                value: "video",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Video className="size-3.5" />
                                        视频
                                    </span>
                                ),
                            },
                            {
                                value: "audio",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <AudioLines className="size-3.5" />
                                        音频
                                    </span>
                                ),
                            },
                            {
                                value: "music",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Music2 className="size-3.5" />
                                        音乐
                                    </span>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
                <InputChip label="提示词" value={`${inputSummary.textCount} 个`} style={chipStyle} />
                <InputChip label="参考图" value={`${inputSummary.imageCount} 张`} style={chipStyle} />
                <InputChip label="参考视频" value={`${inputSummary.videoCount} 个`} style={chipStyle} />
                <InputChip label="参考音频" value={`${inputSummary.audioCount} 个`} style={chipStyle} />
                {mode === "music" ? null : <button type="button" className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px]" style={chipStyle} onMouseDown={(event) => event.stopPropagation()} onClick={onComposerToggle}><Settings2 className="size-3.5" />组装提示词</button>}
            </div>

            <div className={`mb-2 grid min-w-0 cursor-default items-center gap-2 ${mode === "video" ? "grid-cols-[minmax(0,1fr)_96px_124px]" : mode === "image" || mode === "audio" ? "grid-cols-[minmax(0,1fr)_148px]" : "grid-cols-1"}`} onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex min-w-0 gap-1">
                    <ModelPicker className="canvas-compact-control h-10" config={config} value={(mode === "audio" && providerCapabilityForModel(config.model) !== "speech") || (mode === "music" && providerCapabilityForModel(config.model) !== "music") ? "" : config.model} onChange={changeModel} capability={mode === "music" ? "audio" : mode} providerCapability={mode === "audio" ? "speech" : mode === "music" ? "music" : undefined} onMissingConfig={() => openConfigDialog(true)} fullWidth />
                    {mode === "text" && modelSupportsWebSearch(config.model) ? <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2 text-xs" style={chipStyle}><span>Web Search</span><Switch size="small" checked={node.metadata?.webSearch === true} onChange={(webSearch) => onConfigChange(node.id, { webSearch })} /></label> : null}
                </div>
                {mode === "video" ? (
                    <>
                        <CanvasVideoInputModeControl config={config} className="canvas-compact-control h-10 w-full" onChange={(videoInputMode) => changeVideoSetting("videoInputMode", videoInputMode)} />
                        <CanvasVideoSettingsPopover config={config} placement="topRight" buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2" onConfigChange={changeVideoSetting} />
                    </>
                ) : mode === "image" ? (
                    <CanvasImageSettingsPopover config={config} placement="topRight" autoAdjustOverflow={false} buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2" onConfigChange={(key, value) => onConfigChange(node.id, imageConfigPatch(key, value))} />
                ) : mode === "audio" ? (
                    <CanvasAudioSettingsPopover config={config} placement="topRight" buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                ) : null}
            </div>

            {mode === "music" ? <div data-canvas-scroll className="thin-scrollbar mb-2 min-h-0 flex-1 overflow-y-auto pr-1"><CanvasMusicSettingsPanel music={music} model={config.model} references={mentionReferences} compact onChange={(patch) => onConfigChange(node.id, patch)} /></div> : null}

            <Button
                type="primary"
                className="mt-auto !h-9 !w-full !cursor-pointer !rounded-lg"
                danger={isRunning}
                disabled={!isRunning && !canGenerate}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => (isRunning ? onStop(node.id) : onGenerate(node.id))}
            >
                <span className="inline-flex items-center gap-1.5">
                    {isRunning ? (
                        <>
                            <LoaderCircle className="size-4 animate-spin" />
                            <Square className="size-3.5 fill-current" />
                            <span>停止</span>
                        </>
                    ) : (
                        <>
                            <Play className="size-4" />
                            <span>开始生成</span>
                        </>
                    )}
                </span>
            </Button>
        </div>
    );
}

export function generationModeModel(globalConfig: AiConfig, currentModel: string | undefined, mode: CanvasGenerationMode) {
    const matches = mode === "music"
        ? providerCapabilityForModel(currentModel || "") === "music"
        : mode === "audio"
            ? providerCapabilityForModel(currentModel || "") === "speech"
            : Boolean(currentModel && modelMatchesCapability(currentModel, mode));
    if (matches) return currentModel || "";
    if (mode === "image") return globalConfig.imageModel;
    if (mode === "video") return globalConfig.videoModel;
    if (mode === "audio") return audioModelForKind(globalConfig, "speech");
    if (mode === "music") return audioModelForKind(globalConfig, "music");
    return globalConfig.textModel;
}

function InputChip({ label, value, style }: { label: string; value: string; style: CSSProperties }) {
    return (
        <div className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]" style={style}>
            <span>{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? audioModelForKind(globalConfig, "speech") : mode === "music" ? audioModelForKind(globalConfig, "music") : globalConfig.textModel;
    const fallbackModel = mode === "image" ? defaultConfig.imageModel : mode === "video" ? defaultConfig.videoModel : mode === "audio" ? audioModelForKind(defaultConfig, "speech") : mode === "music" ? audioModelForKind(defaultConfig, "music") : defaultConfig.textModel;
    const currentModel = node.metadata?.model;
    const currentMatches = mode === "music" ? providerCapabilityForModel(currentModel || "") === "music" : mode === "audio" ? providerCapabilityForModel(currentModel || "") === "speech" : Boolean(currentModel && modelMatchesCapability(currentModel, mode));
    const model = currentModel && currentMatches
        ? currentModel
        : defaultModel
            ? defaultModel
            : fallbackModel;
    return {
        ...globalConfig,
        model,
        videoModel: mode === "video" ? model : globalConfig.videoModel,
        imagePromptOptimize: node.metadata?.optimizePrompt == null ? globalConfig.imagePromptOptimize : String(node.metadata.optimizePrompt),
        imageWebSearch: node.metadata?.imageWebSearch == null ? globalConfig.imageWebSearch : String(node.metadata.imageWebSearch),
        imageSearch: node.metadata?.imageSearch == null ? globalConfig.imageSearch : String(node.metadata.imageSearch),
        size: mode === "image" ? normalizeImageSizeForModel(model, node.metadata?.size || globalConfig.size || defaultConfig.size) : node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        videoReturnLastFrame: node.metadata?.returnLastFrame || globalConfig.videoReturnLastFrame || defaultConfig.videoReturnLastFrame,
        videoPromptEnhance: node.metadata?.videoPromptEnhance || globalConfig.videoPromptEnhance || defaultConfig.videoPromptEnhance,
        videoStage1Review: node.metadata?.videoStage1Review || globalConfig.videoStage1Review || defaultConfig.videoStage1Review,
        videoAudioSetting: node.metadata?.videoAudioSetting || globalConfig.videoAudioSetting || defaultConfig.videoAudioSetting,
        videoInputMode: normalizeVideoInputModeForModel(model, node.metadata?.videoInputMode || globalConfig.videoInputMode),
        videoReferenceSizePolicy: node.metadata?.videoReferenceSizePolicy || globalConfig.videoReferenceSizePolicy || "match",
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioVolume: node.metadata?.audioVolume || globalConfig.audioVolume || defaultConfig.audioVolume,
        audioPitch: node.metadata?.audioPitch || globalConfig.audioPitch || defaultConfig.audioPitch,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
        videoCount: String(node.metadata?.videoCount || globalConfig.videoCount || defaultConfig.videoCount),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoReturnLastFrame") return { returnLastFrame: value };
    if (key === "videoPromptEnhance") return { videoPromptEnhance: value };
    if (key === "videoStage1Review") return { videoStage1Review: value };
    if (key === "videoCount") return { videoCount: value };
    if (key === "videoAudioSetting") return { videoAudioSetting: value as "auto" | "origin" };
    return { [key]: value };
}

function videoModePatch(videoInputMode: VideoInputMode) {
    if (videoInputMode === "firstFrame") return { videoInputMode, videoLastFrameNodeId: undefined, videoEditSourceNodeId: undefined, videoReferenceImageNodeIds: undefined };
    if (videoInputMode === "referenceImages") return { videoInputMode, videoFirstFrameNodeId: undefined, videoLastFrameNodeId: undefined, videoEditSourceNodeId: undefined };
    if (videoInputMode === "videoEdit") return { videoInputMode, videoFirstFrameNodeId: undefined, videoLastFrameNodeId: undefined, videoReferenceImageNodeIds: undefined };
    return { videoInputMode, videoFirstFrameNodeId: undefined, videoLastFrameNodeId: undefined, videoEditSourceNodeId: undefined, videoReferenceImageNodeIds: undefined };
}

function imageConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "count") return { count: Number(value) || 1 };
    if (key === "imagePromptOptimize") return { optimizePrompt: value === "true" };
    if (key === "imageWebSearch") return { imageWebSearch: value === "true" };
    if (key === "imageSearch") return { imageSearch: value === "true" };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    if (key === "audioVolume") return { audioVolume: value };
    if (key === "audioPitch") return { audioPitch: value };
    return { audioInstructions: value };
}
