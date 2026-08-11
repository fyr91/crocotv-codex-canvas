import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AudioLines, ChevronRight, Group, Image as ImageIcon, Lock, Music2, Play, RefreshCw, Square, Star, Video, Workflow } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { DEFAULT_PROMPT_PANEL_WIDTH, MIN_PROMPT_PANEL_CONTENT_HEIGHT, resizePromptPanel, type PromptPanelLayout, type PromptPanelResizeEdge } from "@/lib/canvas/prompt-panel-resize";
import { useThemeStore } from "@/stores/use-theme-store";
import { useCanvasUploadStore, type CanvasUploadTask } from "@/stores/canvas/use-canvas-upload-store";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { placeCanvasPromptCaretAtEnd } from "./canvas-prompt-editor";
import { CanvasNodeType, type CanvasConnectionPort, type CanvasNodeData, type Position } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasCommentContent } from "./canvas-comment-content";
import { commentColorSurface } from "@/lib/canvas/canvas-comment";
import { reasoningDisplayState } from "@/lib/canvas/canvas-node-reasoning";
import { isMediaBatchChild, isMediaBatchRoot } from "@/lib/canvas/canvas-media-batch";
import { CanvasNodeReasoningBox } from "./canvas-node-reasoning-box";
import { CanvasStackFrame as BatchFrame } from "./canvas-stack-frame";
import { ManagedCanvasVideo } from "./managed-canvas-video";
import { AudioNodePlayer } from "@/components/audio/audio-node-player";
import { canvasNodeImagePreviewUrl } from "@/lib/canvas/canvas-viewport-virtualization";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const selectionBlue = "#2f80ff";

