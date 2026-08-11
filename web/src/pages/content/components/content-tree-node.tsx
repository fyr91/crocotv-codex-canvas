import { Button, Modal, Tag, theme as antdTheme } from "antd";
import { ChevronDown, ChevronRight, Download, Image, ListTree, LoaderCircle, Music2, RefreshCw, Sparkles, Square, Type, UploadCloud, Video, Volume2, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";

import { CanvasNodeReasoningBox } from "@/components/canvas/canvas-node-reasoning-box";
import { CanvasNodeIconButton } from "@/components/canvas/canvas-node-icon-button";
import { CanvasStackFrame } from "@/components/canvas/canvas-stack-frame";
import { AudioNodePlayer } from "@/components/audio/audio-node-player";
import { canvasThemes } from "@/lib/canvas-theme";
import { contentNodeMinimumHeight } from "@/lib/content-production/content-tree";
import { contentNodePanelKind } from "@/lib/content-production/content-workboard";
import { contentStorylineSnapshot } from "@/lib/content-production/storyline";
import { contentStoryboardSnapshot } from "@/lib/content-production/storyboard";
import { contentTopicFactorySnapshot, topicFactoryPhaseLabel, topicFactoryScoreColor } from "@/lib/content-production/topic-factory";
import { cn } from "@/lib/utils";
import type { GenerationJob } from "@/services/api/generation-client";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContentNode } from "@/types/content-production";

const icons = {
    text: Type,
    image: Image,
    video: Video,
    audio: Volume2,
    music: Music2,
    batch: ListTree,
} as const;

const typeLabels: Record<ContentNode["nodeType"], string> = {
    topic: "Topic",
    angle: "选题",
    orientation: "方向",
    storyline: "故事线",
    script: "脚本",
    shot: "镜头",
    resource_requirements: "资源需求",
    storyboard_prompt: "分镜提示词",
    image: "分镜图",
    tts: "角色语音",
    music: "音乐",
    video: "视频 Clip",
    batch: "生成批次",
    text: "文本",
};

export function shouldActivateContentTreeNode(key: string, target: EventTarget | null, currentTarget: EventTarget) {
    return target === currentTarget && (key === "Enter" || key === " ");
}

