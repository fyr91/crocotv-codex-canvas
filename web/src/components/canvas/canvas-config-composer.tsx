import { useMemo } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { Button } from "antd";
import { X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { NodeGenerationInput } from "./canvas-node-generation";
import { CanvasPromptEditor, type CanvasPromptEditorReference, type CanvasPromptEditorToken } from "./canvas-prompt-editor";
import { CanvasVideoFrameFields } from "./canvas-video-frame-fields";
import { CanvasVideoReferenceFields } from "./canvas-video-reference-fields";
import type { VideoInputMode } from "@/lib/video-input-mode";

type CanvasConfigComposerProps = {
    value: string;
    inputs: NodeGenerationInput[];
    contentHeight: number;
    onChange: (value: string) => void;
    onClose: () => void;
    title?: string;
    description?: string;
    placeholder?: string;
    videoInputMode?: VideoInputMode;
    allowMultimodalVideoFrames?: boolean;
    allowedMultimodalMedia?: Array<"image" | "video" | "audio">;
    videoFirstFrameNodeId?: string;
    videoLastFrameNodeId?: string;
    onVideoFirstFrameChange?: (nodeId?: string) => void;
    onVideoLastFrameChange?: (nodeId?: string) => void;
    videoEditSourceNodeId?: string;
    onVideoEditSourceChange?: (nodeId?: string) => void;
};

export const CONFIG_REFERENCE_PATTERN = /@\[node:([^\]]+)\]/g;

export function CanvasConfigComposer({ value, inputs, contentHeight, onChange, onClose, title = "组装提示词", description = "@ 引用已连接素材，发送前按当前连接重新编号", placeholder = "输入提示词，按 @ 引用连接的图片或文本", videoInputMode, allowMultimodalVideoFrames, allowedMultimodalMedia, videoFirstFrameNodeId, videoLastFrameNodeId, onVideoFirstFrameChange, onVideoLastFrameChange, videoEditSourceNodeId, onVideoEditSourceChange }: CanvasConfigComposerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const tokens = useMemo(() => parseComposerTokens(value), [value]);
    const textOnlyMode = videoInputMode === "firstFrame" || videoInputMode === "firstLastFrame" || videoInputMode === "text";
    const inlineImageMode = videoInputMode === "referenceImages" || videoInputMode === "videoEdit";
    const mentionInputs = useMemo(() => textOnlyMode
        ? inputs.filter((input) => input.type === "text")
        : inlineImageMode
            ? inputs.filter((input) => input.type === "text" || input.type === "image")
            : allowedMultimodalMedia
              ? inputs.filter((input) => input.type === "text" || allowedMultimodalMedia.includes(input.type as "image" | "video" | "audio"))
              : inputs, [allowedMultimodalMedia, inlineImageMode, inputs, textOnlyMode]);
    const references = useMemo(() => mentionInputs.map((input): CanvasPromptEditorReference => ({
        key: input.nodeId,
        kind: input.type,
        label: input.label || resourceLabel(input, inputs),
        title: input.title,
        previewUrl: input.image?.dataUrl || input.video?.url,
        text: input.text,
    })), [inputs, mentionInputs]);
    const frameImages = inputs.filter((input) => input.type === "image").map((input) => ({ nodeId: input.nodeId, label: resourceLabel(input, inputs), title: input.title }));
    const videos = inputs.filter((input) => input.type === "video").map((input) => ({ nodeId: input.nodeId, label: resourceLabel(input, inputs), title: input.title }));

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();

    return (
        <div
            data-canvas-no-zoom
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={stopCanvasInteraction}
            onPointerDown={stopCanvasInteraction}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                    <div className="shrink-0 text-xs font-semibold">{title}</div>
                    <div className="truncate text-[11px] opacity-55">{description}</div>
                </div>
                <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<X className="size-3.5" />} onClick={onClose} />
            </div>
            {videoInputMode && onVideoFirstFrameChange && onVideoLastFrameChange ? <CanvasVideoFrameFields mode={videoInputMode} allowMultimodalFrames={allowMultimodalVideoFrames} images={frameImages} firstFrameNodeId={videoFirstFrameNodeId} lastFrameNodeId={videoLastFrameNodeId} onFirstFrameChange={onVideoFirstFrameChange} onLastFrameChange={onVideoLastFrameChange} /> : null}
            {videoInputMode === "videoEdit" && onVideoEditSourceChange ? <CanvasVideoReferenceFields videos={videos} selectedVideoNodeId={videoEditSourceNodeId} onVideoChange={onVideoEditSourceChange} /> : null}
            <div className="relative rounded-xl border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                <CanvasPromptEditor
                    value={value}
                    tokens={tokens}
                    references={references}
                    serializeReference={serializeConfigReference}
                    onChange={onChange}
                    placeholder={placeholder}
                    placeholderClassName="left-3 top-2 text-sm leading-7"
                    className="thin-scrollbar w-full overflow-y-auto overscroll-contain whitespace-pre-wrap break-words px-3 py-2 text-sm leading-7 outline-none"
                    style={{ color: theme.node.text, height: contentHeight }}
                />
            </div>
        </div>
    );
}

function serializeConfigReference(reference: CanvasPromptEditorReference) {
    return `@[node:${reference.key}]`;
}

function parseComposerTokens(value: string): CanvasPromptEditorToken[] {
    const tokens: CanvasPromptEditorToken[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(CONFIG_REFERENCE_PATTERN)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        tokens.push({ type: "reference", key: match[1] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}

function resourceLabel(input: NodeGenerationInput, inputs: NodeGenerationInput[]) {
    const sameTypeInputs = inputs.filter((item) => item.type === input.type);
    const index = Math.max(0, sameTypeInputs.findIndex((item) => item.nodeId === input.nodeId));
    if (input.type === "image") return `图片${index + 1}`;
    if (input.type === "video") return `视频${index + 1}`;
    if (input.type === "audio") return `音频${index + 1}`;
    return `文本${index + 1}`;
}
