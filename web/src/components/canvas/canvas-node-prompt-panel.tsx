import { useEffect, useState } from "react";
import { ArrowUp, LoaderCircle, Square } from "lucide-react";
import { Button, Switch } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { audioModelForKind, defaultConfig, modelMatchesCapability, modelSupportsWebSearch, normalizeImageSizeForModel, normalizeVideoInputModeForModel, providerCapabilityForModel, providerIdForModel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { musicConfigFromMetadata, validateMusicGeneration } from "@/lib/music-generation";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasVideoInputModeControl } from "./canvas-video-input-mode-control";
import { CanvasMusicSettingsPanel } from "./canvas-music-settings-panel";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { stripNonTextPromptReferences, type VideoInputMode } from "@/lib/video-input-mode";
import { CanvasVideoFrameFields } from "./canvas-video-frame-fields";
import { CanvasVideoReferenceFields } from "./canvas-video-reference-fields";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    contentHeight: number;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onImageSettingsOpenChange?: (open: boolean) => void;
};

export function CanvasNodePromptPanel({ node, contentHeight, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const music = musicConfigFromMetadata(node.metadata);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent;
    const editablePrompt = node.metadata?.promptDraft ?? node.metadata?.prompt ?? "";
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : editablePrompt);
    const automaticLtxMode = mode === "video" && providerIdForModel(config.model) === "ltx";
    const miniMaxH3Multimodal = mode === "video" && providerIdForModel(config.model) === "minimax_h3" && config.videoInputMode === "multimodal";
    const preserveNodeReferenceTokens = /@\[node:[^\]]+\]/.test(prompt);

    useEffect(() => {
        setPrompt(isEditingExistingContent ? "" : editablePrompt);
    }, [isEditingExistingContent, node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (!isEditingExistingContent) onPromptChange(node.id, value);
    };
    const allowsInlineImages = config.videoInputMode === "referenceImages" || config.videoInputMode === "videoEdit";
    const promptReferences = miniMaxH3Multimodal
        ? mentionReferences.filter((reference) => ["text", "image", "audio"].includes(reference.kind))
        : mode === "video" && !automaticLtxMode && config.videoInputMode !== "multimodal"
          ? mentionReferences.filter((reference) => reference.kind === "text" || (allowsInlineImages && reference.kind === "image"))
          : mentionReferences;
    const frameImages = mentionReferences.filter((reference) => reference.kind === "image").map((reference) => ({ nodeId: reference.nodeId, label: reference.label, title: reference.title }));
    const videos = mentionReferences.filter((reference) => reference.kind === "video").map((reference) => ({ nodeId: reference.nodeId, label: reference.label, title: reference.title }));
    const stripMediaMentions = (value: string, videoInputMode: VideoInputMode) => stripNonTextPromptReferences(value, mentionReferences, videoInputMode === "referenceImages" || videoInputMode === "videoEdit" ? ["text", "image"] : ["text"]);
    const changeVideoSetting = (key: keyof AiConfig, value: string) => {
        if (key !== "videoInputMode") return onConfigChange(node.id, videoConfigPatch(key, value));
        const videoInputMode = value as VideoInputMode;
        if (videoInputMode !== "multimodal") updatePrompt(stripMediaMentions(prompt, videoInputMode));
        onConfigChange(node.id, videoModePatch(videoInputMode));
    };
    const changeVideoModel = (model: string) => {
        const videoInputMode = normalizeVideoInputModeForModel(model, node.metadata?.videoInputMode);
        if (providerIdForModel(model) !== "ltx" && videoInputMode !== "multimodal") updatePrompt(stripMediaMentions(prompt, videoInputMode));
        onConfigChange(node.id, { model, videoInputMode });
    };

    const submit = () => {
        if (mode === "music") {
            if (isRunning || validateMusicGeneration(config.model, music)) return;
            onGenerate(node.id, mode, music.description);
            return;
        }
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
        setPrompt("");
    };

    if (mode === "music") {
        return (
            <div className="rounded-2xl border p-3 shadow-2xl backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
                <div data-canvas-scroll className="thin-scrollbar overflow-y-auto overscroll-contain pr-1" style={{ height: contentHeight }}>
                    <CanvasMusicSettingsPanel music={music} model={config.model} references={mentionReferences} onChange={(patch) => onConfigChange(node.id, patch)} />
                </div>
                <div className="mt-3 flex shrink-0 items-center justify-between gap-2">
                    <ModelPicker config={config} value={providerCapabilityForModel(config.model) === "music" ? config.model : ""} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" providerCapability="music" onMissingConfig={() => openConfigDialog(true)} />
                    <Button type="primary" className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3" danger={isRunning} disabled={!isRunning && Boolean(validateMusicGeneration(config.model, music))} onClick={() => (isRunning ? onStop(node.id) : submit())} aria-label={isRunning ? "停止生成" : "生成"}>
                        <span className="flex items-center gap-1.5">{isRunning ? <><LoaderCircle className="size-4 animate-spin" /><Square className="size-3.5 fill-current" /><span className="text-xs font-medium">停止</span></> : <ArrowUp className="size-4" />}</span>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {mode === "video" ? <CanvasVideoFrameFields mode={automaticLtxMode ? "multimodal" : config.videoInputMode} allowMultimodalFrames={automaticLtxMode} images={frameImages} firstFrameNodeId={node.metadata?.videoFirstFrameNodeId} lastFrameNodeId={node.metadata?.videoLastFrameNodeId} onFirstFrameChange={(videoFirstFrameNodeId) => onConfigChange(node.id, { videoFirstFrameNodeId })} onLastFrameChange={(videoLastFrameNodeId) => onConfigChange(node.id, { videoLastFrameNodeId })} /> : null}
            {mode === "video" && config.videoInputMode === "videoEdit" ? <CanvasVideoReferenceFields videos={videos} selectedVideoNodeId={node.metadata?.videoEditSourceNodeId} onVideoChange={(videoEditSourceNodeId) => onConfigChange(node.id, { videoEditSourceNodeId })} /> : null}
            <CanvasResourceMentionTextarea
                value={prompt}
                references={promptReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                copyCurrentInput={mode === "image" || mode === "video" || mode === "audio"}
                serializeReferenceAsNodeToken={preserveNodeReferenceTokens}
                className="w-full rounded-xl border px-3 py-2 text-sm leading-7"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, height: contentHeight }}
                placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
            />

            <div className="mt-2 flex min-w-0 shrink-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model, size: normalizeImageSizeForModel(model, config.size) })} capability="image" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, imageConfigPatch(key, value))}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={changeVideoModel} capability="video" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoInputModeControl config={config} className="canvas-compact-control h-10 w-24 shrink-0" onChange={(videoInputMode) => changeVideoSetting("videoInputMode", videoInputMode)} />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[108px] !justify-start !rounded-full !px-3" onConfigChange={changeVideoSetting} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker config={config} value={providerCapabilityForModel(config.model) === "speech" ? config.model : ""} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" providerCapability="speech" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} />
                            {modelSupportsWebSearch(config.model) ? <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs" style={{ borderColor: theme.node.stroke }}><span>Web Search</span><Switch size="small" checked={node.metadata?.webSearch === true} onChange={(webSearch) => onConfigChange(node.id, { webSearch })} /></label> : null}
                        </>
                    )}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    danger={isRunning}
                    disabled={!isRunning && !prompt.trim()}
                    onClick={() => (isRunning ? onStop(node.id) : submit())}
                    aria-label={isRunning ? "停止生成" : "生成"}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-4 animate-spin" />
                                <Square className="size-3.5 fill-current" />
                                <span className="text-xs font-medium">停止</span>
                            </>
                        ) : (
                            <ArrowUp className="size-4" />
                        )}
                    </span>
                </Button>
            </div>
        </div>
    );
}

function videoModePatch(videoInputMode: VideoInputMode) {
    if (videoInputMode === "firstFrame") return { videoInputMode, videoLastFrameNodeId: undefined, videoEditSourceNodeId: undefined, videoReferenceImageNodeIds: undefined };
    if (videoInputMode === "referenceImages") return { videoInputMode, videoFirstFrameNodeId: undefined, videoLastFrameNodeId: undefined, videoEditSourceNodeId: undefined };
    if (videoInputMode === "videoEdit") return { videoInputMode, videoFirstFrameNodeId: undefined, videoLastFrameNodeId: undefined, videoReferenceImageNodeIds: undefined };
    return { videoInputMode, videoFirstFrameNodeId: undefined, videoLastFrameNodeId: undefined, videoEditSourceNodeId: undefined, videoReferenceImageNodeIds: undefined };
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : type === CanvasNodeType.Music ? "music" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
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

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "描述要生成的视频内容";
    if (mode === "audio") return "描述要生成的音频内容";
    if (mode === "image") return hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容";
    return hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
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