export function ContentTreeNode({
    node,
    x,
    y,
    selected,
    onSelect,
    onRegenerate,
    regenerateTitle,
    regenerating = false,
    regenerateDisabled = false,
    onStop,
    stopping = false,
    optimizeOpen = false,
    optimizing = false,
    optimizeTitle,
    onToggleOptimize,
    onOptimize,
    collapsed = false,
    onToggleCollapse,
    collapsibleLabel,
    showCollapseAction = true,
    quickActionTitle,
    onQuickAction,
    quickActionLoading = false,
    quickActionDisabled = false,
    downloadTitle,
    onDownload,
    downloading = false,
    downloadDisabled = false,
    downloadAfterRegenerate = false,
    onHeightChange,
    jobs = [],
    stackCount = 0,
    onContextMenu,
    onConnectStart,
    connectTitle = "创建连接",
    connecting = false,
    onImageFile,
    onImagePick,
}: {
    node: ContentNode;
    x: number;
    y: number;
    selected: boolean;
    onSelect: (event?: MouseEvent<HTMLDivElement>) => void;
    onRegenerate?: () => void;
    regenerateTitle?: string;
    regenerating?: boolean;
    regenerateDisabled?: boolean;
    onStop?: () => void;
    stopping?: boolean;
    optimizeOpen?: boolean;
    optimizing?: boolean;
    optimizeTitle?: string;
    onToggleOptimize?: () => void;
    onOptimize?: (direction: string) => Promise<void>;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
    collapsibleLabel?: string;
    showCollapseAction?: boolean;
    quickActionTitle?: string;
    onQuickAction?: () => void;
    quickActionLoading?: boolean;
    quickActionDisabled?: boolean;
    downloadTitle?: string;
    onDownload?: () => void;
    downloading?: boolean;
    downloadDisabled?: boolean;
    downloadAfterRegenerate?: boolean;
    onHeightChange?: (nodeId: string, height: number) => void;
    jobs?: GenerationJob[];
    stackCount?: number;
    onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
    onConnectStart?: (event: MouseEvent<HTMLButtonElement>) => void;
    connectTitle?: string;
    connecting?: boolean;
    onImageFile?: (file: File) => void;
    onImagePick?: () => void;
}) {
    const nodeRef = useRef<HTMLDivElement>(null);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();
    const [direction, setDirection] = useState("");
    const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!optimizeOpen) setDirection("");
    }, [optimizeOpen]);
    useEffect(() => {
        const element = nodeRef.current;
        if (!element || !onHeightChange) return;
        const reportHeight = () => onHeightChange(node.id, element.offsetHeight);
        reportHeight();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(reportHeight);
        observer.observe(element);
        return () => observer.disconnect();
    }, [node.id, onHeightChange]);
    const Icon = icons[contentNodePanelKind(node.nodeType)];
    const mediaUrl = typeof node.data.url === "string" ? node.data.url : "";
    const factory = contentTopicFactorySnapshot(node);
    const storyline = contentStorylineSnapshot(node);
    const storyboard = contentStoryboardSnapshot(node);
    const workflow = factory || storyline || storyboard;
    const currentJob = jobs.find((job) => ["queued", "running"].includes(job.status)) || jobs.at(-1);
    const processRunning = Boolean(currentJob && ["queued", "running"].includes(currentJob.status));
    const workflowRunning = Boolean(workflow && ["queued", "generating", "persisting", "reviewing", "revising", "humanizing", "producer_running", "reviewer_running", "repairing"].includes(workflow.phase));
    const isReviewing = workflow?.phase === "reviewing" || workflow?.phase === "reviewer_running";
    const isHumanizing = factory?.phase === "humanizing";
    const reviewScore = factory?.review?.total_score ?? storyline?.review?.total_score;
    const acceptedScoreColor = typeof reviewScore === "number"
        ? topicFactoryScoreColor(reviewScore)
        : undefined;
    const effectiveRegenerateTitle = regenerateTitle || (node.nodeType === "topic" ? "重新生成全部选题" : factory ? "重新生成这个选题" : storyline ? "重构这个故事线" : storyboard?.header ? "重新生成整套分镜" : "");
    const effectiveOptimizeTitle = optimizeTitle || (storyboard ? (storyboard.header ? "优化整套分镜" : "优化当前分镜") : storyline ? "优化这个故事线" : factory ? "优化这个选题" : "");
    const candidateTitle = factory?.candidate?.title || storyline?.candidate?.positioning.core_narrative_anchor || storyboard?.header?.storyline_title || node.title;
    const candidateSummary = factory?.candidate?.core_hook || storyline?.candidate?.positioning.emotional_value || storyboard?.node?.script_content.visual_summary || node.summary;
    const compactStatusOnly = node.data.compactStatusOnly === true;
    const compactAudio = (node.nodeType === "tts" || node.nodeType === "music") && Boolean(mediaUrl);
    const roleImage = node.nodeType === "image" && node.data.roleImage === true;
    const generationQueued = node.status === "running" && node.data.generationStage === "queued";
    const minHeight = roleImage ? 260 : node.nodeType === "music" && Boolean(mediaUrl) ? 144 : compactAudio ? 176 : contentNodeMinimumHeight(optimizeOpen);
    const firstFrameUrl = typeof node.data.firstFrameUrl === "string" ? node.data.firstFrameUrl : "";
    const semanticBorder = node.status === "failed" || node.noticeKind === "failure"
        ? token.colorError
        : node.noticeUnread && node.noticeKind === "attention"
            ? token.colorWarning
            : node.noticeUnread && node.noticeKind === "success" ? theme.node.noticeSuccessStroke : theme.node.stroke;
    const downloadAction = downloadTitle && onDownload ? (
        <CanvasNodeIconButton
            title={downloadTitle}
            icon={<Download className={cn("size-4", downloading && "animate-pulse")} />}
            disabled={downloading || downloadDisabled}
            onClick={(event) => {
                event.stopPropagation();
                onDownload();
            }}
        />
    ) : null;
    return (
        <div
            ref={nodeRef}
            role="button"
            tabIndex={0}
            data-node-id={node.id}
            className={cn("absolute w-[280px] rounded-2xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl", selected && "ring-2 ring-offset-2")}
            style={{
                left: x,
                top: y,
                minHeight,
                color: theme.node.text,
                background: theme.node.panel,
                borderColor: selected ? theme.node.activeStroke : semanticBorder,
                ["--tw-ring-color" as string]: theme.node.activeStroke,
                ["--tw-ring-offset-color" as string]: theme.canvas.background,
                ["--node-action-hover" as string]: theme.toolbar.itemHover,
            }}
            onClick={(event) => {
                event.stopPropagation();
                onSelect(event);
            }}
            onKeyDown={(event) => {
                if (shouldActivateContentTreeNode(event.key, event.target, event.currentTarget)) {
                    event.preventDefault();
                    onSelect();
                }
            }}
            onContextMenu={(event) => {
                if (!onContextMenu) return;
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(event);
            }}
            onDragOver={roleImage && onImageFile ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "copy";
            } : undefined}
            onDrop={roleImage && onImageFile ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
                if (file) onImageFile(file);
            } : undefined}
        >
            {onConnectStart ? (
                <button
                    type="button"
                    aria-label={connectTitle}
                    className={`absolute -right-6 top-1/2 z-30 flex size-12 -translate-y-1/2 cursor-crosshair items-center justify-center transition-opacity duration-150 ${selected || connecting ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100"}`}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onConnectStart(event);
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    <span className="size-3 rounded-full border-2 transition-transform hover:scale-125" style={{ background: theme.node.panel, borderColor: theme.node.muted }} />
                </button>
            ) : null}
            <CanvasStackFrame stackCount={stackCount} expanded={!collapsed} onToggle={onToggleCollapse} className={cn("flex min-h-[inherit] flex-col rounded-[inherit]", compactAudio ? "p-3" : "p-4")}>
            {node.noticeUnread && node.noticeKind && node.noticeKind !== "success" ? (
                <span
                    className="absolute right-3 top-3 size-2.5 rounded-full"
                    style={{ background: node.noticeKind === "failure" ? token.colorError : token.colorWarning }}
                    aria-label={node.noticeKind === "failure" ? "生成失败，未查看" : "需要处理，未查看"}
                />
            ) : null}
            {node.noticeUnread && node.noticeKind === "success" ? <span className="sr-only">生成完成，未查看</span> : null}
            <span className="flex items-center gap-2 text-xs" style={{ color: theme.node.muted }}>
                {node.status === "running" && !generationQueued ? <LoaderCircle className="size-4 animate-spin" /> : node.status === "needs_owner_attention" ? <Sparkles className="size-4 text-amber-500" /> : <Icon className="size-4" />}
                {factory ? (
                    <span className="flex min-w-0 flex-col">
                        <span>选题分支 {factory.laneNumber}</span>
                        <span className="text-[11px]" style={{ color: theme.node.faint }}>{factory.laneStrategy}</span>
                    </span>
                ) : storyline ? "故事线 V2" : storyboard ? (storyboard.header ? "分镜脚本" : `分镜 ${storyboard.node?.scene_number || ""}`) : roleImage ? "角色口播图" : typeLabels[node.nodeType]}
                {typeof reviewScore === "number" && acceptedScoreColor ? (
                    <span className="ml-auto flex items-center">
                        <Tag color={acceptedScoreColor} style={{ marginInlineEnd: 0 }}>{reviewScore} 分</Tag>
                    </span>
                ) : null}
            </span>
            <strong className={cn("break-all text-[15px] leading-6", compactAudio ? "mt-2" : "mt-3")}>{candidateTitle}</strong>
            {mediaUrl && node.nodeType === "image" ? roleImage ? (
                <div className="relative mt-2">
                    <button
                        type="button"
                        aria-label="查看角色口播图大图"
                        className="w-full overflow-hidden rounded-lg"
                        onClick={(event) => {
                            event.stopPropagation();
                            setImagePreviewOpen(true);
                        }}
                    >
                        <img src={mediaUrl} alt="角色口播图" className="block h-auto w-full" />
                    </button>
                    <RoleImageNodeActions onImageFile={onImageFile} onImagePick={onImagePick} inputRef={imageInputRef} />
                </div>
            ) : (
                <div className="mt-2 h-14 w-full overflow-hidden rounded-lg">
                    <img src={mediaUrl} alt="" className="size-full object-cover" />
                </div>
            ) : null}
            {roleImage && !mediaUrl ? (
                <div className="relative mt-2">
                    <div
                        className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed px-4 text-center text-xs"
                        style={{ color: theme.node.muted, borderColor: theme.node.stroke }}
                    >
                        拖拽图片到这里
                    </div>
                    <RoleImageNodeActions onImageFile={onImageFile} onImagePick={onImagePick} inputRef={imageInputRef} />
                </div>
            ) : null}
            {mediaUrl && node.nodeType === "video" ? (
                <video
                    src={mediaUrl}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`播放 ${node.title}`}
                    data-canvas-no-zoom
                    className="mt-2 aspect-video w-full rounded-lg bg-black object-contain"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                />
            ) : null}
            {mediaUrl && node.nodeType === "tts" ? <AudioNodePlayer url={mediaUrl} title={node.title} durationMs={typeof node.data.durationMs === "number" ? node.data.durationMs : null} compact hideDuration={compactStatusOnly} /> : null}
            {firstFrameUrl ? <img src={firstFrameUrl} alt="已连接的角色口播图" className="mt-2 h-10 w-full rounded-lg object-cover" /> : null}
            {workflow ? (
                <>
                    <span className="mt-2 line-clamp-2 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {candidateSummary || (factory ? factory.laneStrategy : storyboard ? "正在生成结构化分镜" : "正在构建故事线")}
                    </span>
                    {processRunning && currentJob && ["queued", "generating", "persisting", "reviewing", "revising", "humanizing", "producer_running", "reviewer_running", "repairing"].includes(workflow.phase) ? (
                        <span className="mt-2">
                            <CanvasNodeReasoningBox
                                text={currentJob.reasoning_text || ""}
                                running={processRunning}
                                runningLabel={isReviewing ? (storyline ? "审核中" : "验证中") : isHumanizing ? "去 AI 化中" : ["revising", "repairing"].includes(workflow.phase) ? "调整中" : "生成中"}
                                completeLabel={isReviewing ? (storyline ? "审核过程" : "验证过程") : isHumanizing ? "去 AI 化过程" : "思考过程"}
                            />
                        </span>
                    ) : null}
                </>
            ) : roleImage ? null : !mediaUrl || !["image", "video", "tts", "music"].includes(node.nodeType) ? (
                <>
                    <span className="mt-2 line-clamp-3 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {currentJob?.output_text || node.summary || "选择节点查看内容与生成设置"}
                    </span>
                    {processRunning && currentJob ? (
                        <span className="mt-2">
                            <CanvasNodeReasoningBox text={currentJob.reasoning_text || ""} running runningLabel="生成中" />
                        </span>
                    ) : null}
                </>
            ) : null}
            <div className={cn("mt-auto flex items-center justify-between gap-2", compactAudio ? "pt-2" : "pt-4")}>
                <span className="text-[11px]" style={{ color: theme.node.faint }}>
                    {factory
                        ? `${topicFactoryPhaseLabel(factory.phase)} · 第 ${factory.reviewCycle} 轮`
                        : storyline
                            ? `${storylinePhaseLabel(storyline.phase)} · 第 ${storyline.round} 轮`
                            : node.status === "succeeded" ? "已生成" : node.status === "failed" ? "生成失败" : generationQueued ? "排队中" : node.status === "running" ? "生成中" : "探索节点"}
                </span>
                <span className="flex items-center gap-1" style={{ color: theme.node.muted }}>
                    {workflowRunning && onStop ? (
                        <Button
                            type="text"
                            size="small"
                            danger
                            loading={stopping}
                            icon={stopping ? undefined : <Square className="size-3 fill-current" />}
                            aria-label={storyboard ? "停止分镜任务" : "停止这个选题"}
                            className="min-h-8"
                            onClick={(event) => {
                                event.stopPropagation();
                                onStop();
                            }}
                        >
                            停止
                        </Button>
                    ) : null}
                    {effectiveOptimizeTitle && onToggleOptimize ? (
                        <CanvasNodeIconButton
                            title={effectiveOptimizeTitle}
                            icon={<WandSparkles className="size-4" />}
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggleOptimize();
                            }}
                        />
                    ) : null}
                    {showCollapseAction && onToggleCollapse && (storyboard?.header || collapsibleLabel) ? (
                        <CanvasNodeIconButton
                            title={`${collapsed ? "展开" : "收起"}${collapsibleLabel || "分镜节点"}`}
                            icon={collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggleCollapse();
                            }}
                        />
                    ) : null}
                    {quickActionTitle && onQuickAction ? (
                        <CanvasNodeIconButton
                            title={quickActionTitle}
                            icon={<Volume2 className={cn("size-4", quickActionLoading && "animate-pulse")} />}
                            disabled={quickActionLoading || quickActionDisabled}
                            onClick={(event) => {
                                event.stopPropagation();
                                onQuickAction();
                            }}
                        />
                    ) : null}
                    {!downloadAfterRegenerate ? downloadAction : null}
                    {effectiveRegenerateTitle && onRegenerate ? (
                        <CanvasNodeIconButton
                            title={effectiveRegenerateTitle}
                            icon={<RefreshCw className={cn("size-4", regenerating && "animate-spin")} />}
                            disabled={regenerating || regenerateDisabled || processRunning || workflowRunning}
                            onClick={(event) => {
                                event.stopPropagation();
                                onRegenerate();
                            }}
                        />
                    ) : null}
                    {downloadAfterRegenerate ? downloadAction : null}
                </span>
            </div>
            {optimizeOpen ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: theme.node.stroke }} onClick={(event) => event.stopPropagation()}>
                    <textarea
                        className="h-14 w-full resize-none rounded-lg border bg-transparent px-2.5 py-2 text-xs outline-none focus:ring-2"
                        style={{ borderColor: theme.node.stroke, ["--tw-ring-color" as string]: theme.node.activeStroke }}
                        value={direction}
                        placeholder="输入优化方向"
                        autoFocus
                        onChange={(event) => setDirection(event.target.value)}
                    />
                    <Button
                        type="primary"
                        size="small"
                        block
                        className="mt-2"
                        style={{ background: token.colorPrimary, borderColor: token.colorPrimary, color: token.colorTextLightSolid }}
                        disabled={!direction.trim() || optimizing}
                        onClick={() => void onOptimize?.(direction.trim())}
                    >
                        {optimizing ? "优化中…" : "优化"}
                    </Button>
                </div>
            ) : null}
            </CanvasStackFrame>
            {roleImage && mediaUrl ? <Modal title="角色口播图" open={imagePreviewOpen} footer={null} centered onCancel={() => setImagePreviewOpen(false)}>
                {mediaUrl ? <img src={mediaUrl} alt="角色口播图大图预览" className="mx-auto block h-auto max-h-[70vh] max-w-full rounded-xl" /> : null}
            </Modal> : null}
        </div>
    );
}

