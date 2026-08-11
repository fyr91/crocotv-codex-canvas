import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Dropdown, Modal, Segmented, Select, Tooltip } from "antd";
import { AudioLines, Blocks, BookmarkPlus, Copy, Download, Film, Fingerprint, FolderPlus, ImagePlus, Info, Lock, LockOpen, MessageSquare, Minus, Palette, Pencil, Plus, RefreshCw, Sparkles, Split, Trash2, Upload, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes, getDataUrlByteSize } from "@/lib/image-utils";
import { useCopyText } from "@/hooks/use-copy-text";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasNodePrompt } from "@/lib/canvas/prompt";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";
import { IMAGE_QUICK_TOOLS_STORAGE_KEY, buildImageToolbarTools, defaultImageQuickToolIds, readImageQuickToolsConfig, type ImageQuickToolId } from "./canvas-image-toolbar-tools";
import { CANVAS_COMMENT_COLORS } from "@/lib/canvas/canvas-comment";
import { isMediaBatchRoot, mediaBatchKind } from "@/lib/canvas/canvas-media-batch";
import { modelOptionName, providerIdForModel } from "@/stores/use-config-store";
import type { CanvasCommentColor } from "@/types/canvas";
import { MiniMaxH3EnhancementButton } from "@/components/minimax-h3-enhancement-button";
import { supportsMiniMaxH3HdRepair } from "@/services/api/minimax-h3-enhancement";
import type { CloudAsset } from "@/services/api/cloud-assets";

type CanvasNodeHoverToolbarProps = {
    node: CanvasNodeData | null;
    viewport: ViewportTransform;
    locked: boolean;
    lockDisabled: boolean;
    onToggleLock: (node: CanvasNodeData) => void;
    onDuplicate: (node: CanvasNodeData) => void;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    onInfo: (node: CanvasNodeData) => void;
    onEditText: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUseMiddleFrame: (node: CanvasNodeData) => void;
    onUseLastFrame: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onEnhancementReady?: (node: CanvasNodeData, asset: CloudAsset) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onSavePrompt: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onSuperResolve: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
    commentModels: string[];
    onBeautifyComment: (node: CanvasNodeData) => void;
    onSetCommentColor: (node: CanvasNodeData, color: CanvasCommentColor) => void;
    onSetCommentModel: (node: CanvasNodeData, model: string) => void;
};

type ToolbarTool = {
    id: string;
    title: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
};

