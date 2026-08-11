import { modelConfigForModel, providerIdForModel, type AiConfig } from "@/stores/use-config-store";
import type { VideoInputMode } from "@/lib/video-input-mode";

export type LtxResolutionOption = {
    id: string;
    label: string;
    value: string;
    width: number;
    height: number;
    recommended: boolean;
    deliveryWidth?: number;
    deliveryHeight?: number;
    maxDurationSeconds?: number;
};

export type LtxWorkflowCapability = {
    workflowId: string;
    workflowVersion: string;
    inputMode: VideoInputMode;
    submissionMode: "jobs_v1" | "director_v3" | "jobs_v2" | "director_v5";
    defaultResolution: string;
    defaultNumFrames: number;
    defaultFps: number;
    defaultEnhancePrompt: boolean;
    supportsEnhancePrompt: boolean;
    supportsIncludeAudio: boolean;
    supportsStage1ManualReview?: boolean;
    aspectRatioPresets: Array<{ id: string; label: string; ratio: string; options: LtxResolutionOption[] }>;
    durationPolicy: { custom: boolean; minimumSeconds: number; maximumSeconds: number; stepSeconds: number; suggestedSeconds: number[] };
    durationPresets: Array<{ seconds: number; numFrames: number; actualSeconds: number; enabled: boolean }>;
    batchMaxItems: number;
};

export type LtxCapabilities = {
    provider: "ltx";
    workflows: LtxWorkflowCapability[];
    videoInputModes: VideoInputMode[];
    batchMaxItems: number;
};

export function isLtxVideoConfig(config: Pick<AiConfig, "model" | "videoModel">) {
    return providerIdForModel(config.model || config.videoModel) === "ltx";
}

export function ltxCapabilitiesForModel(model: string) {
    const value = modelConfigForModel(model).ltxCapabilities as LtxCapabilities | undefined;
    return value?.provider === "ltx" && Array.isArray(value.workflows) ? value : null;
}

export function ltxCapabilityErrorForModel(model: string) {
    const value = modelConfigForModel(model).ltxCapabilityError;
    return typeof value === "string" && value.trim() ? value : "";
}

export function resolveLtxVideoSelection(config: AiConfig) {
    const model = config.model || config.videoModel;
    const capabilities = ltxCapabilitiesForModel(model);
    if (!capabilities) return null;
    const workflow = capabilities.workflows.find((item) => item.inputMode === config.videoInputMode) || capabilities.workflows[0];
    if (!workflow) return null;
    const resolutions = workflow.aspectRatioPresets.flatMap((group) => group.options);
    const resolution = resolutions.some((item) => item.value === config.size) ? config.size : workflow.defaultResolution || resolutions[0]?.value || "";
    const resolutionOption = resolutions.find((item) => item.value === resolution);
    const enabledDurations = workflow.durationPresets.filter((item) =>
        item.enabled && (!resolutionOption?.maxDurationSeconds || item.seconds <= resolutionOption.maxDurationSeconds)
    );
    const defaultDuration = enabledDurations.find((item) => item.numFrames === workflow.defaultNumFrames)?.seconds
        || enabledDurations[0]?.seconds
        || workflow.durationPolicy.minimumSeconds;
    const requestedDuration = Number(config.videoSeconds);
    const duration = enabledDurations.some((item) => item.seconds === requestedDuration)
        ? requestedDuration
        : Number.isFinite(requestedDuration) && requestedDuration > 0
          ? [...enabledDurations].reverse().find((item) => item.seconds <= requestedDuration)?.seconds || defaultDuration
          : defaultDuration;
    const batchMaxItems = Math.max(1, Math.min(8, capabilities.batchMaxItems || workflow.batchMaxItems || 1));
    const requestedCount = Number(config.videoCount);
    const count = Number.isInteger(requestedCount) ? Math.max(1, Math.min(batchMaxItems, requestedCount)) : 1;
    return { capabilities, workflow, resolution, duration, count, batchMaxItems };
}

export function ltxGenerationParams(config: AiConfig) {
    const selection = resolveLtxVideoSelection(config);
    if (!selection) throw new Error(ltxCapabilityErrorForModel(config.model || config.videoModel) || "LTX GPU 当前没有返回可用参数");
    return {
        videoInputMode: selection.workflow.inputMode,
        duration: selection.duration,
        resolution: selection.resolution,
        count: selection.count,
        enhancePrompt: selection.workflow.supportsEnhancePrompt ? config.videoPromptEnhance !== "false" : false,
        reviewMode: selection.workflow.supportsStage1ManualReview && config.videoStage1Review === "true" ? "after_stage1" : "none",
        ...(selection.workflow.supportsIncludeAudio ? { includeAudio: false } : {}),
    };
}
