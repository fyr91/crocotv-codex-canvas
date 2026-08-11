export type VideoRatioOption = {
    label: string;
    ratio: string;
    size: string;
    width: number;
    height: number;
    recommended: boolean;
    qualityId?: string;
    deliveryWidth?: number;
    deliveryHeight?: number;
    maxDurationSeconds?: number;
};

export type VideoAspectRatioOption = {
    id: string;
    label: string;
    ratio: string;
    resolutions: VideoRatioOption[];
};

export type VideoGenerationOptions = {
    qualities: Array<{ id: string; label: string; ratios: VideoRatioOption[]; disabled?: boolean }>;
    aspectRatios?: VideoAspectRatioOption[];
    durations: number[];
    counts: number[];
    selection: { quality: string; size: string; duration: number; count: number };
    supports: { generateAudio: boolean; watermark: boolean; returnLastFrame: boolean; promptEnhance: boolean; audioSetting: boolean; stage1Review?: boolean };
    error?: string;
};

type CurrentVideoSelection = { inputMode?: string; quality?: string; size?: string; duration?: string; count?: number };

export function videoPromptLengthError(providerId: string, config: Record<string, unknown>, prompt: string) {
    if (providerId !== "minimax_h3") return undefined;
    const configured = Number(config.maxPromptChars);
    const limit = Number.isInteger(configured) && configured > 0 ? configured : 20_000;
    return prompt.length > limit ? `MiniMax H3 提示词不能超过 ${limit} 字符（当前 ${prompt.length} 字符）` : undefined;
}

export function normalizeVideoGenerationOptions(providerId: string, config: Record<string, unknown>, current: CurrentVideoSelection): VideoGenerationOptions {
    if (providerId === "ltx") return normalizeLtxOptions(config, current);
    if (providerId === "minimax_h3") return normalizeMiniMaxH3Options(config, current);
    const settings = videoSettingsForInputMode(config, current.inputMode);
    const qualities = array(settings.qualities).map((quality) => {
        const item = asRecord(quality);
        return {
            id: String(item.id || ""),
            label: String(item.label || item.id || ""),
            ratios: array(item.ratios).map(normalizeRatio).filter((ratio) => ratio.size),
        };
    }).filter((quality) => quality.id);
    const durations = numbers(settings.durations);
    const counts = numbers(settings.counts).filter((value) => value > 0);
    const supports = asRecord(settings.supports);
    return finalizeOptions(qualities, durations, counts, current, {
        generateAudio: supports.generateAudio === true,
        watermark: supports.watermark === true,
        returnLastFrame: supports.returnLastFrame === true,
        promptEnhance: supports.promptEnhance === true,
        audioSetting: supports.audioSetting === true,
    }, qualities.length ? undefined : "该视频模型尚未配置可用参数");
}

function normalizeMiniMaxH3Options(config: Record<string, unknown>, current: CurrentVideoSelection): VideoGenerationOptions {
    const empty = finalizeOptions([], [], [1], current, emptySupports, "MiniMax H3 固定输出规格缺失，请联系管理员同步模型配置");
    if (config.capabilitiesSource !== "minimax-h3-fixed-v3") return empty;
    const settings = videoSettingsForInputMode(config, current.inputMode);
    const qualities = array(settings.qualities).map((quality) => {
        const item = asRecord(quality);
        const id = String(item.id || "");
        return {
            id,
            label: String(item.label || id),
            ratios: array(item.ratios).map((ratio) => normalizeRatio({ ...asRecord(ratio), qualityId: id })).filter((ratio) => ratio.size),
        };
    }).filter((quality) => quality.id && quality.ratios.length);
    const aspectRatios: VideoAspectRatioOption[] = [];
    for (const resolution of qualities.flatMap((quality) => quality.ratios)) {
        const aspectId = resolution.ratio;
        if (!aspectId || !["16:9", "4:3", "9:16", "3:4"].includes(aspectId)) continue;
        let aspect = aspectRatios.find((item) => item.id === aspectId);
        if (!aspect) {
            aspect = { id: aspectId, label: aspectId, ratio: aspectId, resolutions: [] };
            aspectRatios.push(aspect);
        }
        aspect.resolutions.push(resolution);
    }
    const resolutions = aspectRatios.flatMap((item) => item.resolutions);
    const selected = resolutions.find((item) => item.qualityId === current.quality && item.size === current.size)
        || resolutions.find((item) => item.size === current.size)
        || resolutions.find((item) => item.qualityId === current.quality)
        || resolutions.find((item) => item.recommended)
        || resolutions[0];
    const durations = Array.from(new Set(numbers(settings.durations))).sort((left, right) => left - right);
    const counts = Array.from(new Set(numbers(settings.counts).filter((value) => value > 0 && value <= 3))).sort((left, right) => left - right);
    const requestedDuration = Number(current.duration);
    const requestedCount = Number(current.count);
    return {
        qualities,
        aspectRatios,
        durations,
        counts: counts.length ? counts : [1],
        selection: {
            quality: selected?.qualityId || "",
            size: selected?.size || "",
            duration: durations.includes(requestedDuration) ? requestedDuration : durations[0] || 0,
            count: counts.includes(requestedCount) ? requestedCount : counts[0] || 1,
        },
        supports: emptySupports,
        error: resolutions.length === 8 && aspectRatios.length === 4 ? undefined : "MiniMax H3 输出规格不完整，请联系管理员同步模型配置",
    };
}