type CanvasNodeProps = {
    data: CanvasNodeData;
    scale: number;
    isSelected: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    isConnecting: boolean;
    editRequestNonce?: number;
    readOnly?: boolean;
    locked?: boolean;
    showPanel: boolean;
    showImageInfo: boolean;
    resourceLabel?: CanvasResourceReference;
    mentionReferences?: CanvasResourceReference[];
    renderPanel?: (node: CanvasNodeData, layout: PromptPanelLayout) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    batchCount?: number;
    groupChildCount?: number;
    isGroupDropTarget?: boolean;
    batchExpanded?: boolean;
    batchClosing?: boolean;
    batchOpening?: boolean;
    batchRecovering?: boolean;
    batchMotion?: { x: number; y: number; index: number };
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (event: React.MouseEvent, nodeId: string, handleType: "source" | "target", port?: CanvasConnectionPort) => void;
    onResize: (nodeId: string, width: number, height: number, position?: Position) => void;
    onPanelResize: (nodeId: string, layout: PromptPanelLayout) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onTitleChange: (nodeId: string, title: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (node: CanvasNodeData) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onApproveStage1?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onViewImage?: (node: CanvasNodeData) => void;
    onRunWorkflow?: (nodeId: string) => void;
    onStopWorkflow?: (nodeId: string) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    readOnly: boolean;
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLDivElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    onRetry?: (node: CanvasNodeData) => void;
    onApproveStage1?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onRunWorkflow?: (nodeId: string) => void;
    onStopWorkflow?: (nodeId: string) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    groupChildCount: number;
};

export const CanvasNode = React.memo(function CanvasNode({
    data,
    scale,
    isSelected,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    isConnecting,
    editRequestNonce = 0,
    readOnly = false,
    locked = false,
    showPanel,
    showImageInfo,
    resourceLabel,
    mentionReferences = [],
    renderPanel,
    renderNodeContent,
    batchCount = 0,
    groupChildCount = 0,
    isGroupDropTarget = false,
    batchExpanded = false,
    batchClosing = false,
    batchOpening = false,
    batchRecovering = false,
    batchMotion,
    onMouseDown,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResize,
    onPanelResize,
    onContentChange,
    onTitleChange,
    onToggleBatch,
    onSetBatchPrimary,
    onRetry,
    onApproveStage1,
    onGenerateImage,
    onViewImage,
    onRunWorkflow,
    onStopWorkflow,
    onContextMenu,
}: CanvasNodeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const uploadTaskId = data.metadata?.uploadTaskId;
    const uploadTask = useCanvasUploadStore((state) => uploadTaskId ? state.tasks[uploadTaskId] : undefined);
    const retryUpload = useCanvasUploadStore((state) => state.retryUpload);
    const [hovered, setHovered] = useState(false);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(data.title || "");
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content);
    const hasAudioContent = (data.type === CanvasNodeType.Audio || data.type === CanvasNodeType.Music) && Boolean(data.metadata?.content);
    const isGroup = data.type === CanvasNodeType.Group || data.type === CanvasNodeType.WorkflowGroup;
    const isWorkflowGroup = data.type === CanvasNodeType.WorkflowGroup;
    const isComment = data.type === CanvasNodeType.Comment;
    const isBatchRoot = isMediaBatchRoot(data) && batchCount > 1;
    const isBatchChild = isMediaBatchChild(data);
    const isActive = isConnectionTarget || isSelected || isFocusRelated;
    const imageBorderColor = isActive ? selectionBlue : isRelated && !isBatchChild ? theme.node.muted : "transparent";
    const commentSurface = isComment ? commentColorSurface(data.metadata?.commentColor, useThemeStore.getState().theme === "dark") : null;
    const textareaRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const resizeRef = useRef({
        isResizing: false,
        corner: "bottom-right" as ResizeCorner,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        keepRatio: false,
        ratio: 1,
    });
    const panelResizeRef = useRef({
        isResizing: false,
        edge: "right" as PromptPanelResizeEdge,
        startX: 0,
        startY: 0,
        startLayout: { width: DEFAULT_PROMPT_PANEL_WIDTH, contentHeight: MIN_PROMPT_PANEL_CONTENT_HEIGHT, offsetX: 0 },
    });
    const panelLayout = {
        width: data.metadata?.promptPanelWidth ?? DEFAULT_PROMPT_PANEL_WIDTH,
        contentHeight: data.metadata?.promptPanelContentHeight ?? (data.type === CanvasNodeType.Music ? 520 : MIN_PROMPT_PANEL_CONTENT_HEIGHT),
        offsetX: data.metadata?.promptPanelOffsetX ?? 0,
    };

    useEffect(() => {
        setTitleDraft(data.title || "");
    }, [data.title]);

    useEffect(() => {
        if (!isEditingTitle) return;
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
    }, [isEditingTitle]);

    const finishTitleEditing = useCallback(() => {
        const title = titleDraft.trim() || data.title || "未命名节点";
        setTitleDraft(title);
        setIsEditingTitle(false);
        if (title !== data.title) onTitleChange(data.id, title);
    }, [data.id, data.title, onTitleChange, titleDraft]);

    useEffect(() => {
        if (!isEditingTitle) return;
        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && titleInputRef.current?.contains(target)) return;
            finishTitleEditing();
        };
        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [finishTitleEditing, isEditingTitle]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;
        const editor = textareaRef.current;
        editor?.focus();
        if (editor) placeCanvasPromptCaretAtEnd(editor);
    }, [isEditingContent]);

    useEffect(() => {
        if (readOnly || locked || !editRequestNonce || (data.type !== CanvasNodeType.Text && data.type !== CanvasNodeType.Comment)) return;
        setIsEditingContent(true);
    }, [data.type, editRequestNonce, locked, readOnly]);

    useEffect(() => {
        if (!readOnly && !locked) return;
        setIsEditingTitle(false);
        setIsEditingContent(false);
    }, [locked, readOnly]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (isEditingContent && textareaRef.current?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    const handleResizeMove = useCallback(
        (event: MouseEvent) => {
            if (!resizeRef.current.isResizing) return;

            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const minWidth = 220;
            const minHeight = 160;
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
            const fromLeft = resizeRef.current.corner.includes("left");
            const fromTop = resizeRef.current.corner.includes("top");
            const rawWidth = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
            const rawHeight = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
            let width = rawWidth;
            let height = rawHeight;
            if (resizeRef.current.keepRatio) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
            }

            onResize(data.id, width, height, {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            });
        },
        [data.id, onResize, scale],
    );

    const handleResizeUp = useCallback(() => {
        resizeRef.current.isResizing = false;
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeUp);
    }, [handleResizeMove]);

    const handleResizeMouseDown = (event: React.MouseEvent, corner: ResizeCorner) => {
        event.stopPropagation();
        event.preventDefault();
        resizeRef.current = {
            isResizing: true,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video,
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        window.addEventListener("mousemove", handleResizeMove);
        window.addEventListener("mouseup", handleResizeUp);
    };

    const handlePanelResizeMove = useCallback(
        (event: MouseEvent) => {
            if (!panelResizeRef.current.isResizing) return;
            onPanelResize(data.id, resizePromptPanel(
                panelResizeRef.current.startLayout,
                panelResizeRef.current.edge,
                event.clientX - panelResizeRef.current.startX,
                event.clientY - panelResizeRef.current.startY,
                scale,
            ));
        },
        [data.id, onPanelResize, scale],
    );

    const handlePanelResizeUp = useCallback(() => {
        panelResizeRef.current.isResizing = false;
        window.removeEventListener("mousemove", handlePanelResizeMove);
        window.removeEventListener("mouseup", handlePanelResizeUp);
    }, [handlePanelResizeMove]);

    const handlePanelResizeMouseDown = (event: React.MouseEvent, edge: PromptPanelResizeEdge) => {
        event.preventDefault();
        event.stopPropagation();
        panelResizeRef.current = { isResizing: true, edge, startX: event.clientX, startY: event.clientY, startLayout: panelLayout };
        window.addEventListener("mousemove", handlePanelResizeMove);
        window.addEventListener("mouseup", handlePanelResizeUp);
    };

    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", handleResizeMove);
            window.removeEventListener("mouseup", handleResizeUp);
            window.removeEventListener("mousemove", handlePanelResizeMove);
            window.removeEventListener("mouseup", handlePanelResizeUp);
        };
    }, [handlePanelResizeMove, handlePanelResizeUp, handleResizeMove, handleResizeUp]);

    const panelContent = showPanel && !readOnly && !locked && !isGroup && renderPanel ? renderPanel(data, panelLayout) : null;
    const remoteOperationActive = Boolean(data.metadata?.remoteOperationActive);

    return (
        <div
            data-node-id={data.id}
            className={`node-element absolute flex select-none flex-col transition-shadow duration-200 ${isGroup ? "z-[5]" : isSelected ? "z-50" : "z-10"}`}
            style={{
                transform: `translate(${data.position.x}px, ${data.position.y}px)`,
                width: data.width,
                height: data.height,
                transition: "box-shadow 200ms ease",
                contain: "layout style",
                animation: batchClosing ? "canvas-batch-child-shell-out 260ms cubic-bezier(.4,0,.2,1) both" : undefined,
            }}
            onMouseEnter={() => {
                setHovered(true);
                onHoverStart(data.id);
            }}
            onMouseLeave={() => {
                setHovered(false);
                onHoverEnd(data.id);
            }}
            onContextMenu={(event) => {
                if (readOnly && !locked) { event.preventDefault(); return; }
                onContextMenu(event, data.id);
            }}
        >
            <div className="absolute left-3 top-[-28px] z-[65] max-w-[calc(100%-24px)]" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                {isEditingTitle && !readOnly && !locked ? (
                    <input
                        ref={titleInputRef}
                        value={titleDraft}
                        maxLength={64}
                        className="h-6 max-w-full border-0 border-b border-dashed bg-transparent px-0 text-left text-xs font-medium outline-none"
                        style={{ borderColor: theme.node.muted, color: theme.node.text }}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        onBlur={finishTitleEditing}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") finishTitleEditing();
                            if (event.key === "Escape") {
                                setTitleDraft(data.title || "");
                                setIsEditingTitle(false);
                            }
                        }}
                    />
                ) : (
                    <button
                        type="button"
                        className={`block max-w-full truncate border-b border-dashed border-transparent px-0 py-0.5 text-left text-xs font-medium opacity-75 ${readOnly || locked ? "cursor-default" : "transition hover:border-current hover:opacity-100"}`}
                        style={{ color: theme.node.text }}
                        title={readOnly || locked ? data.title || "未命名节点" : "双击修改节点名称"}
                        onDoubleClick={(event) => {
                            if (readOnly || locked) return;
                            event.stopPropagation();
                            setIsEditingTitle(true);
                        }}
                    >
                        {data.title || "未命名节点"}
                    </button>
                )}
            </div>

            <div
                className={`relative h-full w-full overflow-visible rounded-3xl border-2 ${remoteOperationActive ? "canvas-mcp-operation-glow" : ""}`}
                style={{
                    background: isGroup ? `${theme.toolbar.panel}66` : commentSurface?.background || (hasImageContent || hasVideoContent ? "transparent" : theme.node.fill),
                    borderColor: remoteOperationActive ? "#22c55e" : isGroup ? (isGroupDropTarget || isActive ? selectionBlue : theme.node.stroke) : hasImageContent ? imageBorderColor : isActive ? selectionBlue : isRelated ? theme.node.muted : commentSurface?.border || theme.node.stroke,
                    borderStyle: isGroup ? "dashed" : "solid",
                    boxShadow: remoteOperationActive ? "0 0 0 1px rgba(34,197,94,.72), 0 0 20px rgba(34,197,94,.68), 0 0 52px rgba(34,197,94,.34)" : isGroupDropTarget ? `0 0 0 2px ${selectionBlue}66, inset 0 0 0 999px ${selectionBlue}10` : isActive ? `0 0 0 1px ${selectionBlue}55` : isRelated && !isBatchChild ? `0 0 0 1px ${theme.node.muted}55, 0 18px 48px rgba(0,0,0,.14)` : undefined,
                }}
                onMouseDown={(event) => {
                    if (!readOnly || locked) onMouseDown(event, data.id);
                }}
                onDoubleClick={(event) => {
                    if (locked) return;
                    if (readOnly) {
                        if (data.type === CanvasNodeType.Image && hasImageContent) { event.stopPropagation(); onViewImage?.(data); }
                        return;
                    }
                    if (isBatchRoot) {
                        event.stopPropagation();
                        onToggleBatch?.(data.id);
                        return;
                    }
                    if (data.type === CanvasNodeType.Image && hasImageContent) {
                        event.stopPropagation();
                        onViewImage?.(data);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text && data.type !== CanvasNodeType.Comment) return;
                    event.stopPropagation();
                    setIsEditingContent(true);
                }}
            >
                {remoteOperationActive ? (
                    <span className="pointer-events-none absolute right-3 top-3 z-40 flex items-center gap-1.5 rounded-full border border-green-400/60 bg-green-500/15 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-green-300 shadow-[0_0_18px_rgba(34,197,94,.4)] backdrop-blur-md" title="该节点正在由 MCP 操作，完成前暂时锁定">
                        <span className="size-1.5 animate-pulse rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,.95)]" />
                        {data.metadata?.remoteOperationLabel || "MCP 操作中"}
                    </span>
                ) : locked ? <span className="pointer-events-none absolute right-3 top-3 z-40 grid size-7 place-items-center rounded-lg" style={{ background: theme.toolbar.panel, color: theme.node.muted }} title="节点已锁定"><Lock className="size-3.5" /></span> : null}
                <div
                    className={`relative flex h-full w-full items-center justify-center rounded-[inherit] ${isBatchRoot ? "overflow-visible" : "overflow-hidden"}`}
                    style={
                        {
                            background: isGroup ? "transparent" : commentSurface?.background || (hasImageContent || hasVideoContent ? "transparent" : theme.node.fill),
                            "--batch-from-x": `${batchMotion?.x || 0}px`,
                            "--batch-from-y": `${batchMotion?.y || 0}px`,
                            "--batch-from-rotate": `${6 + (batchMotion?.index || 0) * 4}deg`,
                            animation: data.metadata?.batchRootId ? (batchClosing ? "canvas-batch-child-out 260ms cubic-bezier(.4,0,.2,1) both" : "canvas-batch-child-in 340ms cubic-bezier(.2,.85,.18,1) both") : undefined,
                            animationDelay: data.metadata?.batchRootId ? `${batchClosing ? 0 : 45 + (batchMotion?.index || 0) * 24}ms` : undefined,
                        } as React.CSSProperties
                    }
                >
                    <NodeContent
                        node={data}
                        theme={theme}
                        readOnly={readOnly}
                        isEditingContent={isEditingContent}
                        textareaRef={textareaRef}
                        isBatchRoot={isBatchRoot}
                        batchCount={batchCount}
                        batchExpanded={batchExpanded}
                        batchOpening={batchOpening}
                        batchRecovering={batchRecovering}
                        renderNodeContent={renderNodeContent}
                        mentionReferences={mentionReferences}
                        onContentChange={onContentChange}
                        onStopEditing={() => setIsEditingContent(false)}
                        onRetry={onRetry}
                        onApproveStage1={onApproveStage1}
                        onGenerateImage={onGenerateImage}
                        onRunWorkflow={onRunWorkflow}
                        onStopWorkflow={onStopWorkflow}
                        onToggleBatch={readOnly ? undefined : () => onToggleBatch?.(data.id)}
                        onSetBatchPrimary={readOnly ? undefined : () => onSetBatchPrimary?.(data)}
                        groupChildCount={groupChildCount}
                    />
                    {uploadTaskId ? <CanvasUploadOverlay task={uploadTask} theme={theme} onRetry={() => retryUpload(uploadTaskId)} /> : null}
                </div>

                {showImageInfo && hasImageContent ? <ImageInfoBar node={data} /> : null}
                {resourceLabel ? <ResourceLabelBadge reference={resourceLabel} /> : null}

                {!isGroup && !hasImageContent && !hasVideoContent && !hasAudioContent ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${theme.canvas.background}66, transparent)` }} /> : null}

                {!readOnly && !locked ? <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} /> : null}
                {!readOnly && !locked ? <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} /> : null}
                {!readOnly && !locked ? <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} /> : null}
                {!readOnly && !locked ? <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} /> : null}
            </div>

            {!readOnly && !locked && (!isGroup || isWorkflowGroup) && !isComment ? <ConnectionHandleDot side="left" visible={hovered || isSelected || isConnecting} onMouseDown={(event) => onConnectStart(event, data.id, "target", isWorkflowGroup ? "workflow-input" : undefined)} /> : null}
            {!readOnly && !locked && (!isGroup || isWorkflowGroup) && !isComment ? <ConnectionHandleDot side="right" visible={hovered || isSelected || isConnecting} onMouseDown={(event) => onConnectStart(event, data.id, "source", isWorkflowGroup ? "workflow-output" : undefined)} /> : null}

            {panelContent != null ? (
                <div
                    data-canvas-prompt-panel
                    className="absolute top-full z-[70] pt-4"
                    style={{ left: `calc(50% + ${panelLayout.offsetX}px)`, width: panelLayout.width, transform: "translateX(-50%)" }}
                >
                    {panelContent}
                    <PromptPanelResizeHandle edge="left" onMouseDown={handlePanelResizeMouseDown} />
                    <PromptPanelResizeHandle edge="right" onMouseDown={handlePanelResizeMouseDown} />
                    <PromptPanelResizeHandle edge="bottom" onMouseDown={handlePanelResizeMouseDown} />
                    <PromptPanelResizeHandle edge="bottom-left" onMouseDown={handlePanelResizeMouseDown} />
                    <PromptPanelResizeHandle edge="bottom-right" onMouseDown={handlePanelResizeMouseDown} />
                </div>
            ) : null}
        </div>
    );
});

function CanvasUploadOverlay({ task, theme, onRetry }: { task?: CanvasUploadTask; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onRetry: () => void }) {
    if (task?.status === "success") return null;
    const failed = task?.status === "error";
    const progress = task?.progress || 0;
    return (
        <div
            className="absolute inset-x-3 bottom-3 z-40 overflow-hidden rounded-xl border px-3 py-2 backdrop-blur-md"
            style={{ background: `${theme.toolbar.panel}e8`, borderColor: failed ? "#ef444480" : theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium">
                <span className={`min-w-0 flex-1 truncate ${failed ? "text-red-400" : ""}`} title={task?.error}>
                    {failed ? task?.error || "上传失败" : `正在上传 ${progress}%`}
                </span>
                {failed ? (
                    <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 transition hover:opacity-75" onClick={(event) => { event.stopPropagation(); onRetry(); }}>
                        <RefreshCw className="size-3" />
                        重试
                    </button>
                ) : null}
            </div>
            {!failed ? (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                    <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${progress}%`, background: theme.node.activeStroke }} />
                </div>
            ) : null}
        </div>
    );
}