function RoleImageNodeActions({
    onImageFile,
    onImagePick,
    inputRef,
}: {
    onImageFile?: (file: File) => void;
    onImagePick?: () => void;
    inputRef: RefObject<HTMLInputElement | null>;
}) {
    if (!onImageFile && !onImagePick) return null;
    return (
        <>
            <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-lg bg-[var(--surface-overlay)]/90 p-1 text-muted-foreground">
                {onImageFile ? <CanvasNodeIconButton
                    title="重新上传角色口播图"
                    icon={<UploadCloud className="size-4" />}
                    onClick={(event) => {
                        event.stopPropagation();
                        inputRef.current?.click();
                    }}
                /> : null}
                {onImagePick ? <CanvasNodeIconButton
                    title="从素材库替换角色口播图"
                    icon={<Image className="size-4" />}
                    onClick={(event) => {
                        event.stopPropagation();
                        onImagePick();
                    }}
                /> : null}
            </div>
            {onImageFile ? <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="上传角色口播图文件"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onImageFile(file);
                    event.target.value = "";
                }}
            /> : null}
        </>
    );
}

function storylinePhaseLabel(phase: NonNullable<ReturnType<typeof contentStorylineSnapshot>>["phase"]) {
    const labels = {
        producer_running: "生成中",
        reviewer_running: "审核中",
        repairing: "调整中",
        accepted: "已通过",
        needs_owner_attention: "需要处理",
        failed: "失败",
    } as const;
    return labels[phase];
}