function normalizeLtxOptions(config: Record<string, unknown>, current: CurrentVideoSelection) {
    const capabilities = asRecord(config.ltxCapabilities);
    const workflows = array(capabilities.workflows).map(asRecord);
    const workflow = workflows.find((item) => item.inputMode === current.inputMode) || workflows[0];
    const emptyQualities = [
        { id: "standard", label: "标准", ratios: [] as VideoRatioOption[] },
        { id: "high", label: "高清", ratios: [] as VideoRatioOption[] },
    ];
    if (config.capabilitiesSource !== "ltx-fixed" || capabilities.provider !== "ltx" || !workflow) {
        return finalizeOptions(emptyQualities.map((item) => ({ ...item, disabled: true })), [], [1], current, emptySupports, "LTX 固定能力配置缺失，请先在模型管理中同步");
    }
    const aspectRatios: VideoAspectRatioOption[] = [];
    for (const presetValue of array(workflow.aspectRatioPresets)) {
        const preset = asRecord(presetValue);
        const presetId = String(preset.id || "");
        const presetIsQuality = ["standard", "clear", "high", "hd"].includes(presetId);
        const presetOptions = presetId === "other" ? array(preset.options).filter((value) => String(asRecord(value).value || "") === current.size) : array(preset.options);
        for (const optionValue of presetOptions) {
            const option = asRecord(optionValue);
            const qualityId = normalizeLtxQualityId(presetIsQuality ? presetId : String(option.id || ""));
            const optionRatio = presetId === "other" ? ratioForDimensions(Number(option.width), Number(option.height)) : String(option.ratio || preset.ratio || "");
            const ratio = normalizeRatio({
                ...option,
                label: presetIsQuality ? preset.label : option.label,
                ratio: optionRatio,
                qualityId,
            });
            if (!ratio.size) continue;
            const aspectId = presetIsQuality ? `${ratio.ratio || ratio.size}:${String(option.label || ratio.ratio || ratio.size)}` : presetId || ratio.ratio || ratio.size;
            let aspect = aspectRatios.find((item) => item.id === aspectId);
            if (!aspect) {
                aspect = {
                    id: aspectId,
                    label: String(presetIsQuality ? option.label || ratio.ratio || ratio.size : preset.label || preset.ratio || presetId),
                    ratio: String(presetIsQuality || presetId === "other" ? ratio.ratio : preset.ratio || ratio.ratio),
                    resolutions: [],
                };
                aspectRatios.push(aspect);
            }
            if (!aspect.resolutions.some((item) => item.size === ratio.size)) aspect.resolutions.push(ratio);
        }
    }
    const durations = array(workflow.durationPresets).map(asRecord).filter((item) => item.enabled !== false).map((item) => Number(item.seconds)).filter(Number.isFinite);
    const maxCount = Math.max(1, Math.min(8, Number(workflow.batchMaxItems || capabilities.batchMaxItems) || 1));
    const qualities = ltxQualities(aspectRatios);
    const defaultDuration = array(workflow.durationPresets).map(asRecord).find((item) => item.enabled !== false && Number(item.numFrames) === Number(workflow.defaultNumFrames))?.seconds;
    return finalizeLtxOptions(qualities, aspectRatios, durations, Array.from({ length: maxCount }, (_, index) => index + 1), current, {
        generateAudio: workflow.supportsIncludeAudio === true,
        watermark: false,
        returnLastFrame: false,
        promptEnhance: workflow.supportsEnhancePrompt === true,
        audioSetting: false,
        stage1Review: workflow.supportsStage1ManualReview === true,
    }, String(workflow.defaultResolution || ""), Number(defaultDuration));
}

function finalizeLtxOptions(
    qualities: VideoGenerationOptions["qualities"],
    aspectRatios: VideoAspectRatioOption[],
    durations: number[],
    counts: number[],
    current: CurrentVideoSelection,
    supports: VideoGenerationOptions["supports"],
    defaultResolution: string,
    defaultDuration: number,
): VideoGenerationOptions {
    const resolutions = aspectRatios.flatMap((item) => item.resolutions);
    const selected = resolutions.find((item) => item.size === current.size)
        || resolutions.find((item) => item.size === defaultResolution)
        || resolutions.find((item) => item.qualityId === normalizeLtxQualityId(String(current.quality || "")) && item.recommended)
        || resolutions.find((item) => item.recommended)
        || resolutions[0];
    const uniqueDurations = Array.from(new Set(durations)).sort((a, b) => a - b);
    const availableDurations = selected?.maxDurationSeconds
        ? uniqueDurations.filter((value) => value <= Number(selected.maxDurationSeconds))
        : uniqueDurations;
    const requestedDuration = Number(current.duration);
    const fallbackDuration = availableDurations.includes(defaultDuration)
        ? defaultDuration
        : availableDurations[0] || 0;
    const duration = availableDurations.includes(requestedDuration)
        ? requestedDuration
        : Number.isFinite(requestedDuration) && requestedDuration > 0
          ? [...availableDurations].reverse().find((value) => value <= requestedDuration) || fallbackDuration
          : fallbackDuration;
    const uniqueCounts = Array.from(new Set(counts)).sort((a, b) => a - b);
    const requestedCount = Number(current.count);
    return {
        qualities,
        aspectRatios,
        durations: availableDurations,
        counts: uniqueCounts.length ? uniqueCounts : [1],
        selection: {
            quality: selected?.qualityId || qualities[0]?.id || "",
            size: selected?.size || "",
            duration,
            count: uniqueCounts.includes(requestedCount) ? requestedCount : uniqueCounts[0] || 1,
        },
        supports,
        error: resolutions.length ? undefined : "LTX 当前工作流没有可用分辨率",
    };
}