function PromptPanelResizeHandle({ edge, onMouseDown }: { edge: PromptPanelResizeEdge; onMouseDown: (event: React.MouseEvent, edge: PromptPanelResizeEdge) => void }) {
    const position = edge === "left"
        ? "bottom-3 left-0 top-7 w-3 -translate-x-1/2 cursor-ew-resize"
        : edge === "right"
            ? "bottom-3 right-0 top-7 w-3 translate-x-1/2 cursor-ew-resize"
            : edge === "bottom"
                ? "bottom-0 left-3 right-3 h-3 translate-y-1/2 cursor-ns-resize"
                : edge === "bottom-left"
                    ? "bottom-0 left-0 size-4 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"
                    : "bottom-0 right-0 size-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize";
    return <div aria-hidden className={`absolute z-20 ${position}`} onMouseDown={(event) => onMouseDown(event, edge)} />;
}

function NodeContent(props: NodeContentRendererProps) {
    if ((props.node.type === CanvasNodeType.Config || props.node.type === CanvasNodeType.Split || props.node.metadata?.framePickerSourceNodeId) && props.renderNodeContent) return props.renderNodeContent(props.node);
    if (props.isBatchRoot && props.node.type === CanvasNodeType.Image) return <ImageNodeContent {...props} />;
    if (props.isBatchRoot && props.node.type === CanvasNodeType.Video) return <VideoNodeContent {...props} />;
    if (props.node.metadata?.status === "loading" && props.node.type !== CanvasNodeType.Comment) return <LoadingContent node={props.node} theme={props.theme} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} readOnly={props.readOnly} onRetry={props.onRetry} />;

    const Renderer = nodeContentRenderers[props.node.type];
    return Renderer ? <Renderer {...props} /> : <UnknownNodeContent theme={props.theme} />;
}

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Comment]: CommentContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Split]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.Music]: MusicNodeContent,
    [CanvasNodeType.Group]: GroupNodeContent,
    [CanvasNodeType.WorkflowGroup]: WorkflowGroupNodeContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function CommentContent({ node, theme, readOnly, isEditingContent, onContentChange, onStopEditing }: NodeContentRendererProps) {
    return <CanvasCommentContent node={node} theme={theme} readOnly={readOnly} editing={isEditingContent} onContentChange={onContentChange} onStopEditing={onStopEditing} />;
}