export function CanvasNodeHoverToolbar({
    node,
    viewport,
    locked,
    lockDisabled,
    onToggleLock,
    onDuplicate,
    onKeep,
    onLeave,
    onInfo,
    onEditText,
    onDecreaseFont,
    onIncreaseFont,
    onToggleDialog,
    onGenerateImage,
    onUseMiddleFrame,
    onUseLastFrame,
    onUpload,
    onDownload,
    onEnhancementReady,
    onSaveAsset,
    onSavePrompt,
    onMaskEdit,
    onCrop,
    onSplit,
    onUpscale,
    onSuperResolve,
    onAngle,
    onViewImage,
    onReversePrompt,
    onRetry,
    onToggleFreeResize,
    onDelete,
    commentModels,
    onBeautifyComment,
    onSetCommentColor,
    onSetCommentModel,
}: CanvasNodeHoverToolbarProps) {
    const [quickImageToolIds, setQuickImageToolIds] = useState<ImageQuickToolId[]>(defaultImageQuickToolIds);
    const [showImageToolLabels, setShowImageToolLabels] = useState(true);
    const copyText = useCopyText();

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored) as unknown;
            const config = readImageQuickToolsConfig(parsed);
            setQuickImageToolIds(config.ids);
            setShowImageToolLabels(config.showLabels);
        } catch {
            window.localStorage.removeItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
        }
    }, []);

    if (!node) return null;

    const left = viewport.x + (node.position.x + node.width / 2) * viewport.k;
    const top = viewport.y + node.position.y * viewport.k - 14;
    const isImage = node.type === CanvasNodeType.Image;
    const isVideo = node.type === CanvasNodeType.Video;
    const isAudio = node.type === CanvasNodeType.Audio;
    const isMusic = node.type === CanvasNodeType.Music;
    const hasImage = isImage && Boolean(node.metadata?.content);
    const hasVideo = isVideo && Boolean(node.metadata?.content);
    const hasAudio = isAudio && Boolean(node.metadata?.content);
    const hasMusic = isMusic && Boolean(node.metadata?.content);
    const isMedia = isImage || isVideo || isAudio || isMusic;
    const isText = node.type === CanvasNodeType.Text;
    const isComment = node.type === CanvasNodeType.Comment;
    const isConfig = node.type === CanvasNodeType.Config;
    const isSplit = node.type === CanvasNodeType.Split;
    const canOpenDialog = isText || hasImage || isVideo || isMusic;
    const canRetry = node.metadata?.status === "error";
    const prompt = canvasNodePrompt(node);
    const hasPrompt = Boolean(prompt);
    const copyPromptLabel = isMedia ? "复制生成提示词" : "复制提示词";
    const quickImageToolIdSet = new Set(quickImageToolIds);
    const copyPrompt = () => copyText(prompt, "提示词已复制");
    const copyNodeId = () => copyText(node.id, "节点 ID 已复制");
    const imageTools = buildImageToolbarTools(node, { onUpload, onToggleFreeResize, onMaskEdit, onCrop, onSplit, onUpscale, onSuperResolve, onAngle, onViewImage, onCopyPrompt: copyPrompt, onReversePrompt }).filter((tool) => tool.id !== "copyPrompt");

    const baseToolbarTools: ToolbarTool[] = [
        { id: "info", title: "查看节点信息", label: "信息", icon: <Info className="size-4" />, onClick: () => onInfo(node) },
        { id: "delete", title: "移除节点", label: "删除", icon: <Trash2 className="size-4" />, onClick: () => onDelete(node), danger: true },
    ];
    const nodeToolbarTools: ToolbarTool[] = [
        ...(canRetry ? [{ id: "retry", title: "重新生成", label: "重试", icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        ...(hasImage || hasVideo || hasMusic ? [{ id: "saveAsset", title: "加入我的素材", label: "存素材", icon: <FolderPlus className="size-4" />, onClick: () => onSaveAsset(node) }] : []),
        ...(hasPrompt ? [{ id: "copyPrompt", title: copyPromptLabel, label: copyPromptLabel, icon: <Copy className="size-4" />, onClick: copyPrompt }] : []),
        ...(hasImage || hasVideo || hasAudio || hasMusic ? [{ id: "download", title: hasAudio || hasMusic ? "下载音频" : hasVideo ? "下载视频" : "下载图片", label: "下载", icon: <Download className="size-4" />, onClick: () => onDownload(node) }] : []),
        ...(canOpenDialog ? [{ id: "edit", title: "编辑", label: "编辑", icon: <MessageSquare className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText ? [{ id: "editText", title: "编辑文本", label: "编辑文字", icon: <Pencil className="size-4" />, onClick: () => onEditText(node) }] : []),
        ...(isComment ? [{ id: "editComment", title: "编辑注释", label: "编辑", icon: <Pencil className="size-4" />, onClick: () => onEditText(node) }, { id: "beautifyComment", title: "使用 AI 美化 Markdown", label: node.metadata?.commentBeautifying ? "美化中" : "一键美化", icon: <Sparkles className="size-4" />, onClick: () => onBeautifyComment(node) }] : []),
        ...(isText ? [{ id: "generateImage", title: "生成", label: "生成", icon: <Blocks className="size-4" />, onClick: () => onGenerateImage(node) }] : []),
        ...(isConfig ? [{ id: "config", title: "生成模组", label: "生成模组", icon: <Blocks className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isSplit ? [{ id: "split", title: "拆分", label: "拆分", icon: <Split className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(hasVideo ? [{ id: "useMiddleFrame", title: "使用中间帧", label: "使用中间帧", icon: <Film className="size-4" />, onClick: () => onUseMiddleFrame(node) }] : []),
        ...(hasVideo ? [{ id: "useLastFrame", title: "使用尾帧", label: "使用尾帧", icon: <ImagePlus className="size-4" />, onClick: () => onUseLastFrame(node) }] : []),
        ...(isText ? [{ id: "decreaseFont", title: "减小字号", label: "缩小", icon: <Minus className="size-4" />, onClick: () => onDecreaseFont(node) }] : []),
        ...(isText ? [{ id: "increaseFont", title: "增大字号", label: "放大", icon: <Plus className="size-4" />, onClick: () => onIncreaseFont(node) }] : []),
        ...(isImage && !hasImage ? [{ id: "uploadImage", title: "上传图片", label: "上传图片", icon: <Upload className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isVideo ? [{ id: "uploadVideo", title: hasVideo ? "替换视频" : "上传视频", label: hasVideo ? "替换视频" : "上传视频", icon: <Video className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isAudio ? [{ id: "uploadAudio", title: hasAudio ? "替换音频" : "上传音频", label: hasAudio ? "替换音频" : "上传音频", icon: <AudioLines className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(hasImage ? imageTools.map((tool) => ({ id: tool.id, title: tool.title, label: tool.label, icon: tool.icon, active: tool.active, onClick: tool.onClick })) : []),
    ];
    const allToolbarTools = [...baseToolbarTools, ...nodeToolbarTools];
    const readonlyToolIds = new Set(["info", "saveAsset", "copyPrompt", "download", "viewImage"]);
    const visibleToolbarTools = locked ? allToolbarTools.filter((tool) => readonlyToolIds.has(tool.id)) : allToolbarTools;
    const toolbarTools = hasImage ? visibleToolbarTools.filter((tool) => quickImageToolIdSet.has(tool.id as ImageQuickToolId)) : visibleToolbarTools;

    return (
        <div
            className="absolute z-[70] flex h-12 -translate-x-1/2 -translate-y-full items-center overflow-visible rounded-[18px] border border-black/10 bg-white text-[15px] text-[#242529] shadow-[0_8px_28px_rgba(15,23,42,.12)]"
            style={{ left, top }}
            onMouseEnter={() => onKeep(node.id)}
            onMouseLeave={onLeave}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <Tooltip title={locked ? "解锁节点" : lockDisabled ? "运行中无法锁定" : "锁定节点"} placement="top" mouseEnterDelay={0.2} color="#ffffff" styles={{ root: { color: "#242529", boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
                <button type="button" disabled={lockDisabled} className="group relative flex h-12 items-center whitespace-nowrap px-1.5 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onToggleLock(node)} aria-label={locked ? "解锁节点" : "锁定节点"}>
                    <span className="flex h-9 items-center justify-center rounded-lg px-2 transition group-hover:bg-[#f0f0f1]">
                        {locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                    </span>
                </button>
            </Tooltip>
            <ToolbarAction id="duplicate" title="复制节点" label="复制" icon={<Copy className="size-4" />} onClick={() => onDuplicate(node)} showLabel={showImageToolLabels} />
            <ToolbarAction id="copy-node-id" title="复制节点 ID" label="ID" icon={<Fingerprint className="size-4" />} onClick={copyNodeId} showLabel={showImageToolLabels} />
            <MiniMaxH3EnhancementButton
                variant="toolbar"
                sourceAssetId={node.metadata?.h3SourceStorageKey || node.metadata?.storageKey}
                eligible={hasVideo && supportsMiniMaxH3HdRepair(providerIdForModel(node.metadata?.model || "") || "", node.metadata?.vquality)}
                onReady={(asset) => onEnhancementReady?.(node, asset)}
            />
            {isComment && !locked ? <>
                <Dropdown trigger={["click"]} menu={{ items: CANVAS_COMMENT_COLORS.map((color) => ({ key: color, label: commentColorLabel(color), onClick: () => onSetCommentColor(node, color) })) }}>
                    <button type="button" className="group relative flex h-12 items-center whitespace-nowrap px-1.5" aria-label="注释颜色"><span className="flex h-9 items-center gap-2 rounded-lg px-2.5 transition group-hover:bg-[#f0f0f1]"><Palette className="size-4" /><span>颜色</span></span></button>
                </Dropdown>
                <Select size="small" variant="borderless" className="!w-36" value={node.metadata?.commentModel || undefined} placeholder="选择模型" onChange={(model) => onSetCommentModel(node, model)} options={commentModels.map((model) => ({ value: model, label: modelOptionName(model) }))} />
            </> : null}
            {toolbarTools.map((tool) => (
                <ToolbarAction key={tool.id} {...tool} showLabel={showImageToolLabels} />
            ))}
        </div>
    );
}

function commentColorLabel(color: CanvasCommentColor) {
    return ({ default: "默认", yellow: "黄色", green: "绿色", blue: "蓝色", purple: "紫色", pink: "粉色" } as const)[color];
}

export function CanvasNodeInfoModal({ node, open, onClose }: { node: CanvasNodeData | null; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [view, setView] = useState<"info" | "json">("info");
    const imageBytes = node?.type === CanvasNodeType.Image && node.metadata?.content ? getDataUrlByteSize(node.metadata.content) : 0;
    const batchCount = isMediaBatchRoot(node) ? node?.metadata?.batchChildIds?.length || 0 : 0;
    const json = useMemo(() => {
        if (!node) return "";
        return JSON.stringify(
            node,
            (key, value) => {
                if (key === "content" && typeof value === "string" && value.startsWith("data:image/")) {
                    return "[base64 image]";
                }
                return value;
            },
            2,
        );
    }, [node]);

    useEffect(() => {
        if (open) setView("info");
    }, [node?.id, open]);

    const title = (
        <div className="flex items-center justify-between gap-4 pr-12">
            <span>节点信息</span>
            <Segmented
                size="small"
                value={view}
                onChange={(value) => setView(value as "info" | "json")}
                options={[
                    { label: "信息", value: "info" },
                    { label: "JSON", value: "json" },
                ]}
            />
        </div>
    );

    return (
        <Modal className="canvas-node-info-modal" title={title} open={open && Boolean(node)} centered footer={null} onCancel={onClose}>
            {node ? (
                <div className="h-[56vh] min-h-[360px] text-sm">
                    {view === "info" ? (
                        <div className="thin-scrollbar h-full space-y-3 overflow-auto pr-1">
                            <InfoRow label="ID" value={node.id} />
                            <InfoRow label="名称" value={node.title || "未命名节点"} />
                            <InfoRow label="类型" value={node.type === CanvasNodeType.Text ? "文本" : node.type === CanvasNodeType.Comment ? "注释" : node.type === CanvasNodeType.Image ? "图片" : node.type === CanvasNodeType.Video ? "视频" : node.type === CanvasNodeType.Audio ? "音频" : node.type === CanvasNodeType.Music ? "音乐" : node.type === CanvasNodeType.WorkflowGroup ? "工作流组" : node.type === CanvasNodeType.Group ? "组" : node.type === CanvasNodeType.Split ? "拆分" : "生成模组"} />
                            <InfoRow label="尺寸" value={`${Math.round(node.width)} x ${Math.round(node.height)}`} />
                            <InfoRow label="位置" value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
                            <InfoRow label="状态" value={node.metadata?.status || "idle"} />
                            {batchCount > 1 && node ? <InfoRow label={mediaBatchKind(node) === "video" ? "视频组" : "图片组"} value={`${batchCount} ${mediaBatchKind(node) === "video" ? "个" : "张"}`} /> : null}
                            {node.metadata?.prompt ? <InfoRow label="提示词" value={node.metadata.prompt} /> : null}
                            {node.metadata?.musicDescription ? <InfoRow label="音乐描述" value={node.metadata.musicDescription} /> : null}
                            {node.metadata?.musicLyrics ? <InfoRow label="歌词" value={node.metadata.musicLyrics} /> : null}
                            {node.metadata?.musicCoverUrl ? <InfoRow label="封面" value={node.metadata.musicCoverUrl} /> : null}
                            {node.metadata?.musicBatchId ? <InfoRow label="音乐批次" value={node.metadata.musicBatchId} /> : null}
                            {imageBytes ? <InfoRow label="图片大小" value={formatBytes(imageBytes)} /> : null}
                            {node.metadata?.errorDetails ? (
                                <div className="rounded-lg border p-3 text-red-400" style={{ borderColor: theme.node.stroke }}>
                                    {node.metadata.errorDetails}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <pre className="thin-scrollbar h-full overflow-auto rounded-lg border p-3 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
                            {json}
                        </pre>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

function ToolbarAction({ title, label, icon, onClick, showLabel, active = false, danger = false }: ToolbarTool & { showLabel: boolean }) {
    const hasText = showLabel && Boolean(label);
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2} color="#ffffff" styles={{ root: { color: "#242529", boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
            <button type="button" className={`group relative flex h-12 items-center whitespace-nowrap px-1.5 ${danger ? "text-[#ef4444]" : ""}`} onClick={onClick} aria-label={title}>
                <span className={`flex h-9 items-center ${hasText ? "gap-2 px-2.5" : "justify-center px-2"} rounded-lg transition group-hover:bg-[#f0f0f1] ${active ? "bg-[#eeeeef]" : ""}`}>
                    {icon}
                    {hasText ? <span>{label}</span> : null}
                </span>
            </button>
        </Tooltip>
    );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="opacity-50">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
        </div>
    );
}