function ltxQualities(aspectRatios: VideoAspectRatioOption[]) {
    const labels = new Map<string, string>();
    const ratios = new Map<string, VideoRatioOption[]>();
    for (const resolution of aspectRatios.flatMap((item) => item.resolutions)) {
        const qualityId = resolution.qualityId || "standard";
        if (!labels.has(qualityId)) labels.set(qualityId, resolution.label || qualityId);
        const items = ratios.get(qualityId) || [];
        items.push(resolution);
        ratios.set(qualityId, items);
    }
    const preferredOrder = ["standard", "clear", "high"];
    return [...labels.keys()]
        .sort((left, right) => {
            const leftIndex = preferredOrder.indexOf(left);
            const rightIndex = preferredOrder.indexOf(right);
            return (leftIndex < 0 ? preferredOrder.length : leftIndex) - (rightIndex < 0 ? preferredOrder.length : rightIndex);
        })
        .map((id) => ({ id, label: labels.get(id) || id, ratios: ratios.get(id) || [] }));
}

function normalizeLtxQualityId(value: string) {
    return value === "hd" ? "high" : value || "standard";
}

function finalizeOptions(qualities: VideoGenerationOptions["qualities"], durations: number[], counts: number[], current: CurrentVideoSelection, supports: VideoGenerationOptions["supports"], error?: string): VideoGenerationOptions {
    const usable = qualities.filter((item) => !item.disabled && item.ratios.length);
    const currentQuality = qualities.find((item) => item.id === current.quality && !item.disabled && item.ratios.length);
    const sizeQuality = usable.find((item) => item.ratios.some((ratio) => ratio.size === current.size));
    const quality = currentQuality || sizeQuality || usable.find((item) => item.ratios.some((ratio) => ratio.recommended)) || usable[0] || qualities[0];
    const size = quality?.ratios.some((ratio) => ratio.size === current.size)
        ? String(current.size)
        : quality?.ratios.find((ratio) => ratio.recommended)?.size || quality?.ratios[0]?.size || "";
    const uniqueDurations = Array.from(new Set(durations)).sort((a, b) => a - b);
    const uniqueCounts = Array.from(new Set(counts)).sort((a, b) => a - b);
    const requestedDuration = Number(current.duration);
    const requestedCount = Number(current.count);
    return {
        qualities,
        durations: uniqueDurations,
        counts: uniqueCounts.length ? uniqueCounts : [1],
        selection: {
            quality: quality?.id || "",
            size,
            duration: uniqueDurations.includes(requestedDuration) ? requestedDuration : uniqueDurations[0] || 0,
            count: uniqueCounts.includes(requestedCount) ? requestedCount : uniqueCounts[0] || 1,
        },
        supports,
        error,
    };
}

function normalizeRatio(value: unknown): VideoRatioOption {
    const item = asRecord(value);
    const size = String(item.size || item.value || item.ratio || "");
    return {
        label: String(item.label || item.ratio || size),
        ratio: String(item.ratio || ""),
        size,
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
        recommended: item.recommended === true,
        qualityId: item.qualityId ? String(item.qualityId) : undefined,
        deliveryWidth: positiveNumber(item.deliveryWidth ?? item.delivery_width),
        deliveryHeight: positiveNumber(item.deliveryHeight ?? item.delivery_height),
        maxDurationSeconds: positiveNumber(item.maxDurationSeconds ?? item.max_duration_seconds),
    };
}

export function videoSettingsForInputMode(config: Record<string, unknown>, inputMode?: string) {
    const byMode = asRecord(config.videoSettingsByInputMode);
    return asRecord(byMode[String(inputMode || "")] || config.videoSettings);
}

const emptySupports = { generateAudio: false, watermark: false, returnLastFrame: false, promptEnhance: false, audioSetting: false };
const asRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];
const numbers = (value: unknown) => array(value).map(Number).filter(Number.isFinite);
const positiveNumber = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
};

function ratioForDimensions(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "";
    let left = Math.round(width);
    let right = Math.round(height);
    while (right) [left, right] = [right, left % right];
    return `${Math.round(width) / left}:${Math.round(height) / left}`;
}