function GroupNodeContent({ node, theme, groupChildCount }: NodeContentRendererProps) {
    return (
        <div className="pointer-events-none flex h-full w-full flex-col p-4">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.node.text }}>
                <span className="grid size-8 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.muted }}>
                    <Group className="size-4" />
                </span>
                <span>组</span>
                <span className="ml-auto rounded-full px-2 py-1 text-[11px] font-medium" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    {groupChildCount} 个节点
                </span>
            </div>
            <div className="mt-3 flex-1 rounded-2xl border border-dashed" style={{ borderColor: theme.node.stroke, background: `${theme.node.fill}55` }} />
        </div>
    );
}

function WorkflowGroupNodeContent({ node, theme, groupChildCount, onRunWorkflow, onStopWorkflow }: NodeContentRendererProps) {
    const running = node.metadata?.workflowState === "running" || node.metadata?.workflowState === "waiting" || node.metadata?.workflowState === "ready";
    const status = node.metadata?.workflowState === "waiting" ? "等待前置结果" : running ? "运行中" : node.metadata?.workflowState === "error" ? "运行失败" : node.metadata?.workflowState === "success" ? "已完成" : "未运行";
    return (
        <div className="pointer-events-none flex h-full w-full flex-col p-4">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.node.text }}>
                <span className="grid size-8 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.muted }}><Workflow className="size-4" /></span>
                <span>工作流组</span>
                <span className="text-[11px] font-normal opacity-55">{status}</span>
                <span className="ml-auto rounded-full px-2 py-1 text-[11px] font-medium" style={{ background: theme.node.fill, color: theme.node.muted }}>{groupChildCount} 个节点</span>
                <button
                    type="button"
                    aria-label={running ? "停止工作流" : "运行工作流"}
                    className="pointer-events-auto grid size-8 place-items-center rounded-full transition hover:scale-105"
                    style={{ background: running ? "#ef4444" : theme.node.text, color: theme.node.panel }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        if (running) onStopWorkflow?.(node.id);
                        else onRunWorkflow?.(node.id);
                    }}
                >
                    {running ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
                </button>
            </div>
            <div className="mt-3 flex-1 rounded-2xl border border-dashed" style={{ borderColor: theme.node.stroke, background: `${theme.node.fill}22` }} />
        </div>
    );
}

