import type { AiTextMessage } from "@/services/api/image";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { getGenerationResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { workflowInputGroupForNode } from "@/lib/canvas/canvas-workflow";

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

export type NodeGenerationInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    label?: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

export function selectExplicitMediaMentions(
    context: NodeGenerationContext,
): NodeGenerationContext {
    const imageSelections = context.referenceImages.map((_, index) =>
        context.prompt.includes(imageReferenceLabel(index))
    );
    const videoSelections = context.referenceVideos.map((_, index) =>
        context.prompt.includes(seedanceReferenceLabel("video", index))
    );
    const audioSelections = context.referenceAudios.map((_, index) =>
        context.prompt.includes(seedanceReferenceLabel("audio", index))
    );
    if (
        !imageSelections.some(Boolean) &&
        !videoSelections.some(Boolean) &&
        !audioSelections.some(Boolean)
    ) return context;
    const referenceImages = context.referenceImages.filter((_, index) =>
        imageSelections[index]
    );
    const referenceVideos = context.referenceVideos.filter((_, index) =>
        videoSelections[index]
    );
    const referenceAudios = context.referenceAudios.filter((_, index) =>
        audioSelections[index]
    );
    return {
        ...context,
        referenceImages,
        referenceVideos,
        referenceAudios,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string): NodeGenerationContext {
    const inputs = buildNodeGenerationInputs(nodeId, nodes, connections);
    const sourceNode = nodes.find((node) => node.id === nodeId);
    if (sourceNode?.type === CanvasNodeType.Config && Boolean(sourceNode.metadata?.composerContent?.trim())) {
        return buildComposerGenerationContext(inputs, prompt);
    }

    const textInputs = inputs.filter((input) => input.type === "text" && input.text);
    const referencedTextNodeIds = new Set<string>();
    let resolvedPrompt = prompt;
    textInputs
        .map((input, index) => ({ input, label: `文本${index + 1}` }))
        .sort((a, b) => b.label.length - a.label.length)
        .forEach(({ input, label }) => {
            if (!resolvedPrompt.includes(label)) return;
            referencedTextNodeIds.add(input.nodeId);
            resolvedPrompt = resolvedPrompt.split(label).join(input.text || "");
        });
    const upstreamText = referencedTextNodeIds.size
        ? ""
        : textInputs.map((input) => input.text).join("\n\n");
    const referenceImages = inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = inputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));
    const promptWithUpstreamText = !upstreamText || resolvedPrompt.trim() === upstreamText.trim()
        ? resolvedPrompt
        : resolvedPrompt.trim()
            ? `${resolvedPrompt}\n\n${upstreamText}`
            : upstreamText;

    return {
        prompt: promptWithUpstreamText,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: referencedTextNodeIds.size || textInputs.length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

function buildComposerGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext {
    const inputByNodeId = new Map(inputs.map((input) => [input.nodeId, input]));
    const selectedInputs: NodeGenerationInput[] = [];
    const labelByNodeId = new Map<string, string>();
    const selectedTextNodeIds = new Set<string>();
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    let hasToken = false;
    let lastIndex = 0;
    let nextPrompt = "";

    for (const match of prompt.matchAll(/@\[node:([^\]]+)\]/g)) {
        if (match.index === undefined) continue;
        hasToken = true;
        nextPrompt += prompt.slice(lastIndex, match.index);
        const input = inputByNodeId.get(match[1]);
        if (input) {
            if (input.type === "text") {
                if (!selectedTextNodeIds.has(input.nodeId)) {
                    selectedTextNodeIds.add(input.nodeId);
                    counts.text += 1;
                }
                nextPrompt += input.text || "";
            } else {
                let label = labelByNodeId.get(input.nodeId);
                if (!label) {
                    label = generationLabel(input.type, counts[input.type]++);
                    labelByNodeId.set(input.nodeId, label);
                    selectedInputs.push(input);
                }
                nextPrompt += label;
            }
        }
        lastIndex = match.index + match[0].length;
    }

    nextPrompt += prompt.slice(lastIndex);
    const referenceImages = selectedInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = selectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = selectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    if (!hasToken) {
        return {
            prompt,
            referenceImages: [],
            referenceVideos: [],
            referenceAudios: [],
            textCount: 0,
            imageCount: 0,
            videoCount: 0,
            audioCount: 0,
        };
    }

    return {
        prompt: nextPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: counts.text,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], options?: { includeWorkflowInput?: boolean }): NodeGenerationInput[] {
    const workflowInput = options?.includeWorkflowInput ? workflowInputGroupForNode(nodeId, nodes, connections) : null;
    return [
        ...(workflowInput ? [{ nodeId: workflowInput.id, type: "text" as const, title: "当前批次输入", label: "工作组输入" }] : []),
        ...getGenerationResourceNodes(nodeId, nodes, connections).flatMap((node): NodeGenerationInput[] => {
            const image = readReferenceImage(node);
            if (image) return [{ nodeId: node.id, type: "image" as const, title: node.title, image }];
            const video = readReferenceVideo(node);
            if (video) return [{ nodeId: node.id, type: "video" as const, title: node.title, video }];
            const audio = readReferenceAudio(node);
            if (audio) return [{ nodeId: node.id, type: "audio" as const, title: node.title, audio }];
            const text = readNodeTextInput(node);
            if (text) return [{ nodeId: node.id, type: "text" as const, title: node.title, text }];
            return [];
        }),
    ];
}

export function buildNodeResponseMessages(context: NodeGenerationContext): AiTextMessage[] {
    if (!context.referenceImages.length && !context.referenceVideos.length && !context.referenceAudios.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [
                { type: "text" as const, text: context.prompt },
                ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } })),
                ...context.referenceVideos.map((video) => ({ type: "video_url" as const, video_url: { url: video.url } })),
                ...context.referenceAudios.map((audio) => ({ type: "audio_url" as const, audio_url: { url: audio.url } })),
            ],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    return { ...context, referenceImages: await Promise.all(context.referenceImages.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) }))) };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function generationLabel(type: Exclude<NodeGenerationInput["type"], "text">, index: number) {
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return seedanceReferenceLabel("video", index);
    return seedanceReferenceLabel("audio", index);
}

function readReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

function readReferenceVideo(node: CanvasNodeData): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
        durationMs: node.metadata.durationMs,
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if ((node.type !== CanvasNodeType.Audio && node.type !== CanvasNodeType.Music) || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        durationMs: node.metadata.durationMs,
    };
}
