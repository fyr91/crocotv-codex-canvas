export const VIDEO_INPUT_MODES = ["text", "firstFrame", "firstLastFrame", "multimodal", "referenceImages", "videoEdit"] as const;
export type VideoInputMode = (typeof VIDEO_INPUT_MODES)[number];

export type AutomaticLtxVideoInput = {
    firstFrameNodeId?: string;
    lastFrameNodeId?: string;
    referenceImageNodeIds?: string[];
    referenceVideoCount?: number;
    referenceAudioCount?: number;
};

export const videoInputModeOptions = [
    { value: "text", label: "文生视频" },
    { value: "firstFrame", label: "首帧" },
    { value: "firstLastFrame", label: "首尾帧" },
    { value: "multimodal", label: "多模态" },
    { value: "referenceImages", label: "参考图生视频" },
    { value: "videoEdit", label: "视频编辑" },
] satisfies Array<{ value: VideoInputMode; label: string }>;

export function normalizeVideoInputModes(value: unknown): VideoInputMode[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((item): item is VideoInputMode => VIDEO_INPUT_MODES.includes(item as VideoInputMode))));
}

export function resolveVideoInputMode(supported: VideoInputMode[], value?: string): VideoInputMode {
    return supported.includes(value as VideoInputMode) ? value as VideoInputMode : supported[0] || "multimodal";
}

export function resolveVideoFramePair<T>(firstFrame: T, lastFrame?: T): [T, T] {
    return [firstFrame, lastFrame || firstFrame];
}

export function resolveAutomaticLtxVideoInputMode(input: AutomaticLtxVideoInput): VideoInputMode {
    const selectedFrameIds = new Set([input.firstFrameNodeId, input.lastFrameNodeId].filter((nodeId): nodeId is string => Boolean(nodeId)));
    const hasIngredientImage = (input.referenceImageNodeIds || []).some((nodeId) => !selectedFrameIds.has(nodeId));
    const hasMultimodalReference = hasIngredientImage
        || Boolean(input.referenceVideoCount)
        || Boolean(input.referenceAudioCount)
        || Boolean(input.lastFrameNodeId && !input.firstFrameNodeId);
    if (hasMultimodalReference) return "multimodal";
    if (input.firstFrameNodeId && input.lastFrameNodeId) return "firstLastFrame";
    if (input.firstFrameNodeId) return "firstFrame";
    return (input.referenceImageNodeIds || []).length ? "multimodal" : "text";
}

export function stripNonTextComposerReferences(value: string, inputs: Array<{ nodeId: string; type: "text" | "image" | "video" | "audio" }>, allowedTypes: Array<"text" | "image" | "video" | "audio"> = ["text"]) {
    const typeById = new Map(inputs.map((input) => [input.nodeId, input.type]));
    return value.replace(/@\[node:([^\]]+)\]/g, (token, nodeId: string) => typeById.get(nodeId) && !allowedTypes.includes(typeById.get(nodeId)!) ? "" : token);
}

export function stripNonTextPromptReferences(value: string, references: Array<{ label: string; kind: "text" | "image" | "video" | "audio" }>, allowedTypes: Array<"text" | "image" | "video" | "audio"> = ["text"]) {
    return references.filter((reference) => !allowedTypes.includes(reference.kind)).reduce((prompt, reference) => prompt.replaceAll(reference.label, ""), value);
}