function LoadingContent({ node, theme }: Pick<NodeContentRendererProps, "node" | "theme">) {
    const reasoning = reasoningDisplayState(node.metadata || {});
    if (node.type === CanvasNodeType.Text && reasoning.visible) return (
        <div className="flex h-full min-h-0 w-full flex-col justify-end gap-2 px-3 pb-3 pt-8" style={{ color: theme.node.activeStroke }}>
            <span className="text-center text-[10px] tracking-[0.2em]">{node.metadata?.generationState === "queued" ? "排队中" : "生成中"}</span>
            <CanvasNodeReasoningBox text={node.metadata?.reasoningText} running={reasoning.running} />
        </div>
    );
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.activeStroke }}>
            <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
            <span className="text-[10px] tracking-[0.2em]">{node.metadata?.generationState === "queued" ? "排队中" : `生成中${Number(node.metadata?.generationProgress || 0) > 0 ? ` ${Math.round(Number(node.metadata?.generationProgress))}%` : ""}`}</span>
            {Number(node.metadata?.generationProgress || 0) > 0 ? <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(Number(node.metadata?.generationProgress || 0))}%`, background: theme.node.activeStroke }} /></div> : null}
        </div>
    );
}

function ErrorContent({ node, theme, readOnly, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "readOnly" | "onRetry">) {
    return (
        <div className="mx-auto flex h-full w-full max-w-[260px] flex-col items-center justify-center gap-3 px-5 text-center">
            <div className="text-xs leading-5 text-red-300">{node.metadata?.errorDetails || "生成失败"}</div>
            {!readOnly ? <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                重试
            </button> : null}
        </div>
    );
}

function UnknownNodeContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: theme.node.placeholder }}>
            未知节点
        </div>
    );
}

function TextContent({ node, theme, readOnly, isEditingContent, textareaRef, mentionReferences, onContentChange, onStopEditing, onGenerateImage }: NodeContentRendererProps) {
    const fontSize = node.metadata?.fontSize || 14;
    const textStyle = { fontSize: `${fontSize}px`, lineHeight: `${Math.round(fontSize * 1.65)}px`, color: theme.node.text, boxSizing: "border-box" } as React.CSSProperties;
    const reasoning = reasoningDisplayState(node.metadata || {});

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden pt-8">
            {!readOnly ? <button
                type="button"
                className="absolute right-3 top-3 z-20 inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium opacity-85 backdrop-blur-md transition hover:scale-[1.02] hover:opacity-100"
                style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onGenerateImage?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="生成"
                aria-label="生成"
            >
                <ImageIcon className="size-3.5" />
                生成
            </button> : null}
            {isEditingContent && !readOnly ? (
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    containerClassName="min-h-0 flex-1"
                    className="block h-full w-full border-none bg-transparent pl-4 pr-14 pt-0 pb-4 m-0 font-mono select-text"
                    style={textStyle}
                    value={node.metadata?.content || ""}
                    references={mentionReferences}
                    highlightLabels={false}
                    onChange={(value) => onContentChange(node.id, value)}
                    onBlur={onStopEditing}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onStopEditing();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            ) : (
                <div
                    data-canvas-scroll
                    className="thin-scrollbar block min-h-0 flex-1 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words bg-transparent pl-4 pr-14 pt-0 pb-4 font-mono"
                    style={textStyle}
                    onWheel={(event) => event.stopPropagation()}
                >
                    {node.metadata?.content || <span style={{ color: theme.node.placeholder }}>双击编辑文字</span>}
                </div>
            )}
            {reasoning.visible ? <div className="shrink-0 px-3 pb-3"><CanvasNodeReasoningBox text={node.metadata?.reasoningText} running={reasoning.running} /></div> : null}
        </div>
    );
}

function ResourceLabelBadge({ reference }: { reference: CanvasResourceReference }) {
    return (
        <span className={`pointer-events-none absolute right-2 top-2 z-30 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${reference.active ? "bg-[#2f80ff] text-white shadow-sm" : "bg-black/35 text-white/75"}`}>
            {reference.label}
        </span>
    );
}

function ImageNodeContent(props: NodeContentRendererProps) {
    if (!props.node.metadata?.content && props.isBatchRoot) {
        const content =
            props.node.metadata?.status === "loading" ? (
                <LoadingContent node={props.node} theme={props.theme} />
            ) : props.node.metadata?.status === "error" ? (
                <ErrorContent node={props.node} theme={props.theme} readOnly={props.readOnly} onRetry={props.onRetry} />
            ) : (
                <EmptyImageContent {...props} isBatchRoot={false} />
            );
        return (
            <BatchFrame stackCount={props.batchCount} expanded={props.batchExpanded} opening={props.batchOpening} recovering={props.batchRecovering} onToggle={props.onToggleBatch}>
                {content}
            </BatchFrame>
        );
    }
    if (!props.node.metadata?.content) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            readOnly={props.readOnly}
            isBatchRoot={props.isBatchRoot}
            batchCount={props.batchCount}
            batchExpanded={props.batchExpanded}
            batchOpening={props.batchOpening}
            batchRecovering={props.batchRecovering}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
        />
    );
}

function EmptyImageContent({ theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch }: NodeContentRendererProps) {
    const content = (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
            <div className="flex size-14 items-center justify-center rounded-2xl" style={{ background: theme.toolbar.activeBg }}>
                <ImageIcon className="size-6 opacity-30" />
            </div>
            <span className="text-[10px] tracking-[0.18em] opacity-50">空图片节点</span>
        </div>
    );
    if (isBatchRoot)
        return (
            <BatchFrame stackCount={batchCount} expanded={batchExpanded} opening={batchOpening} recovering={batchRecovering} onToggle={onToggleBatch}>
                {content}
            </BatchFrame>
        );
    return content;
}

function VideoNodeContent(props: NodeContentRendererProps) {
    const { node, theme } = props;
    const content = !node.metadata?.content
        ? node.metadata?.status === "loading"
            ? <LoadingContent node={node} theme={theme} />
            : node.metadata?.status === "error"
              ? <ErrorContent node={node} theme={theme} readOnly={props.readOnly} onRetry={props.onRetry} />
              : <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}><Video className="size-7 opacity-35" /><span className="text-sm">空视频节点</span></div>
        : <div className="relative h-full w-full">
            <ManagedCanvasVideo src={node.metadata.content} />
            {node.metadata.stage1ReviewState ? (
                <div
                    className="absolute inset-x-3 bottom-3 z-30 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 backdrop-blur-md"
                    style={{ background: `${theme.toolbar.panel}eb`, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="min-w-0 truncate text-[11px] font-medium">
                        {node.metadata.stage1ReviewState === "awaiting" ? "Stage 1 预览" : node.metadata.stage1ReviewState === "approving" ? "正在启动 Stage 2…" : "Stage 2 精修中"}
                    </span>
                    {node.metadata.stage1ReviewState === "awaiting" && !props.readOnly ? (
                        <button
                            type="button"
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{ background: theme.node.text, color: theme.node.panel }}
                            onClick={(event) => {
                                event.stopPropagation();
                                props.onApproveStage1?.(node);
                            }}
                        >
                            <Play className="size-3.5 fill-current" />
                            继续 Stage 2
                        </button>
                    ) : null}
                </div>
            ) : null}
            {node.metadata.persistenceState === "uploading" || node.metadata.persistenceState === "failed"
                ? <span className="pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] backdrop-blur" style={{ background: theme.toolbar.panel, color: theme.node.text }}>
                    {node.metadata.persistenceState === "uploading" ? "云端保存中" : "保存重试中"}
                </span>
                : null}
        </div>;
    if (!props.isBatchRoot && !node.metadata?.batchRootId) return content;
    return (
        <BatchFrame stackCount={props.isBatchRoot ? props.batchCount : 0} expanded={props.batchExpanded} opening={props.batchOpening} recovering={props.batchRecovering} onToggle={props.onToggleBatch}>
            <div className="h-full w-full overflow-hidden rounded-3xl">{content}</div>
            <BatchControls node={node} readOnly={props.readOnly} isBatchRoot={props.isBatchRoot} batchCount={props.batchCount} batchExpanded={props.batchExpanded} onToggleBatch={props.onToggleBatch} onSetBatchPrimary={props.onSetBatchPrimary} />
        </BatchFrame>
    );
}

function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <AudioLines className="size-7 opacity-35" />
                <span className="text-sm">空音频节点</span>
            </div>
        );
    return (
        <div className="h-full w-full" style={{ background: theme.node.fill, color: theme.node.text }} data-canvas-no-zoom>
            <AudioNodePlayer url={node.metadata.content} title={node.title || "音频"} durationMs={node.metadata.durationMs} />
        </div>
    );
}

function MusicNodeContent({ node, theme }: NodeContentRendererProps) {
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Music2 className="size-7 opacity-35" />
                <span className="text-sm">空音乐节点</span>
            </div>
        );
    return (
        <div className="flex h-full w-full flex-col justify-center gap-2.5 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm">
                <Music2 className="size-4 shrink-0 opacity-65" />
                <span className="truncate font-medium">{node.metadata.musicTitle || node.title || "音乐"}</span>
                {node.metadata.durationMs ? <span className="ml-auto shrink-0 text-[10px] opacity-45">{formatDuration(node.metadata.durationMs)}</span> : null}
            </div>
            <audio src={node.metadata.content} controls preload="metadata" className="w-full" data-canvas-no-zoom />
        </div>
    );
}

function formatDuration(durationMs: number) {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function ImageContent({
    node,
    readOnly,
    isBatchRoot,
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    onToggleBatch,
    onSetBatchPrimary,
}: {
    node: CanvasNodeData;
    readOnly: boolean;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
}) {
    return (
        <BatchFrame stackCount={isBatchRoot ? batchCount : 0} expanded={batchExpanded} opening={batchOpening} recovering={batchRecovering} onToggle={onToggleBatch}>
            <div className="h-full w-full overflow-hidden rounded-3xl">
                <img
                    src={canvasNodeImagePreviewUrl(node, 1024)}
                    alt={node.title}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                />
            </div>
            <BatchControls node={node} readOnly={readOnly} isBatchRoot={isBatchRoot} batchCount={batchCount} batchExpanded={batchExpanded} onToggleBatch={onToggleBatch} onSetBatchPrimary={onSetBatchPrimary} />
        </BatchFrame>
    );
}

function BatchControls({ node, readOnly, isBatchRoot, batchCount, batchExpanded, onToggleBatch, onSetBatchPrimary }: { node: CanvasNodeData; readOnly: boolean; isBatchRoot: boolean; batchCount: number; batchExpanded: boolean; onToggleBatch?: () => void; onSetBatchPrimary?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isVideo = node.type === CanvasNodeType.Video;
    return (
        <>
            {isBatchRoot && !readOnly ? (
                <button type="button" className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]" style={{ background: `${theme.toolbar.panel}d9`, borderColor: `${theme.toolbar.border}cc`, color: theme.node.text }} aria-label={batchExpanded ? `${isVideo ? "视频" : "图片"}组已展开` : `${isVideo ? "视频" : "图片"}组已收起`} onClick={(event) => { event.stopPropagation(); onToggleBatch?.(); }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    <span className="leading-none text-[#2f80ff]">{batchCount}</span>
                    <ChevronRight className={`size-3.5 opacity-55 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
            {node.metadata?.batchRootId && !readOnly ? (
                <button type="button" className="absolute right-3 top-3 z-30 flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onClick={(event) => { event.stopPropagation(); onSetBatchPrimary?.(); }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    <Star className="size-3.5 text-[#2f80ff]" />
                    {isVideo ? "设为主视频" : "设为主图"}
                </button>
            ) : null}
        </>
    );
}

function ImageInfoBar({ node }: { node: CanvasNodeData }) {
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const size = formatBytes(node.metadata?.bytes || 0);
    return (
        <div className="pointer-events-none absolute bottom-3 right-3 z-40 max-w-[calc(100%-24px)]">
            <span className="max-w-full truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
                {width} x {height}
                {size ? ` · ${size}` : ""}
            </span>
        </div>
    );
}

function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return <div className={`absolute z-50 size-7 ${positionClass}`} onMouseDown={(event) => onMouseDown(event, corner)} />;
}

function ConnectionHandleDot({ side, visible, onMouseDown }: { side: "left" | "right"; visible: boolean; onMouseDown: (event: React.MouseEvent) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div
            className={`absolute top-1/2 z-30 flex size-12 -translate-y-1/2 cursor-crosshair items-center justify-center transition-opacity duration-150 ${
                side === "left" ? "-left-6" : "-right-6"
            } ${visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
            onMouseDown={onMouseDown}
        >
            <div className="size-3 rounded-full border-2 transition-all hover:scale-125" style={{ background: theme.node.panel, borderColor: theme.node.muted }} />
        </div>
    );
}
