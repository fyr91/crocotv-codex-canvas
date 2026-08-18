import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AudioLines, Blocks, Clapperboard, Copy, Home, ImageIcon, Images, List, Menu, Music2, Plus, Redo2, Send, Split, Trash2, Undo2, Upload, Video } from "lucide-react";
import { saveAs } from "file-saver";
import { useQueryClient } from "@tanstack/react-query";

import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { requestMusicGeneration, type GeneratedMusic } from "@/services/api/music";
import { requestVideoGeneration, resumeVideoGeneration, storeGeneratedVideo, type VideoGenerationResult } from "@/services/api/video";
import { approveLtxStage1, type LtxStage1ReviewReady } from "@/services/api/ltx-delivery-client";
import { requestSplitGeneration, requestTextGeneration, waitForGeneration } from "@/services/api/generation-client";
import { cancelCanvasRunJob, startCanvasRunJob, waitForCanvasRunJob } from "@/services/api/canvas-run-jobs";
import { cancelGeneration } from "@/services/api/usage";
import { getCloudAsset, type CloudAsset } from "@/services/api/cloud-assets";
import { createSharedPrompt, type SharedPromptNodeType } from "@/services/api/shared-prompts";
import { audioModelForKind, defaultConfig, modelConfigForModel, modelMatchesCapability, modelSupportsInputModalities, modelSupportsMaskEdit, modelSupportsWebSearch, normalizeImageSizeForModel, normalizeVideoInputModeForModel, providerCapabilityForModel, providerIdForModel, selectableModelsByInputModalities, type AiConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";
import { getMediaBlob, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useCopyText } from "@/hooks/use-copy-text";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "@/lib/canvas/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio } from "@/lib/canvas/canvas-node-size";
import { cancelableQueuedLtxJobIds, horizontalBatchResultPosition, isMediaBatchChild, isMediaBatchRoot, mediaBatchChildPosition, remoteCancelableVideoJobIds, videoBatchOutputIndex } from "@/lib/canvas/canvas-media-batch";
import { shouldIgnoreCanvasKeyboardShortcut } from "@/lib/canvas/canvas-keyboard";
import { extractVideoLastFrame } from "@/lib/video-last-frame";
import { App, Button, Dropdown, Modal } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "@/constant/canvas";
import { ActiveConnectionPath, ConnectionPath } from "@/components/canvas/canvas-connections";
import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { CanvasSplitNodePanel } from "@/components/canvas/canvas-split-node-panel";
import { CanvasNodeContextMenu } from "@/components/canvas/canvas-context-menu";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog, type CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import { CanvasNodeUpscaleDialog, type CanvasImageUpscaleParams } from "@/components/canvas/canvas-node-upscale-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, selectExplicitMediaMentions, type NodeGenerationContext, type NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "@/components/canvas/canvas-node-hover-toolbar";
import { CrocoCanvas } from "@/components/canvas/crocotv-canvas";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNode } from "@/components/canvas/canvas-node";
import { CanvasNodeLod } from "@/components/canvas/canvas-node-lod";
import { CanvasOverviewLayer } from "@/components/canvas/canvas-overview-layer";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { CanvasVideoFramePicker } from "@/components/canvas/canvas-video-frame-picker";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { CanvasTemplateSubmitModal } from "@/components/canvas/canvas-template-submit-modal";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { studioOrigin } from "@/lib/studio-origin";
import { AudioSegmentationPanel } from "@/components/audio/audio-segmentation-panel";
import { useCanvasStore, type CanvasProject, type CanvasSaveState } from "@/stores/canvas/use-canvas-store";
import { applyStudioCanvasEdits, canvasClientId, readCanvasProject, subscribeCanvasProject, type StudioCanvasEdit } from "@/services/canvas-live-sync";
import { isCanvasReadOnly } from "@/lib/canvas/canvas-project-access";
import { buildCanvasResourceReferences, buildNodeMentionReferences, getPendingUploadResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { completeCanvasUploadNode, useCanvasUploadStore, type CanvasUploadKind, type CanvasUploadTask } from "@/stores/canvas/use-canvas-upload-store";
import type { PromptPanelLayout } from "@/lib/canvas/prompt-panel-resize";
import { canvasNodePrompt, promptTitle } from "@/lib/canvas/prompt";
import { exportCanvasResultNodes, selectedCanvasResultNodes } from "@/lib/canvas/canvas-result-export";
import { buildSplitContext, createSplitOutputGraph, hasSplitOutputs, parseSplitResponse, requiredInputModalities, SPLIT_SYSTEM_PROMPT } from "@/lib/canvas/canvas-split";
import { musicConfigFromMetadata, validateMusicGeneration, type MusicGenerationConfig } from "@/lib/music-generation";
import { resolveAutomaticLtxVideoInputMode, resolveVideoFramePair } from "@/lib/video-input-mode";
import { resolveHappyHorseVideoSelection } from "@/lib/canvas/happyhorse-video-input";
import { resolveHappyHorseInlineReferences } from "@/lib/canvas/happyhorse-inline-references";
import { resolveMiniMaxH3InlineReferences } from "@/lib/canvas/minimax-h3-inline-references";
import { normalizeVideoGenerationOptions } from "@/lib/video-generation-options";
import { bindActiveVideoModel } from "@/lib/video-model";
import { canConnectCanvasNodes, COMMENT_BEAUTIFY_SYSTEM_PROMPT, pickCommentModel } from "@/lib/canvas/canvas-comment";
import { connectionHandlesForSelection, planCanvasConnections } from "@/lib/canvas/canvas-connection-plan";
import { attachWorkflowOutputResults, expandWorkflowGroupBounds, isCanvasGroupNode, remapWorkflowPrompt, WORKFLOW_INPUT_ID, workflowBatchInputs, workflowExecutableNodes, workflowGenerationMode, workflowOutputTemplateIds, workflowReadyNodeIds, workflowTemplateDependencies } from "@/lib/canvas/canvas-workflow";
import { duplicateCanvasNode } from "@/lib/canvas/canvas-node-duplicate";
import { replaceCanvasAudioSegmentNodes } from "@/lib/canvas/audio-segment-nodes";
import { isCanvasNodeLockBusy, isCanvasNodeLocked, setCanvasNodeLocked } from "@/lib/canvas/canvas-node-lock";
import { canvasNodeRenderDetail, canvasViewportBounds, connectionIntersectsCanvasBounds, nodeIntersectsCanvasBounds, shouldUseCanvasOverview } from "@/lib/canvas/canvas-viewport-virtualization";
import type { AudioSegmentationSubmit } from "@/lib/audio/segmentation";
import { useUserStore } from "@/stores/use-user-store";
import {
    CanvasNodeType,
    type CanvasAssistantImage,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasConnectionPort,
    type CanvasImageGenerationType,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type SelectionBox,
    type ViewportTransform,
} from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type PendingConnectionCreate = {
    connections: ConnectionHandle[];
    position: Position;
};

type CanvasCreateNodeType = CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Split | CanvasNodeType.Video | CanvasNodeType.Audio | CanvasNodeType.Music;

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

type CanvasGenerationRequest = {
    targetNodeId: string;
    originNodeId: string;
    runningNodeId: string;
    controller: AbortController;
};

type WorkflowGenerationOptions = {
    runningId: string;
    runId: string;
    groupId: string;
    templateNodeId: string;
    batchIndex: number;
    layoutIndex: number;
    contextNodes: CanvasNodeData[];
    contextConnections: CanvasConnection[];
};

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;
const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;
const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

function createCanvasNode(type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - spec.width / 2,
            y: position.y - spec.height / 2,
        },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, ...metadata },
    };
}

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <CrocoCanvasPage />;
}

function CanvasRefreshShell() {
    return (
        <main className="relative h-full min-h-0 overflow-hidden bg-background text-foreground">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />

            <div className="absolute bottom-5 left-1/2 z-50 flex h-14 -translate-x-1/2 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="size-8 rounded-md bg-current opacity-10" />
                ))}
            </div>

            <div className="absolute bottom-24 left-6 z-50 h-40 w-[240px] rounded-lg border shadow-2xl backdrop-blur-sm" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                <div className="absolute left-7 top-7 h-5 w-12 rounded-sm bg-current opacity-10" />
                <div className="absolute left-28 top-16 h-6 w-16 rounded-sm bg-current opacity-10" />
                <div className="absolute bottom-7 left-16 h-8 w-20 rounded-sm bg-current opacity-10" />
                <div className="absolute inset-5 rounded border border-current opacity-15" />
            </div>

            <div className="absolute bottom-5 left-5 z-50 flex h-14 w-[260px] items-center gap-2 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                <div className="size-8 rounded-md bg-current opacity-10" />
                <div className="size-8 rounded-md bg-current opacity-10" />
                <div className="h-1 flex-1 rounded-full bg-current opacity-10" />
                <div className="h-4 w-10 rounded bg-current opacity-10" />
                <div className="size-8 rounded-md bg-current opacity-10" />
            </div>
        </main>
    );
}

function CanvasCreateNodeMenu({ position, title, onCreate, onClose }: { position: Position; title: string; onCreate: (type: CanvasCreateNodeType) => void; onClose: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    return (
        <div
            className="absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: position.x, top: position.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    {title}
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭">
                    ×
                </button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本生成" description="脚本、广告词、品牌文案" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片生成" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频生成" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<AudioLines className="size-5" />} title="音频生成" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-5" />} title="音乐生成" onClick={() => onCreate(CanvasNodeType.Music)} />
                <ConnectionCreateOption theme={theme} icon={<Blocks className="size-5" />} title="生成模组" description="模型、尺寸、数量和输入顺序" onClick={() => onCreate(CanvasNodeType.Config)} />
                <ConnectionCreateOption theme={theme} icon={<Split className="size-5" />} title="拆分" description="将多个输入拆成文本节点" onClick={() => onCreate(CanvasNodeType.Split)} />
            </div>
        </div>
    );
}

function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button type="button" className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition" style={{ color: theme.node.text }} onClick={onClick} onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)} onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold leading-5">{title}</span>
                {description ? <span className="mt-1 block truncate text-sm" style={{ color: theme.node.muted }}>{description}</span> : null}
            </span>
        </button>
    );
}

function isCanvasManagedGeneration(node: CanvasNodeData | undefined) {
    return node?.type === CanvasNodeType.Config
        && node.metadata?.remoteOperationActive === true
        && node.metadata.remoteOperationOrigin === "canvas";
}

function ReadOnlyConfigNode({ node }: { node: CanvasNodeData }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const prompt = node.metadata?.composerContent || node.metadata?.prompt || "未填写提示词";
    return (
        <div className="flex h-full flex-col gap-3 overflow-hidden p-5" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex items-center gap-2 text-sm font-semibold">
                {node.type === CanvasNodeType.Split ? <Split className="size-4" /> : <Blocks className="size-4" />}
                {node.type === CanvasNodeType.Split ? "拆分" : "生成模组"}
            </div>
            <div className="text-xs" style={{ color: theme.node.muted }}>
                {node.metadata?.model || "未选择模型"}{node.type === CanvasNodeType.Split ? ` · ${node.metadata?.splitCount === "auto" || node.metadata?.splitCount == null ? "Auto" : `${node.metadata.splitCount} 个`}` : ` · ${node.metadata?.size || "默认尺寸"}`}
            </div>
            <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-6" style={{ color: theme.node.muted }}>
                {prompt}
            </p>
        </div>
    );
}

function CrocoCanvasPage() {
    const { message, modal } = App.useApp();
    const copyText = useCopyText();
    const queryClient = useQueryClient();
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const projectId = params.id || "";
    const [searchParams] = useSearchParams();
    const isTemplatePreview = searchParams.get("template-preview") === "1";
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const didInitialCenterRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const nodeDraggingRef = useRef(false);
    const dragRef = useRef<{
        isDraggingNode: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        initialSelectedNodes: { id: string; x: number; y: number }[];
    }>({
        isDraggingNode: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: [],
    });

    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const profile = useUserStore((state) => state.profile);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const initializeCanvas = useCanvasStore((state) => state.initialize);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const copyProject = useCanvasStore((state) => state.copyProject);
    const loadTemplatePreview = useCanvasStore((state) => state.loadTemplatePreview);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const applyRemoteProject = useCanvasStore((state) => state.applyRemoteProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
    const hasCurrentProject = Boolean(currentProject);
    const saveState = useCanvasStore((state) => state.saveStates[projectId]);
    const isReadOnly = isTemplatePreview || isCanvasReadOnly(currentProject, profile?.id || "");
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [exportingSelectedResults, setExportingSelectedResults] = useState(false);
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectingHandles, setConnectingHandles] = useState<ConnectionHandle[]>([]);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [canvasCreatePosition, setCanvasCreatePosition] = useState<Position | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const backgroundMode: CanvasBackgroundMode = "lines";
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editRequestNonce, setEditRequestNonce] = useState(0);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
    const [templateProjectSnapshot, setTemplateProjectSnapshot] = useState<CanvasProject | null>(null);

    useEffect(() => {
        if (!hydrated) void initializeCanvas();
    }, [hydrated, initializeCanvas]);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const connectingParamsRef = useRef(connectingParams);
    const connectingHandlesRef = useRef(connectingHandles);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const generationRequestsRef = useRef(new Map<string, CanvasGenerationRequest>());
    const canvasRunJobIdsRef = useRef(new Map<string, string>());
    const workflowRunTokensRef = useRef(new Map<string, string>());
    const skipRemoteProjectSaveRef = useRef(false);
    const skipRemoteViewportSaveRef = useRef(false);
    const remoteHydrationVersionRef = useRef(0);
    const studioEditTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const pendingStudioNodeEditsRef = useRef(new Map<string, Extract<StudioCanvasEdit, { op: "update_node" }>>());

    const applyCanonicalStudioProject = useCallback(async (remoteProject: CanvasProject) => {
        const remoteVersion = Math.max(0, Number(remoteProject.version) || 0);
        if (remoteVersion && remoteVersion < remoteHydrationVersionRef.current) return;
        if (remoteVersion) remoteHydrationVersionRef.current = remoteVersion;
        applyRemoteProject(remoteProject);
        const remoteNodes = await hydrateCanvasImages(remoteProject.nodes || []);
        if (remoteVersion && remoteVersion !== remoteHydrationVersionRef.current) return;
        skipRemoteProjectSaveRef.current = true;
        setNodes(remoteNodes);
        setConnections(remoteProject.connections || []);
        setSelectedNodeIds((selected) => new Set([...selected].filter((id) => remoteNodes.some((node) => node.id === id))));
    }, [applyRemoteProject]);

    const commitStudioCanvasEdits = useCallback(async (edits: StudioCanvasEdit[]) => {
        if (!edits.length) return;
        try {
            await applyCanonicalStudioProject(await applyStudioCanvasEdits(projectId, edits));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Studio 结构化修改失败");
            try {
                await applyCanonicalStudioProject(await readCanvasProject(projectId));
            } catch {
                // Live sync will retry. Keep the original actionable error visible.
            }
            throw error;
        }
    }, [applyCanonicalStudioProject, message, projectId]);

    const queueStudioNodeEdit = useCallback((nodeId: string, patch: Omit<Extract<StudioCanvasEdit, { op: "update_node" }>, "op" | "nodeId">) => {
        if (nodesRef.current.find((node) => node.id === nodeId)?.metadata?.studioManaged !== true) return;
        const previous = pendingStudioNodeEditsRef.current.get(nodeId);
        pendingStudioNodeEditsRef.current.set(nodeId, {
            op: "update_node",
            nodeId,
            ...(previous?.content === undefined ? {} : { content: previous.content }),
            ...(previous?.title === undefined ? {} : { title: previous.title }),
            ...(previous?.metadata ? { metadata: previous.metadata } : {}),
            ...patch,
            ...(previous?.metadata || patch.metadata ? { metadata: { ...(previous?.metadata || {}), ...(patch.metadata || {}) } } : {}),
        });
        const previousTimer = studioEditTimersRef.current.get(nodeId);
        if (previousTimer) clearTimeout(previousTimer);
        studioEditTimersRef.current.set(nodeId, setTimeout(() => {
            studioEditTimersRef.current.delete(nodeId);
            const edit = pendingStudioNodeEditsRef.current.get(nodeId);
            pendingStudioNodeEditsRef.current.delete(nodeId);
            if (edit) void commitStudioCanvasEdits([edit]).catch(() => undefined);
        }, 350));
    }, [commitStudioCanvasEdits]);

    useEffect(() => () => {
        studioEditTimersRef.current.forEach((timer) => clearTimeout(timer));
        studioEditTimersRef.current.clear();
        pendingStudioNodeEditsRef.current.clear();
    }, [projectId]);

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
        }),
        [activeChatId, backgroundMode, chatSessions, showImageInfo],
    );

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [cleanupAssetImages],
    );

    const startGenerationRequest = useCallback((targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => {
        const previous = generationRequestsRef.current.get(targetNodeId);
        if (previous?.controller !== controller) previous?.controller.abort();
        generationRequestsRef.current.set(targetNodeId, { targetNodeId, originNodeId, runningNodeId: runningId, controller });
        return controller;
    }, []);

    const finishGenerationRequest = useCallback((targetNodeId: string, controller: AbortController) => {
        const request = generationRequestsRef.current.get(targetNodeId);
        if (request?.controller === controller) generationRequestsRef.current.delete(targetNodeId);
    }, []);

    const generationNodeIdsForRunningId = useCallback((runningId: string) => {
        const affectedNodeIds = new Set<string>();
        generationRequestsRef.current.forEach((request) => {
            if (request.runningNodeId !== runningId) return;
            affectedNodeIds.add(request.targetNodeId);
            affectedNodeIds.add(request.originNodeId);
        });
        return affectedNodeIds;
    }, []);

    const stopGenerationByRunningId = useCallback((runningId: string) => {
        const affectedNodeIds = generationNodeIdsForRunningId(runningId);
        generationRequestsRef.current.forEach((request) => {
            if (request.runningNodeId !== runningId) return;
            request.controller.abort();
            generationRequestsRef.current.delete(request.targetNodeId);
        });
        setRunningNodeId((current) => (current === runningId ? null : current));
        if (!affectedNodeIds.size) return affectedNodeIds;
        setNodes((prev) =>
            prev.map((node) =>
                affectedNodeIds.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING
                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined, reasoningText: undefined, reasoningState: undefined } }
                    : node,
                ),
        );
        return affectedNodeIds;
    }, [generationNodeIdsForRunningId]);

    const confirmStopGeneration = useCallback(
        (nodeId: string) => {
            const affectedNodeIds = generationNodeIdsForRunningId(nodeId);
            const canvasRunNode = nodesRef.current.find((node) => node.id === nodeId);
            const canvasRunJobId = canvasRunJobIdsRef.current.get(nodeId)
                || (isCanvasManagedGeneration(canvasRunNode) ? canvasRunNode?.metadata?.remoteOperationId || undefined : undefined);
            if (canvasRunJobId) nodesRef.current.forEach((node) => {
                if (node.metadata?.remoteOperationId === canvasRunJobId) affectedNodeIds.add(node.id);
            });
            const h3JobIds = remoteCancelableVideoJobIds(nodesRef.current, affectedNodeIds, (model) => providerIdForModel(model) === "minimax_h3");
            modal.confirm({
                title: "停止生成？",
                content: canvasRunJobId || h3JobIds.length
                    ? "将同时通知后台停止生成任务；已经完成的结果不会被删除。"
                    : "停止当前页面等待后，已提交的后台任务仍可能继续执行并产生费用；重新进入画布时会恢复最终结果。",
                okText: "停止",
                cancelText: "继续生成",
                okButtonProps: { danger: true },
                onOk: async () => {
                    stopGenerationByRunningId(nodeId);
                    const cancellations = [
                        ...(canvasRunJobId ? [cancelCanvasRunJob(canvasRunJobId)] : []),
                        ...(!canvasRunJobId ? h3JobIds.map(cancelGeneration) : []),
                    ];
                    if (!cancellations.length) return;
                    const results = await Promise.allSettled(cancellations);
                    const failures = results.filter((result) => result.status === "rejected");
                    if (failures.length) {
                        message.error("页面等待已停止，但部分后台任务取消失败；刷新后可再次停止");
                        return;
                    }
                    message.success("生成任务已停止");
                },
            });
        },
        [generationNodeIdsForRunningId, message, modal, stopGenerationByRunningId],
    );

    const handleApproveStage1 = useCallback(async (node: CanvasNodeData) => {
        const jobId = node.metadata?.generationJobId;
        const reviewVersion = Number(node.metadata?.stage1ReviewVersion);
        const outputIndex = Number(node.metadata?.videoOutputIndex || 0);
        if (!jobId || !Number.isInteger(reviewVersion) || reviewVersion < 1) {
            message.error("Stage 1 审核信息不完整，请刷新后重试");
            return;
        }
        setNodes((current) => current.map((item) => item.id === node.id
            ? { ...item, metadata: { ...item.metadata, stage1ReviewState: "approving" } }
            : item));
        try {
            await approveLtxStage1(jobId, outputIndex, reviewVersion);
            setNodes((current) => current.map((item) =>
                item.metadata?.generationJobId === jobId && Number(item.metadata?.videoOutputIndex || 0) === outputIndex
                    ? { ...item, metadata: { ...item.metadata, stage1ReviewState: "approved", generationState: "running", generationStage: "stage2" } }
                    : item
            ));
            message.success("已开始 Stage 2 精修");
        } catch (error) {
            setNodes((current) => current.map((item) => item.id === node.id
                ? { ...item, metadata: { ...item.metadata, stage1ReviewState: "awaiting" } }
                : item));
            message.error(error instanceof Error ? error.message : "Stage 2 启动失败");
        }
    }, [message]);

    useEffect(() => {
        if (!hydrated || !isTemplatePreview || hasCurrentProject) return;
        void loadTemplatePreview(projectId).catch((error) => {
            message.error(error instanceof Error ? error.message : "模板预览加载失败");
            navigate("/canvas", { replace: true });
        });
    }, [hasCurrentProject, hydrated, isTemplatePreview, loadTemplatePreview, message, navigate, projectId]);

    useEffect(() => {
        if (!hydrated) return;
        if (isTemplatePreview && !hasCurrentProject) return;
        setProjectLoaded(false);
        const project = openProject(projectId);
        if (!project) {
            navigate("/canvas", { replace: true });
            return;
        }

        const restore = async () => {
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            setNodes(restoredNodes);
            for (const pending of isReadOnly ? [] : restoredNodes.filter((node) => node.metadata?.generationJobId && (node.metadata.status !== NODE_STATUS_SUCCESS || node.type === CanvasNodeType.Video && !node.metadata.storageKey))) {
                const pendingJobId = pending.metadata!.generationJobId!;
                if (pending.type === CanvasNodeType.Video && !pending.metadata?.storageKey) {
                    const outputIndex = videoBatchOutputIndex(pending, restoredNodes);
                    void resumeVideoGeneration(pendingJobId, outputIndex, {
                        onStatusChange: (generationState) => setNodes((current) => current.map((node) => node.id === pending.id && node.metadata?.generationState !== "ready" ? { ...node, metadata: { ...node.metadata, generationState: generationState === "queued" ? "queued" : "running", status: NODE_STATUS_LOADING } } : node)),
                        onProgress: (generationProgress, generationStage, _outputIndex, remoteOperationLabel) => setNodes((current) => current.map((node) => node.id === pending.id && node.metadata?.generationState !== "ready" ? { ...node, metadata: { ...node.metadata, generationProgress, generationStage, remoteOperationLabel } } : node)),
                        onResult: (result) => setNodes((current) => current.map((node) => node.id === pending.id ? { ...node, metadata: { ...node.metadata, ...videoDeliveryMetadata(result) } } : node)),
                        onArchived: (result) => setNodes((current) => current.map((node) => node.id === pending.id ? { ...node, metadata: { ...node.metadata, ...videoDeliveryMetadata(result) } } : node)),
                        onReviewReady: (review) => setNodes((current) => current.map((node) => node.id === pending.id ? { ...node, metadata: { ...node.metadata, ...stage1ReviewMetadata(review) } } : node)),
                    }).catch((error) => setNodes((current) => current.map((node) => node.id === pending.id ? node.metadata?.content ? { ...node, metadata: { ...node.metadata, persistenceState: "failed", errorDetails: "云端保存仍在后台重试" } } : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, generationState: "failed", errorDetails: error instanceof Error ? error.message : "后台任务恢复失败" } } : node)));
                    continue;
                }
                void waitForGeneration(pendingJobId, undefined, pending.type === CanvasNodeType.Video ? (generationState) => setNodes((current) => current.map((node) => node.id === pending.id ? { ...node, metadata: { ...node.metadata, generationState: generationState === "queued" ? "queued" : "running" } } : node)) : undefined, pending.type === CanvasNodeType.Split || pending.type === CanvasNodeType.Text ? (reasoningText, generationJobId) => setNodes((current) => current.map((node) => node.id === pending.id && node.metadata?.status === NODE_STATUS_LOADING && node.metadata.generationJobId === generationJobId ? { ...node, metadata: { ...node.metadata, reasoningText: reasoningText || undefined, reasoningState: reasoningText ? "streaming" as const : undefined } } : node)) : undefined, pending.type === CanvasNodeType.Video ? (job) => setNodes((current) => current.map((node) => node.id === pending.id ? { ...node, metadata: { ...node.metadata, generationProgress: Number(job.metadata?.progress || 0) } } : node)) : undefined).then(({ job, assets }) => {
                    if (pending.type === CanvasNodeType.Split) {
                        if (!job.output_text?.trim()) throw new Error("后台任务没有返回拆分结果");
                        const contents = parseSplitResponse(job.output_text, pending.metadata?.splitCount ?? "auto");
                        const hasOutputs = hasSplitOutputs(pending.id, restoredNodes, project.connections);
                        const graph = createSplitOutputGraph(pending, contents, nanoid, pending.metadata?.composerContent || pending.metadata?.prompt);
                        setNodes((current) => [...current.map((node) => node.id === pending.id ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined, reasoningText: job.reasoning_text || undefined, reasoningState: job.reasoning_text?.trim() ? "complete" as const : undefined } } : node), ...(hasOutputs ? [] : graph.nodes)]);
                        if (!hasOutputs) setConnections((current) => [...current, ...graph.connections]);
                        return;
                    }
                    if (pending.type === CanvasNodeType.Text) {
                        if (!job.output_text?.trim()) throw new Error("后台任务没有返回文本");
                        setNodes((current) => current.map((node) => node.id === pending.id ? { ...node, metadata: { ...node.metadata, content: job.output_text!, status: NODE_STATUS_SUCCESS, errorDetails: undefined, reasoningText: job.reasoning_text || undefined, reasoningState: job.reasoning_text?.trim() ? "complete" as const : undefined } } : node));
                        return;
                    }
                    const outputIndex = pending.type === CanvasNodeType.Image ? pending.metadata?.imageOutputIndex || 0 : pending.type === CanvasNodeType.Video ? videoBatchOutputIndex(pending, restoredNodes) : pending.metadata?.musicOutputIndex || 0;
                    const asset = pending.type === CanvasNodeType.Image || pending.type === CanvasNodeType.Video ? assets.find((item) => Number(item.output_index || 0) === outputIndex) : assets[outputIndex];
                    if (!asset?.url) {
                        const failure = pending.type === CanvasNodeType.Video ? job.metadata?.videoFailures?.find((item) => item.outputIndex === outputIndex) : job.metadata?.imageFailures?.find((item) => item.outputIndex === outputIndex);
                        throw new Error(failure?.message || "后台任务没有返回文件");
                    }
                    setNodes((current) => current.map((node) => node.id === pending.id ? { ...node, title: node.type === CanvasNodeType.Music ? asset.title || node.title : node.title, metadata: { ...node.metadata, content: asset.url, storageKey: asset.id, mimeType: asset.mime_type || (node.type === CanvasNodeType.Image ? "image/png" : node.type === CanvasNodeType.Video ? "video/mp4" : "audio/mpeg"), durationMs: asset.duration_seconds ? Number(asset.duration_seconds) * 1000 : undefined, musicTitle: node.type === CanvasNodeType.Music ? asset.title || node.metadata?.musicTitle : node.metadata?.musicTitle, musicCoverUrl: node.type === CanvasNodeType.Music ? asset.coverUrl : node.metadata?.musicCoverUrl, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node));
                }).catch((error) => setNodes((current) => current.map((node) => node.id === pending.id ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: error instanceof Error ? error.message : "后台任务失败", reasoningText: undefined, reasoningState: undefined } } : node)));
            }
            setConnections(project.connections);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setShowImageInfo(project.showImageInfo || false);
            setViewport(project.viewport);
            historyRef.current = { past: [], future: [] };
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            lastHistoryRef.current = {
                nodes: restoredNodes,
                connections: project.connections,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode,
                showImageInfo: project.showImageInfo || false,
            };
            setHistoryState({ canUndo: false, canRedo: false });
            setProjectLoaded(true);
        };
        void restore();
    }, [hasCurrentProject, hydrated, isReadOnly, isTemplatePreview, navigate, openProject, projectId]);

    useEffect(() => {
        if (!projectLoaded || isReadOnly) return;
        return subscribeCanvasProject(projectId, (remoteProject) => {
            const remoteVersion = Math.max(0, Number(remoteProject.version) || 0);
            if (remoteVersion && remoteVersion < remoteHydrationVersionRef.current) return;
            if (remoteVersion) remoteHydrationVersionRef.current = remoteVersion;
            applyRemoteProject(remoteProject);
            void hydrateCanvasImages(remoteProject.nodes || []).then((remoteNodes) => {
                if (remoteVersion && remoteVersion !== remoteHydrationVersionRef.current) return;
                skipRemoteProjectSaveRef.current = true;
                skipRemoteViewportSaveRef.current = true;
                setNodes(remoteNodes);
                setConnections(remoteProject.connections || []);
                setChatSessions(remoteProject.chatSessions || []);
                setActiveChatId(remoteProject.activeChatId || null);
                setShowImageInfo(Boolean(remoteProject.showImageInfo));
                setViewport(remoteProject.viewport || { x: 0, y: 0, k: 1 });
                setSelectedNodeIds((selected) => new Set([...selected].filter((id) => remoteNodes.some((node) => node.id === id))));
                historyRef.current = { past: [], future: [] };
                lastHistoryRef.current = {
                    nodes: remoteNodes,
                    connections: remoteProject.connections || [],
                    chatSessions: remoteProject.chatSessions || [],
                    activeChatId: remoteProject.activeChatId || null,
                    backgroundMode,
                    showImageInfo: Boolean(remoteProject.showImageInfo),
                };
                setHistoryState({ canUndo: false, canRedo: false });
            });
        });
    }, [applyRemoteProject, backgroundMode, isReadOnly, projectId, projectLoaded]);

    useEffect(() => {
        if (!projectLoaded || isReadOnly || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (previous?.nodes === next.nodes && previous.connections === next.connections && previous.chatSessions === next.chatSessions && previous.activeChatId === next.activeChatId && previous.backgroundMode === next.backgroundMode && previous.showImageInfo === next.showImageInfo) return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, createHistoryEntry, isReadOnly, nodes, projectLoaded, showImageInfo]);

    useEffect(() => {
        if (!projectLoaded || isReadOnly) return;
        if (historyPausedRef.current) return;
        if (skipRemoteProjectSaveRef.current) {
            skipRemoteProjectSaveRef.current = false;
            return;
        }
        updateProject(projectId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo });
    }, [activeChatId, backgroundMode, chatSessions, connections, isReadOnly, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded || isReadOnly) return;
        if (skipRemoteViewportSaveRef.current) {
            skipRemoteViewportSaveRef.current = false;
            return;
        }
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [isReadOnly, projectId, projectLoaded, updateProject, viewport]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectingHandlesRef.current = connectingHandles;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, selectedNodeIds, viewport, connectingParams, connectingHandles, connectionTargetNodeId, pendingConnectionCreate]);

    useLayoutEffect(() => {
        selectionBoxRef.current = selectionBox;
    }, [selectionBox]);

    useEffect(() => {
        const applyCompletedUploads = (tasks: Record<string, CanvasUploadTask>) => {
            const completed = Object.values(tasks).filter((task) => task.projectId === projectId && task.status === "success" && task.result);
            if (!completed.length) return;
            setNodes((current) => {
                let changed = false;
                const next = current.map((node) => {
                    const task = completed.find((item) => item.nodeId === node.id && node.metadata?.uploadTaskId === item.id);
                    if (!task?.result) return node;
                    changed = true;
                    return completeCanvasUploadNode(node, task.kind, task.result);
                });
                if (changed) nodesRef.current = next;
                return changed ? next : current;
            });
        };
        applyCompletedUploads(useCanvasUploadStore.getState().tasks);
        return useCanvasUploadStore.subscribe((state) => applyCompletedUploads(state.tasks));
    }, [projectId]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const setConnecting = useCallback((next: ConnectionHandle[] | null) => {
        const handles = next || [];
        const primary = handles[0] || null;
        connectingHandlesRef.current = handles;
        setConnectingHandles(handles);
        connectingParamsRef.current = primary;
        setConnectingParams(primary);
        if (!primary) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback((nodeId: string) => {
        if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
        setToolbarNodeId(nodeId);
    }, [nodeImageSettingsOpen]);

    const hideNodeToolbar = useCallback(() => {}, []);

    const connectNodes = useCallback(
        (handles: ConnectionHandle[], targetNodeId: string) => {
            if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === targetNodeId), nodesRef.current)) {
                message.warning("请先解锁节点");
                return;
            }
            const unlockedHandles = handles.filter((handle) => !isCanvasNodeLocked(nodesRef.current.find((node) => node.id === handle.nodeId), nodesRef.current));
            const lockedCount = handles.length - unlockedHandles.length;
            const plan = planCanvasConnections(
                unlockedHandles,
                targetNodeId,
                connectionsRef.current,
                (handle, target) => normalizeConnection(handle.nodeId, target, nodesRef.current, handle.handleType, handle.port),
                nanoid,
            );
            if (!plan.connections.length) {
                message.warning("没有可新增的连接");
                return;
            }
            setConnections((prev) => [...prev, ...plan.connections]);
            const studioConnections = plan.connections.filter((connection) => [connection.fromNodeId, connection.toNodeId].some((nodeId) => nodesRef.current.find((node) => node.id === nodeId)?.metadata?.studioManaged === true));
            if (studioConnections.length) void commitStudioCanvasEdits(studioConnections.map((connection) => ({
                op: "connect" as const,
                fromNodeId: connection.fromNodeId,
                toNodeId: connection.toNodeId,
                ...(connection.fromPort ? { fromPort: connection.fromPort } : {}),
                ...(connection.toPort ? { toPort: connection.toPort } : {}),
            }))).catch(() => undefined);
            const skipped = plan.skipped + lockedCount;
            if (handles.length > 1) {
                if (skipped) message.warning(`已连接 ${plan.connections.length} 个节点，跳过 ${skipped} 个`);
                else message.success(`已连接 ${plan.connections.length} 个节点`);
            }
            setContextMenu(null);
        },
        [commitStudioCanvasEdits, message],
    );

    const createConnectedNode = useCallback(
        (type: CanvasCreateNodeType, pending: PendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, optimizePrompt: effectiveConfig.imagePromptOptimize === "true", imageWebSearch: effectiveConfig.imageWebSearch === "true", imageSearch: effectiveConfig.imageSearch === "true", count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count, 3) } : type === CanvasNodeType.Split ? { model: effectiveConfig.textModel, splitCount: "auto" as const } : type === CanvasNodeType.Video ? { model: effectiveConfig.videoModel, size: effectiveConfig.size, seconds: effectiveConfig.videoSeconds, vquality: effectiveConfig.vquality, returnLastFrame: effectiveConfig.videoReturnLastFrame, videoPromptEnhance: effectiveConfig.videoPromptEnhance, videoStage1Review: effectiveConfig.videoStage1Review, videoCount: effectiveConfig.videoCount, videoInputMode: normalizeVideoInputModeForModel(effectiveConfig.videoModel, effectiveConfig.videoInputMode) } : type === CanvasNodeType.Music ? { model: effectiveConfig.musicModel } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const planNodes = [...nodesRef.current, newNode];
            const unlockedHandles = pending.connections.filter((handle) => !isCanvasNodeLocked(nodesRef.current.find((node) => node.id === handle.nodeId), nodesRef.current));
            const lockedCount = pending.connections.length - unlockedHandles.length;
            const plan = planCanvasConnections(
                unlockedHandles,
                newNode.id,
                connectionsRef.current,
                (handle, target) => normalizeConnection(handle.nodeId, target, planNodes, handle.handleType, handle.port),
                nanoid,
            );
            if (!plan.connections.length) {
                message.warning("所选节点无法连接到这种新节点");
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, ...plan.connections]);
            const studioConnections = plan.connections.filter((connection) => [connection.fromNodeId, connection.toNodeId].some((nodeId) => planNodes.find((node) => node.id === nodeId)?.metadata?.studioManaged === true));
            if (studioConnections.length) void commitStudioCanvasEdits(studioConnections.map((connection) => ({
                op: "connect" as const,
                fromNodeId: connection.fromNodeId,
                toNodeId: connection.toNodeId,
                ...(connection.fromPort ? { fromPort: connection.fromPort } : {}),
                ...(connection.toPort ? { toPort: connection.toPort } : {}),
            }))).catch(() => undefined);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Group) setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            setConnecting(null);
            const skipped = plan.skipped + lockedCount;
            if (pending.connections.length > 1) {
                if (skipped) message.warning(`新节点已连接 ${plan.connections.length} 个输入，跳过 ${skipped} 个`);
                else message.success(`新节点已连接 ${plan.connections.length} 个输入`);
            }
        },
        [commitStudioCanvasEdits, effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.imagePromptOptimize, effectiveConfig.imageSearch, effectiveConfig.imageWebSearch, effectiveConfig.model, effectiveConfig.musicModel, effectiveConfig.size, effectiveConfig.textModel, effectiveConfig.videoCount, effectiveConfig.videoInputMode, effectiveConfig.videoModel, effectiveConfig.videoPromptEnhance, effectiveConfig.videoReturnLastFrame, effectiveConfig.videoSeconds, effectiveConfig.videoStage1Review, effectiveConfig.vquality, message, setConnecting],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            [...nodesRef.current]
                .filter((node) => !isHiddenBatchChild(node, nodesRef.current) && !isCanvasNodeLocked(node, nodesRef.current))
                .reverse()
                .forEach((node) => {
                    const anchor = getConnectionTargetAnchor(node, current);
                    const dx = world.x - anchor.x;
                    const dy = world.y - anchor.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (node.id === current.nodeId || !normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType, current.port)) return;

                    const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [screenToCanvas],
    );

    const viewportBounds = useMemo(() => canvasViewportBounds(viewport, size.width, size.height), [size.height, size.width, viewport]);
    const visibleNodes = useMemo(() => nodes.filter((node) => !isHiddenBatchChild(node, nodes, collapsingBatchIds) && nodeIntersectsCanvasBounds(node, viewportBounds)), [collapsingBatchIds, nodes, viewportBounds]);
    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const visibleConnections = useMemo(() => connections.filter((connection) => {
        const from = nodeById.get(connection.fromNodeId);
        const to = nodeById.get(connection.toNodeId);
        return Boolean(from && to && !isHiddenBatchConnectionEndpoint(from, nodes) && !isHiddenBatchConnectionEndpoint(to, nodes) && connectionIntersectsCanvasBounds(from, to, viewportBounds));
    }), [connections, nodeById, nodes, viewportBounds]);
    const overviewActive = shouldUseCanvasOverview(visibleNodes.length);
    const renderedNodes = useMemo(() => overviewActive
        ? visibleNodes.filter((node) => selectedNodeIds.has(node.id) || node.id === hoveredNodeId || node.id === connectionTargetNodeId || node.id === dialogNodeId)
        : visibleNodes,
    [connectionTargetNodeId, dialogNodeId, hoveredNodeId, overviewActive, selectedNodeIds, visibleNodes]);
    const toolbarNode = toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null;
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const superResolveNode = superResolveNodeId ? nodeById.get(superResolveNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const exportableSelectedNodes = useMemo(() => selectedCanvasResultNodes(nodes, selectedNodeIds), [nodes, selectedNodeIds]);
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const batchChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            if (isMediaBatchRoot(node)) map.set(node.id, node.metadata?.batchChildIds?.length || 0);
        });
        return map;
    }, [nodes]);
    const groupChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId) map.set(groupId, (map.get(groupId) || 0) + 1);
        });
        return map;
    }, [nodes]);
    const batchMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            const rootId = node.metadata?.batchRootId;
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        nodeIds.add(activeNodeId);
        connections.forEach((connection) => {
            if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connections]);
    const renderedConnections = useMemo(() => overviewActive
        ? visibleConnections.filter((connection) => selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id))
        : visibleConnections,
    [overviewActive, relatedHighlight.connectionIds, selectedConnectionId, visibleConnections]);

    const moduleInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config && node.type !== CanvasNodeType.Split) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);
    const composerInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config && node.type !== CanvasNodeType.Split) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections, { includeWorkflowInput: true }));
        });
        return map;
    }, [connections, nodes]);
    const resourceContextNodeId = dialogNodeId || activeNodeId;
    const canvasResourceReferences = useMemo(() => buildCanvasResourceReferences(nodes, connections, resourceContextNodeId), [connections, nodes, resourceContextNodeId]);
    const resourceReferenceByNodeId = useMemo(() => new Map(canvasResourceReferences.map((reference) => [reference.nodeId, reference])), [canvasResourceReferences]);
    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections)));
        return map;
    }, [connections, nodes]);
    const createNode = useCallback(
        (type: CanvasNodeType, position?: Position) => {
            const targetPosition = position || getCanvasCenter();
            const nodeMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                          optimizePrompt: effectiveConfig.imagePromptOptimize === "true",
                          imageWebSearch: effectiveConfig.imageWebSearch === "true",
                          imageSearch: effectiveConfig.imageSearch === "true",
                          count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count, 3),
                      }
                    : type === CanvasNodeType.Split
                      ? { model: effectiveConfig.textModel, splitCount: "auto" as const }
                    : type === CanvasNodeType.Video
                      ? { model: effectiveConfig.videoModel, size: effectiveConfig.size, seconds: effectiveConfig.videoSeconds, vquality: effectiveConfig.vquality, returnLastFrame: effectiveConfig.videoReturnLastFrame, videoPromptEnhance: effectiveConfig.videoPromptEnhance, videoStage1Review: effectiveConfig.videoStage1Review, videoCount: effectiveConfig.videoCount, videoInputMode: normalizeVideoInputModeForModel(effectiveConfig.videoModel, effectiveConfig.videoInputMode) }
                      : type === CanvasNodeType.Music
                        ? { model: effectiveConfig.musicModel }
                      : type === CanvasNodeType.Comment
                        ? { commentModel: pickCommentModel(effectiveConfig.textModels, effectiveConfig.textModel), commentColor: "default" as const }
                      : undefined;
            const newNode = createCanvasNode(type, targetPosition, nodeMetadata);

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Comment && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Group) setDialogNodeId(newNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.imagePromptOptimize, effectiveConfig.imageSearch, effectiveConfig.imageWebSearch, effectiveConfig.model, effectiveConfig.musicModel, effectiveConfig.size, effectiveConfig.textModel, effectiveConfig.textModels, effectiveConfig.videoCount, effectiveConfig.videoInputMode, effectiveConfig.videoModel, effectiveConfig.videoPromptEnhance, effectiveConfig.videoReturnLastFrame, effectiveConfig.videoSeconds, effectiveConfig.videoStage1Review, effectiveConfig.vquality, getCanvasCenter],
    );

    const createSelectedCanvasGroup = useCallback(() => {
        if ([...selectedNodeIdsRef.current].some((id) => isCanvasNodeLocked(nodesRef.current.find((node) => node.id === id), nodesRef.current))) {
            message.warning("请先解锁选中的节点");
            return;
        }
        const result = createCanvasGroup(selectedNodeIdsRef.current, nodesRef.current, nanoid);
        if (!result.groupId) return;
        setNodes(result.nodes);
        setSelectedNodeIds(new Set([result.groupId]));
        setSelectedConnectionId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, [message]);

    const insertPromptNode = useCallback(
        (prompt: string) => {
            const content = prompt.trim();
            if (!content) return;
            const newNode = createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content, status: NODE_STATUS_SUCCESS });
            setNodes((current) => [...current, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
        },
        [getCanvasCenter],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const currentNodes = nodesRef.current;
            const allIds = new Set([...ids].filter((id) => {
                const node = currentNodes.find((item) => item.id === id);
                if (!node || isCanvasNodeLocked(node, currentNodes)) return false;
                const childIds = isCanvasGroupNode(node)
                    ? currentNodes.filter((item) => item.metadata?.groupId === node.id).map((item) => item.id)
                    : node.metadata?.batchChildIds || [];
                return !childIds.some((childId) => isCanvasNodeLocked(currentNodes.find((item) => item.id === childId), currentNodes));
            }));
            currentNodes.forEach((node) => {
                if (allIds.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => allIds.add(childId));
            });
            if (allIds.size < ids.size) message.warning("已跳过仍处于锁定状态的节点");
            if (!allIds.size) return;
            const studioNodeIds = [...allIds].filter((id) => currentNodes.find((node) => node.id === id)?.metadata?.studioManaged === true);
            if (studioNodeIds.length) void commitStudioCanvasEdits(studioNodeIds.map((nodeId) => ({ op: "delete_node" as const, nodeId }))).catch(() => undefined);
            const cancelJobIds = cancelableQueuedLtxJobIds(currentNodes, allIds, (model) => providerIdForModel(model) === "ltx");
            if (cancelJobIds.length) {
                void Promise.allSettled(cancelJobIds.map(cancelGeneration)).then((results) => {
                    if (results.some((result) => result.status === "rejected")) message.warning("节点已删除，但部分 LTX 队列任务未能停止");
                });
            }
            setNodes((prev) => {
                const next = prev.filter((node) => !allIds.has(node.id));
                return next.map((node) => {
                    const groupId = node.metadata?.groupId;
                    if (groupId && allIds.has(groupId)) return { ...node, metadata: { ...node.metadata, groupId: undefined } };
                    const childIds = node.metadata?.batchChildIds?.filter((childId) => !allIds.has(childId));
                    if (!node.metadata?.isBatchRoot || childIds?.length === node.metadata.batchChildIds?.length) return node;
                    const primaryResultId = childIds?.includes(node.metadata.primaryResultId || "") ? node.metadata.primaryResultId : childIds?.[0];
                    const primaryNode = next.find((item) => item.id === primaryResultId);
                    return {
                        ...node,
                        metadata: {
                            ...node.metadata,
                            batchChildIds: childIds,
                            primaryResultId,
                            content: primaryNode?.metadata?.content || node.metadata.content,
                            naturalWidth: primaryNode?.metadata?.naturalWidth || node.metadata.naturalWidth,
                            naturalHeight: primaryNode?.metadata?.naturalHeight || node.metadata.naturalHeight,
                        },
                    };
                });
            });
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setEditingNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)), chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, commitStudioCanvasEdits, message, projectId],
    );

    const deleteConnection = useCallback((connectionId: string) => {
        const connection = connectionsRef.current.find((item) => item.id === connectionId);
        if (connection && [connection.fromNodeId, connection.toNodeId].some((id) => isCanvasNodeLocked(nodesRef.current.find((node) => node.id === id), nodesRef.current))) {
            message.warning("请先解锁连接的节点");
            return;
        }
        if (connection && [connection.fromNodeId, connection.toNodeId].some((id) => nodesRef.current.find((node) => node.id === id)?.metadata?.studioManaged === true)) {
            void commitStudioCanvasEdits([{ op: "disconnect", connectionId }]).catch(() => undefined);
        }
        setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, [commitStudioCanvasEdits, message]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setCanvasCreatePosition(null);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [cancelPendingConnectionCreate]);

    const clearCanvas = useCallback(() => {
        deleteNodes(new Set(nodesRef.current.map((node) => node.id)));
        setClearConfirmOpen(false);
    }, [deleteNodes]);

    const duplicateNode = useCallback((nodeId: string) => {
        const selectedIds = selectedNodeIdsRef.current;
        const copy = duplicateCanvasNode(selectedIds.size > 1 && selectedIds.has(nodeId) ? selectedIds : nodeId, nodesRef.current, connectionsRef.current, nanoid);
        if (!copy) return;
        setNodes((prev) => [...prev, ...copy.nodes]);
        setConnections((prev) => [...prev, ...copy.connections]);
        setSelectedNodeIds(new Set(copy.rootIds));
        setSelectedConnectionId(null);
        setToolbarNodeId(copy.rootId);
        setDialogNodeId(null);
    }, []);

    const toggleNodeLocked = useCallback((nodeId: string) => {
        const currentNodes = nodesRef.current;
        const node = currentNodes.find((item) => item.id === nodeId);
        if (!node) return;
        const locked = isCanvasNodeLocked(node, currentNodes);
        if (!locked && isCanvasNodeLockBusy(nodeId, currentNodes)) {
            message.warning("运行中的节点无法锁定");
            return;
        }
        setNodes((current) => setCanvasNodeLocked(current, nodeId, !locked));
        setConnecting(null);
        setPendingConnectionCreate(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setSplitNodeId(null);
        setUpscaleNodeId(null);
        setSuperResolveNodeId(null);
        setAngleNodeId(null);
    }, [message, setConnecting]);

    const duplicateSelectedText = useCallback((nodeId: string, selectedText: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        const title = selectedText.trim();
        if (!source || source.type !== CanvasNodeType.Text || !title) return;

        const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
        const next = {
            ...createCanvasNode(
                CanvasNodeType.Text,
                {
                    x: source.position.x + source.width + 72 + textSpec.width / 2,
                    y: source.position.y + source.height / 2,
                },
                { content: selectedText, status: NODE_STATUS_SUCCESS, fontSize: source.metadata?.fontSize || 14 },
            ),
            title: title.slice(0, 32),
        };
        const connection = normalizeConnection(source.id, next.id, [...nodesRef.current, next], "source");

        setNodes((prev) => [...prev, next]);
        if (connection) setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
        setSelectedNodeIds(new Set([next.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
    }, []);

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedNodes = nodesRef.current
            .filter((node) => selectedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        clipboardRef.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, []);

    const pasteCopiedNodes = useCallback(() => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = center.x - (bounds.left + bounds.right) / 2;
        const dy = center.y - (bounds.top + bounds.bottom) / 2;
        const idMap = new Map<string, string>();
        const nextNodes = clipboard.nodes.map((node, index) => {
            const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(node.id, id);
            return {
                ...node,
                id,
                title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
                position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            };
        });

        const pastedNodes = nextNodes.map((node) => {
            const groupId = node.metadata?.groupId;
            if (!groupId) return node;
            return { ...node, metadata: { ...node.metadata, groupId: idMap.get(groupId) } };
        });

        const nextConnections = clipboard.connections.flatMap((connection, index) => {
            const fromNodeId = idMap.get(connection.fromNodeId);
            const toNodeId = idMap.get(connection.toNodeId);
            if (!fromNodeId || !toNodeId) return [];
            return [
                {
                    ...connection,
                    id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId,
                    toNodeId,
                },
            ];
        });

        setNodes((prev) => [...prev, ...pastedNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(pastedNodes[0] && (isCanvasGroupNode(pastedNodes[0]) || pastedNodes[0].type === CanvasNodeType.Comment) ? null : pastedNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter]);

    const resetViewport = useCallback(() => {
        setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
        setContextMenu(null);
    }, [size.height, size.width]);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            setViewport((prev) => ({
                x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
                y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
            setContextMenu(null);
        },
        [size.height, size.width],
    );

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        setNodes(entry.nodes);
        setConnections(entry.connections);
        setChatSessions(entry.chatSessions);
        setActiveChatId(entry.activeChatId);
        setShowImageInfo(entry.showImageInfo);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setTimeout(() => {
            lastHistoryRef.current = entry;
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, []);

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    const createAndOpenProject = useCallback(() => {
        const id = createProject(`CrocoTV 画布 ${useCanvasStore.getState().projects.length + 1}`);
        navigate(`/canvas/${id}`);
    }, [createProject, navigate]);

    const copyAndOpenProject = useCallback(async () => {
        try {
            const id = await copyProject(projectId);
            message.success("已复制到我的画布");
            navigate(`/canvas/${id}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "复制画布失败，请稍后重试");
        }
    }, [copyProject, message, navigate, projectId]);

    const deleteCurrentProject = useCallback(async () => {
        try {
            await deleteProjects([projectId]);
            cleanupAssetImages();
            navigate("/canvas");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除画布失败，请稍后重试");
        }
    }, [cleanupAssetImages, deleteProjects, message, navigate, projectId]);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            setCanvasCreatePosition(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;

            if (!event.ctrlKey && !event.metaKey) {
                setSelectionBox(null);
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                setSelectedNodeIds(new Set());
            }

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, screenToCanvas],
    );

    const handleNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.stopPropagation();
        setContextMenu(null);
        setCanvasCreatePosition(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setSelectedConnectionId(null);

        const currentSelected = selectedNodeIdsRef.current;
        const currentNodes = nodesRef.current;
        const nextSelected = new Set(currentSelected);

        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) {
                nextSelected.delete(nodeId);
            } else {
                nextSelected.add(nodeId);
            }
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }

        setSelectedNodeIds(nextSelected);
        setToolbarNodeId(nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null);
        const clickedNode = currentNodes.find((node) => node.id === nodeId);
        if (isCanvasNodeLocked(clickedNode, currentNodes)) return;
        const dragIds = new Set<string>();
        currentNodes.forEach((node) => {
            if (!nextSelected.has(node.id) || isCanvasNodeLocked(node, currentNodes)) return;
            if (isCanvasGroupNode(node) && currentNodes.some((child) => child.metadata?.groupId === node.id && isCanvasNodeLocked(child, currentNodes))) return;
            dragIds.add(node.id);
            node.metadata?.batchChildIds?.forEach((childId) => dragIds.add(childId));
            if (isCanvasGroupNode(node)) {
                currentNodes.forEach((child) => {
                    if (child.metadata?.groupId === node.id) dragIds.add(child.id);
                });
            }
        });
        if (!dragIds.size) return;
        dragRef.current = {
            isDraggingNode: true,
            hasMoved: false,
            startX: event.clientX,
            startY: event.clientY,
            initialSelectedNodes: currentNodes.filter((node) => dragIds.has(node.id)).map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
        };
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
    }, []);

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!dragRef.current.isDraggingNode) return;

        const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.length === 1;
        const clickedNodeId = dragRef.current.initialSelectedNodes[0]?.id;
        const currentViewport = viewportRef.current;
        const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
        const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodes;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        setDropTargetGroupId(null);
        if (dragRef.current.hasMoved && clientX != null && clientY != null) {
            const movedIds = new Set(initialPositions.map((item) => item.id));
            setNodes((prev) => {
                const moved = prev.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                const targetGroup = findGroupDropTarget(movedIds, moved);
                if (targetGroup) return snapNodesIntoGroup(movedIds, moved, targetGroup);
                return moved.map((node) => {
                    if (!movedIds.has(node.id) || isCanvasGroupNode(node)) return node;
                    const groupId = findContainingGroupId(node, moved);
                    if (node.metadata?.groupId === groupId) return node;
                    return { ...node, metadata: { ...node.metadata, groupId } };
                });
            });
        }

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = [];
        if (wasClick && clickedNodeId) {
            const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
            if (clickedNode?.type === CanvasNodeType.Text || clickedNode?.type === CanvasNodeType.Comment) {
                setDialogNodeId((current) => (current === clickedNodeId ? current : null));
            } else if (clickedNode && !isCanvasGroupNode(clickedNode)) {
                setDialogNodeId(clickedNodeId);
            }
        }
    }, []);

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            const currentViewport = viewportRef.current;

            if (dragRef.current.isDraggingNode) {
                const dx = (event.clientX - dragRef.current.startX) / currentViewport.k;
                const dy = (event.clientY - dragRef.current.startY) / currentViewport.k;
                const initialPositions = dragRef.current.initialSelectedNodes;
                if (Math.abs(event.clientX - dragRef.current.startX) > 3 || Math.abs(event.clientY - dragRef.current.startY) > 3) {
                    dragRef.current.hasMoved = true;
                }

                const movedIds = new Set(initialPositions.map((item) => item.id));
                const previewNodes = nodesRef.current.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                setDropTargetGroupId(findGroupDropTarget(movedIds, previewNodes)?.id || null);

                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    setNodes((prev) =>
                        prev.map((node) => {
                            const initial = initialPositions.find((item) => item.id === node.id);
                            return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                        }),
                    );
                    rafRef.current = null;
                });
                return;
            }

            if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }
        },
        [finishNodeDrag, getConnectionDropTarget, screenToCanvas],
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                selectionBoxRef.current = null;
                setSelectionBox(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [screenToCanvas],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            selectionBoxRef.current = null;
            setSelectionBox(null);

            if (pendingConnectionCreateRef.current) return;

            const currentConnection = connectingParamsRef.current;
            if (currentConnection) {
                const currentHandles = connectingHandlesRef.current.length ? connectingHandlesRef.current : [currentConnection];
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
                if (dropTarget.nodeId) {
                    connectNodes(currentHandles, dropTarget.nodeId);
                    setConnecting(null);
                } else if (dropTarget.isNearNode) {
                    setConnecting(null);
                } else {
                    setMouseWorld(screenToCanvas(event.clientX, event.clientY));
                    setPendingConnectionCreate({ connections: currentHandles, position: screenToCanvas(event.clientX, event.clientY) });
                }
            }
        },
        [connectNodes, finishNodeDrag, getConnectionDropTarget, screenToCanvas, setConnecting],
    );

    useEffect(() => {
        const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
        const cancelNodeDrag = () => finishNodeDrag();
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

    const beginFileNodeUpload = useCallback((file: File, kind: CanvasUploadKind, position: Position, targetNodeId?: string) => {
        const type = kind === "image" ? CanvasNodeType.Image : kind === "video" ? CanvasNodeType.Video : CanvasNodeType.Audio;
        const spec = NODE_DEFAULT_SIZE[type];
        const existing = targetNodeId ? nodesRef.current.find((node) => node.id === targetNodeId) : null;
        if (existing && isCanvasNodeLocked(existing, nodesRef.current)) {
            message.warning("请先解锁节点");
            return;
        }
        const id = existing?.id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const taskId = `upload-${crypto.randomUUID()}`;
        const localUrl = URL.createObjectURL(file);
        const nextNode: CanvasNodeData = {
            ...(existing || {}),
            id,
            type,
            title: file.name,
            position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
            width: spec.width,
            height: spec.height,
            metadata: {
                groupId: existing?.metadata?.groupId,
                content: localUrl,
                status: NODE_STATUS_SUCCESS,
                bytes: file.size,
                mimeType: file.type || (kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/mpeg"),
                uploadTaskId: taskId,
            },
        };
        const nextNodes = existing ? nodesRef.current.map((node) => node.id === id ? nextNode : node) : [...nodesRef.current, nextNode];
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
        updateProject(projectId, { nodes: nextNodes });
        useCanvasUploadStore.getState().startUpload({ id: taskId, projectId, nodeId: id, kind, localUrl, file });
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(kind === "audio" ? null : id);
    }, [message, projectId, updateProject]);

    const createImageFileNode = useCallback((file: File, position: Position) => beginFileNodeUpload(file, "image", position), [beginFileNodeUpload]);
    const createVideoFileNode = useCallback((file: File, position: Position) => beginFileNodeUpload(file, "video", position), [beginFileNodeUpload]);
    const createAudioFileNode = useCallback((file: File, position: Position) => beginFileNodeUpload(file, "audio", position), [beginFileNodeUpload]);

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || "剪切板文本",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            message.success("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) message.success("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isReadOnly) return;
            if (shouldIgnoreCanvasKeyboardShortcut(event.target, event.key)) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    deleteConnection(selectedConnectionId);
                }
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setEditingNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setPendingConnectionCreate(null);
                setCanvasCreatePosition(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [copySelectedNodes, deleteConnection, deleteNodes, isReadOnly, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, selectedConnectionId, setConnecting, undoCanvas]);

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target", port?: CanvasConnectionPort) => {
            event.stopPropagation();
            if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) {
                message.warning("请先解锁节点");
                return;
            }
            setCanvasCreatePosition(null);
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            const anchor = { nodeId, handleType, port };
            const handles = connectionHandlesForSelection(anchor, selectedNodeIdsRef.current, nodesRef.current)
                .filter((handle) => !isCanvasNodeLocked(nodesRef.current.find((node) => node.id === handle.nodeId), nodesRef.current));
            setConnecting(handles);
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [message, screenToCanvas, setConnecting],
    );

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position } : node)));
    }, []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
        queueStudioNodeEdit(nodeId, { content });
    }, [queueStudioNodeEdit]);

    const updateCommentNode = useCallback((nodeId: string, patch: Pick<CanvasNodeMetadata, "commentColor" | "commentModel">) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        setNodes((prev) => prev.map((node) => node.id === nodeId && node.type === CanvasNodeType.Comment ? { ...node, metadata: { ...node.metadata, ...patch } } : node));
    }, []);

    const beautifyCommentNode = useCallback(async (node: CanvasNodeData) => {
        if (isCanvasNodeLocked(node, nodesRef.current)) return;
        if (node.metadata?.commentBeautifying) return;
        const content = node.metadata?.content?.trim() || "";
        if (!content) return message.warning("请先输入需要美化的注释内容");
        const model = node.metadata?.commentModel || pickCommentModel(effectiveConfig.textModels, effectiveConfig.textModel);
        if (!model) return message.warning("请先配置可用的文本模型");
        setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, commentBeautifying: true } } : item));
        try {
            const result = await requestTextGeneration({ model, prompt: content, params: { systemPrompt: COMMENT_BEAUTIFY_SYSTEM_PROMPT } });
            setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, content: result.trim(), commentModel: model, commentBeautifying: false } } : item));
            message.success("注释已美化");
        } catch (error) {
            setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, commentBeautifying: false } } : item));
            message.error(error instanceof Error ? error.message : "注释美化失败");
        }
    }, [effectiveConfig.textModel, effectiveConfig.textModels, message]);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, title } : node)));
        queueStudioNodeEdit(nodeId, { title });
    }, [queueStudioNodeEdit]);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.batchExpanded);
        if (isExpanded) {
            setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 260);
        }
        setNodes((prev) => {
            const root = prev.find((node) => node.id === nodeId);
            const childWidth = Math.max(0, ...prev.filter((node) => node.metadata?.batchRootId === nodeId).map((node) => node.width));
            return prev.map((node) => {
                if (node.id === nodeId) return { ...node, metadata: { ...node.metadata, batchExpanded: !node.metadata?.batchExpanded } };
                if (!isExpanded && root && node.metadata?.batchRootId === nodeId) {
                    const index = root.metadata?.batchChildIds?.indexOf(node.id) ?? -1;
                    if (index >= 0) return { ...node, position: mediaBatchChildPosition(root, index, childWidth || node.width) };
                }
                return node;
            });
        });
    }, []);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (isCanvasNodeLocked(child, nodesRef.current) || isCanvasNodeLocked(nodesRef.current.find((node) => node.id === rootId), nodesRef.current)) return;
        if (!rootId || !child.metadata?.content || !isMediaBatchChild(child)) return;
        setNodes((prev) =>
            prev.map((node) =>
                node.id === rootId
                    ? {
                          ...node,
                          width: child.width,
                          height: child.height,
                          metadata: {
                              ...node.metadata,
                              content: child.metadata?.content,
                              primaryResultId: child.id,
                              naturalWidth: child.metadata?.naturalWidth,
                              naturalHeight: child.metadata?.naturalHeight,
                              freeResize: child.metadata?.freeResize,
                              storageKey: child.metadata?.storageKey,
                              mimeType: child.metadata?.mimeType,
                              bytes: child.metadata?.bytes,
                              durationMs: child.metadata?.durationMs,
                          },
                      }
                    : node,
            ),
        );
    }, []);

    const openTextEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text && node.type !== CanvasNodeType.Comment) return;
        if (isCanvasNodeLocked(node, nodesRef.current)) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        if (node.type === CanvasNodeType.Text) setDialogNodeId(node.id);
        setEditingNodeId(node.id);
        setEditRequestNonce((value) => value + 1);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        setNodes((prev) => prev.map((node) => {
            if (node.id !== nodeId) return node;
            const storesPromptDraft = node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio;
            return { ...node, metadata: { ...node.metadata, ...(storesPromptDraft ? { promptDraft: prompt } : { prompt }) } };
        }));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
        queueStudioNodeEdit(nodeId, { metadata: patch as Record<string, unknown> });
    }, [queueStudioNodeEdit]);

    const handleCanvasAudioSegments = useCallback(async (input: AudioSegmentationSubmit) => {
        const uploaded = await Promise.all(input.segments.map(async (segment) => ({
            segment,
            asset: await uploadMediaFile(segment.blob, "audio"),
        })));
        const result = replaceCanvasAudioSegmentNodes({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            parentNodeId: input.parentNodeId,
            segmentationRunId: input.segmentationRunId,
            assets: uploaded.map(({ segment, asset }) => ({
                storageKey: asset.storageKey,
                url: asset.url,
                mimeType: asset.mimeType,
                bytes: asset.bytes,
                durationMs: segment.endMs - segment.startMs,
                index: segment.index,
                startMs: segment.startMs,
                endMs: segment.endMs,
            })),
        });
        nodesRef.current = result.nodes;
        connectionsRef.current = result.connections;
        setNodes(result.nodes);
        setConnections(result.connections);
        message.success(`已生成 ${uploaded.length} 个独立音频节点`);
    }, [message]);

    const handlePromptPanelResize = useCallback((nodeId: string, layout: PromptPanelLayout) => {
        handleConfigNodeChange(nodeId, {
            promptPanelWidth: layout.width,
            promptPanelContentHeight: layout.contentHeight,
            promptPanelOffsetX: layout.offsetX,
        });
    }, [handleConfigNodeChange]);

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio && node.type !== CanvasNodeType.Music) || !node.metadata?.content) return;
        saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio || node.type === CanvasNodeType.Music ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
    }, []);

    const exportSelectedResults = useCallback(async () => {
        const selected = selectedCanvasResultNodes(nodesRef.current, selectedNodeIdsRef.current);
        if (!selected.length || exportingSelectedResults) return;
        setExportingSelectedResults(true);
        try {
            const count = await exportCanvasResultNodes(selected);
            message.success(count > 1 ? `已导出 ${count} 个结果` : "结果已导出");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量导出失败");
        } finally {
            setExportingSelectedResults(false);
        }
    }, [exportingSelectedResults, message]);

    const createVideoMiddleFramePicker = useCallback((node: CanvasNodeData) => {
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (sourceNode?.type !== CanvasNodeType.Video || !sourceNode.metadata?.content) return;
        const frameNode: CanvasNodeData = {
            ...createCanvasNode(CanvasNodeType.Image, { x: sourceNode.position.x + sourceNode.width + 96 + 210, y: sourceNode.position.y + sourceNode.height / 2 }),
            title: "选择视频帧",
            position: { x: sourceNode.position.x + sourceNode.width + 96, y: sourceNode.position.y + (sourceNode.height - 340) / 2 },
            width: 420,
            height: 340,
            metadata: { status: NODE_STATUS_IDLE, framePickerSourceNodeId: sourceNode.id },
        };
        const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: frameNode.id };
        const nextNodes = [...nodesRef.current, frameNode];
        const nextConnections = [...connectionsRef.current, connection];
        nodesRef.current = nextNodes;
        connectionsRef.current = nextConnections;
        setNodes(nextNodes);
        setConnections(nextConnections);
        setSelectedNodeIds(new Set([frameNode.id]));
        setSelectedConnectionId(null);
        setToolbarNodeId(null);
    }, []);

    const confirmVideoMiddleFrame = useCallback(async (pickerNode: CanvasNodeData, result: { blob: Blob; time: number; width: number; height: number }) => {
        const sourceVideoNodeId = pickerNode.metadata?.framePickerSourceNodeId;
        const messageKey = `video-middle-frame-${pickerNode.id}`;
        message.open({ key: messageKey, type: "loading", content: "正在固化视频画面", duration: 0 });
        try {
            const response = await fetch(`/api/canvas/projects/${encodeURIComponent(projectId)}/video-frames`, { method: "POST", headers: { "Content-Type": "application/json", "X-Croco-Client-Id": canvasClientId() }, body: JSON.stringify({ videoNodeId: sourceVideoNodeId, frames: ["middle"], frameTimes: { middle: result.time }, targetNodeIds: { middle: pickerNode.id }, replaceExisting: true }) });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "视频中间帧固化失败");
            const latest = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { headers: { "X-Croco-Client-Id": canvasClientId() } });
            if (latest.ok) useCanvasStore.getState().applyRemoteProject(await latest.json() as CanvasProject);
            message.open({ key: messageKey, type: "success", content: "中间帧已创建" });
        } catch (error) {
            message.open({ key: messageKey, type: "error", content: error instanceof Error ? error.message : "视频中间帧固化失败" });
            throw error;
        }
    }, [message, projectId]);

    const useVideoLastFrame = useCallback(async (node: CanvasNodeData) => {
        const sourceNode = nodesRef.current.find((item) => item.id === node.id);
        if (sourceNode?.type !== CanvasNodeType.Video || !sourceNode.metadata?.content) return;
        const messageKey = `video-last-frame-${sourceNode.id}`;
        message.open({ key: messageKey, type: "loading", content: "正在提取视频尾帧", duration: 0 });
        try {
            const response = await fetch(`/api/canvas/projects/${encodeURIComponent(projectId)}/video-frames`, { method: "POST", headers: { "Content-Type": "application/json", "X-Croco-Client-Id": canvasClientId() }, body: JSON.stringify({ videoNodeId: sourceNode.id, frames: ["last"], replaceExisting: true }) });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "视频尾帧提取失败");
            const latest = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { headers: { "X-Croco-Client-Id": canvasClientId() } });
            if (latest.ok) useCanvasStore.getState().applyRemoteProject(await latest.json() as CanvasProject);
            message.open({ key: messageKey, type: "success", content: "尾帧已创建" });
        } catch (error) {
            message.open({ key: messageKey, type: "error", content: error instanceof Error ? error.message : "视频尾帧提取失败" });
        }
    }, [message, projectId]);

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            const textContent = node.type === CanvasNodeType.Text ? node.metadata?.content?.trim() || "" : "";
            if (node.type === CanvasNodeType.Text) {
                if (!textContent) return message.error("没有可保存的文本");
            } else if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error("没有可保存的视频");
            } else if (node.type === CanvasNodeType.Music) {
                if (!node.metadata?.content) return message.error("没有可保存的音乐");
            } else if (!node.metadata?.content) return message.error("没有可保存的图片");
            const messageKey = `save-node-asset-${node.id}`;
            message.open({ key: messageKey, type: "loading", content: "正在保存到我的素材", duration: 0 });
            try {
                if (node.type === CanvasNodeType.Text) {
                    await addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || "画布文本", coverUrl: "", tags: [], source: "Canvas", data: { content: textContent }, metadata: { source: "canvas", nodeId: node.id } });
                } else if (node.type === CanvasNodeType.Video) {
                    await addAsset({ kind: "video", title: node.metadata?.prompt?.slice(0, 24) || "画布视频", coverUrl: "", tags: [], source: "Canvas", data: { url: node.metadata.content, storageKey: node.metadata.storageKey, width: node.width, height: node.height, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "video/mp4" }, metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt } });
                } else if (node.type === CanvasNodeType.Music) {
                    await addAsset({ kind: "audio", title: node.metadata.musicTitle || node.title || "画布音乐", coverUrl: node.metadata.musicCoverUrl || "", tags: node.metadata.musicStyles || [], source: "Canvas", data: { url: node.metadata.content, storageKey: node.metadata.storageKey, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "audio/mpeg", durationMs: node.metadata.durationMs }, metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata.musicLyrics || node.metadata.musicDescription, audioKind: "music" } });
                } else {
                    const dataUrl = node.metadata.content;
                    await addAsset({
                        kind: "image",
                        title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
                        coverUrl: "",
                        tags: [],
                        source: "Canvas",
                        data: {
                            dataUrl,
                            storageKey: node.metadata.storageKey,
                            width: node.metadata.naturalWidth || node.width,
                            height: node.metadata.naturalHeight || node.height,
                            bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                            mimeType: node.metadata.mimeType || "image/png",
                        },
                        metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                    });
                }
                message.open({ key: messageKey, type: "success", content: "已加入我的素材" });
            } catch (error) {
                message.open({ key: messageKey, type: "error", content: error instanceof Error ? error.message : "素材保存失败" });
            }
        },
        [addAsset, message],
    );

    const saveNodePrompt = useCallback(
        async (node: CanvasNodeData) => {
            const prompt = canvasNodePrompt(node);
            if (!prompt) return message.warning("当前节点没有可收藏的提示词");
            if (!profile || isCanvasGroupNode(node)) return message.error("当前账户状态无效，请重新登录");
            try {
                await createSharedPrompt({ creatorId: profile.id, creatorName: profile.display_name || profile.username, title: promptTitle(prompt), prompt, sourceNodeType: node.type as SharedPromptNodeType });
                await queryClient.invalidateQueries({ queryKey: ["prompts"] });
                message.success("提示词已收藏并共享");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "收藏提示词失败");
            }
        },
        [message, profile, queryClient],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning("图片节点为空，无法反推提示词");
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(
                    CanvasNodeType.Text,
                    { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY },
                    { content: IMAGE_PROMPT_REVERSE_PRESET, prompt: IMAGE_PROMPT_REVERSE_PRESET, status: NODE_STATUS_SUCCESS, fontSize: 14 },
                ),
                title: "反推提示词",
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: modelMatchesCapability(effectiveConfig.textModel, "text") ? effectiveConfig.textModel : "",
                        count: 1,
                        composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
                    },
                ),
                title: "反推提示词配置",
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [
                ...prev,
                { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id },
                { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id },
            ]);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message],
    );

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content) return;
        setCropNodeId(null);
        try {
            const cropped = await cropDataUrl(node.metadata.content, crop);
            const image = await uploadImage(cropped, { compress: true });
            const width = Math.min(node.width, Math.max(220, image.width));
            const childId = nanoid();
            const child: CanvasNodeData = {
                id: childId,
                type: CanvasNodeType.Image,
                title: "裁剪图片",
                position: { x: node.position.x + node.width + 96, y: node.position.y },
                width,
                height: width * (image.height / image.width),
                metadata: {
                    ...imageMetadata(image),
                    prompt: node.metadata?.prompt,
                },
            };
            setNodes((prev) => [...prev, child]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            message.success("裁剪图片已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片裁剪失败");
        }
    }, [message]);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            setSplitNodeId(null);
            try {
                const pieces = await splitDataUrl(node.metadata.content, params);
                const gap = 16;
                const cellWidth = node.width / params.columns;
                const cellHeight = node.height / params.rows;
                const startX = node.position.x + node.width + 96;
                const startY = node.position.y;
                const childNodes = await Promise.all(
                    pieces.map(async (piece) => {
                        const image = await uploadImage(piece.dataUrl, { compress: true });
                        const id = nanoid();
                        return {
                            id,
                            type: CanvasNodeType.Image,
                            title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
                            position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                            width: cellWidth,
                            height: cellHeight,
                            metadata: {
                                ...imageMetadata(image),
                                prompt: node.metadata?.prompt,
                            },
                        } satisfies CanvasNodeData;
                    }),
                );
                setNodes((prev) => [...prev, ...childNodes]);
                setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
                setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
                setSelectedConnectionId(null);
                setDialogNodeId(null);
                message.success(`已切分为 ${childNodes.length} 个子节点`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "图片切分失败");
            }
        },
        [message],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!modelSupportsMaskEdit(generationConfig.model)) {
                setMaskEditNodeId(null);
                message.warning("当前模型不支持局部编辑");
                return;
            }
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = `只修改蒙版透明区域，其他区域保持不变。${userPrompt}`;
            const childId = nanoid();
            const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [source]);
            setMaskEditNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: userPrompt.slice(0, 32) || "局部编辑结果",
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(generationConfig, prompt, [source], { id: `${node.id}-mask`, name: "mask.png", type: "image/png", dataUrl: payload.maskDataUrl }, { signal: controller.signal, onJobCreated: (generationJobId) => setNodes((prev) => prev.map((item) => item.id === childId ? { ...item, metadata: { ...item.metadata, generationJobId, imageOutputIndex: 0 } } : item)) }).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "局部修改失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (!node.metadata?.content) return;
        setUpscaleNodeId(null);
        const upscaled = await upscaleDataUrl(node.metadata.content, params);
        const image = await uploadImage(upscaled, { compress: true });
        const size = fitNodeSize(image.width, image.height);
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Upscaled Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width: size.width,
            height: size.height,
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
    }, []);

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [
                { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
            ]);
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(generationConfig, prompt, [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }], undefined, { signal: controller.signal, onJobCreated: (generationJobId) => setNodes((prev) => prev.map((item) => item.id === childId ? { ...item, metadata: { ...item.metadata, generationJobId, imageOutputIndex: 0 } } : item)) }).then(
                    (items) => items[0],
                );
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, openConfigDialog, startGenerationRequest],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        if (isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) return;
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        if (nodeId && isCanvasNodeLocked(nodesRef.current.find((node) => node.id === nodeId), nodesRef.current)) {
            message.warning("请先解锁节点");
            return;
        }
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, [message]);

    const handleImageInputChange = useCallback(
        (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file))) return;
            const targetNode = target?.nodeId ? nodesRef.current.find((node) => node.id === target.nodeId) : null;
            const position = targetNode
                ? { x: targetNode.position.x + targetNode.width / 2, y: targetNode.position.y + targetNode.height / 2 }
                : target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            beginFileNodeUpload(file, isAudioFile(file) ? "audio" : file.type.startsWith("video/") ? "video" : "image", position, target?.nodeId);

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [beginFileNodeUpload, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item));
            if (!file) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void (isAudioFile(file) ? createAudioFileNode(file, pos) : file.type.startsWith("video/") ? createVideoFileNode(file, pos) : createImageFileNode(file, pos));
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas],
    );

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || "未命名画布");
        setTitleEditing(true);
    }, [currentProject?.title]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const handleCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        if (isReadOnly) return;
        cancelPendingConnectionCreate();
        setContextMenu(null);
        setCanvasCreatePosition(screenToCanvas(event.clientX, event.clientY));
    }, [cancelPendingConnectionCreate, isReadOnly, screenToCanvas]);

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, workflow?: WorkflowGenerationOptions): Promise<string[]> => {
            const contextNodes = workflow?.contextNodes || nodesRef.current;
            const contextConnections = workflow?.contextConnections || connectionsRef.current;
            const sourceNode = contextNodes.find((node) => node.id === nodeId);
            if (isCanvasNodeLocked(sourceNode, contextNodes)) {
                if (!workflow) message.warning("请先解锁节点");
                return [];
            }
            const pendingUpload = sourceNode?.metadata?.uploadTaskId
                ? sourceNode
                : getPendingUploadResourceNodes(nodeId, contextNodes, contextConnections)[0];
            if (pendingUpload) {
                if (!workflow) message.warning("素材仍在上传，请等待上传完成");
                if (workflow) throw new Error("素材仍在上传，请等待上传完成");
                return [];
            }
            if (sourceNode?.type === CanvasNodeType.Config && !workflow) {
                setRunningNodeId(nodeId);
                const runController = startGenerationRequest(nodeId, nodeId, nodeId);
                let canvasRunJobId = "";
                try {
                    const submitted = await startCanvasRunJob(projectId, [nodeId], 1);
                    canvasRunJobId = submitted.jobId;
                    canvasRunJobIdsRef.current.set(nodeId, canvasRunJobId);
                    if (runController.signal.aborted) {
                        await cancelCanvasRunJob(canvasRunJobId).catch(() => undefined);
                        return [];
                    }
                    const completed = await waitForCanvasRunJob(canvasRunJobId, { signal: runController.signal });
                    if (completed.status === "failed" || completed.status === "cancelled") throw new Error(completed.error || (completed.status === "cancelled" ? "生成已取消" : "生成模组运行失败"));
                    const failed = completed.result?.results?.find((result) => result.status === "error");
                    if (failed) throw new Error(failed.error || "生成模组运行失败");
                    return completed.result?.results?.flatMap((result) => result.outputNodeIds || []) || [];
                } catch (error) {
                    if (!runController.signal.aborted) message.error(error instanceof Error ? error.message : "生成模组运行失败");
                    return [];
                } finally {
                    if (canvasRunJobIdsRef.current.get(nodeId) === canvasRunJobId) canvasRunJobIdsRef.current.delete(nodeId);
                    finishGenerationRequest(nodeId, runController);
                    setRunningNodeId(null);
                }
            }
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                if (!workflow) openConfigDialog(true);
                if (workflow) throw new Error("当前模型配置不可用");
                return [];
            }
            const musicConfig = mode === "music" ? resolveMusicConfigReferences(sourceNode, contextNodes, contextConnections) : null;
            const musicError = musicConfig ? validateMusicGeneration(generationConfig.model, musicConfig) : null;
            if (musicError) {
                if (!workflow) message.warning(musicError);
                if (workflow) throw new Error(musicError);
                return [];
            }

            if (!workflow) setRunningNodeId(nodeId);
            const runningId = workflow?.runningId || nodeId;
            const runController = startGenerationRequest(nodeId, nodeId, runningId);
            const workflowMetadata: CanvasNodeMetadata = workflow ? { groupId: workflow.groupId, workflowRunId: workflow.runId, workflowResultOf: workflow.templateNodeId, workflowBatchIndex: workflow.batchIndex } : {};
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const generationContext = mode === "music"
                ? { prompt: musicConfig?.description || "", referenceImages: [], referenceVideos: [], referenceAudios: [], textCount: 0, imageCount: 0, videoCount: 0, audioCount: 0 }
                : await hydrateNodeGenerationContext(buildNodeGenerationContext(nodeId, contextNodes, contextConnections, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt));
            const videoContextResult = mode === "video" ? resolveVideoGenerationContext(generationConfig, sourceNode, generationContext, buildNodeGenerationInputs(nodeId, contextNodes, contextConnections)) : null;
            if (videoContextResult?.error) {
                finishGenerationRequest(nodeId, runController);
                if (!workflow) setRunningNodeId(null);
                if (!workflow) message.warning(videoContextResult.error);
                if (workflow) throw new Error(videoContextResult.error);
                return [];
            }
            const videoGenerationContext = videoContextResult ? await hydrateNodeGenerationContext(videoContextResult.context) : generationContext;
            const videoGenerationConfig = videoContextResult?.videoInputMode
                ? { ...generationConfig, videoInputMode: videoContextResult.videoInputMode }
                : generationConfig;
            const effectivePrompt = videoGenerationContext.prompt.trim();
            if (runController.signal.aborted) {
                finishGenerationRequest(nodeId, runController);
                if (!workflow) setRunningNodeId(null);
                return [];
            }
            const isExistingMediaNode = Boolean(sourceNode?.metadata?.content) && (sourceNode?.type === CanvasNodeType.Image || sourceNode?.type === CanvasNodeType.Video || sourceNode?.type === CanvasNodeType.Audio || sourceNode?.type === CanvasNodeType.Music);
            const markSourceStatus = !isExistingMediaNode && !editingTextNode;
            const statusPrompt = mode === "music" ? musicConfig?.description || "" : sourceNode?.type === CanvasNodeType.Config ? effectivePrompt : prompt;
            if (!effectivePrompt && (mode === "text" || mode === "audio")) {
                finishGenerationRequest(nodeId, runController);
                if (!workflow) setRunningNodeId(null);
                if (workflow) throw new Error("提示词不能为空");
                return [];
            }
            let pendingChildIds: string[] = [];
            if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: statusPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined, ...(mode === "text" && node.type === CanvasNodeType.Text ? { model: generationConfig.model, reasoningText: undefined, reasoningState: supportsReasoningModel(generationConfig.model) ? "streaming" as const : undefined } : {}) } } : node)));

            try {
                if (mode === "image") {
                    const count = getGenerationCount(generationConfig.count, 3);
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content && !workflow;
                    const sourceReference =
                        isImageNode && sourceNode?.metadata?.content
                            ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = sourceReference.length ? sourceReference : generationContext.referenceImages;
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const rootId = isEmptyImageNode ? nodeId : nanoid();
                    const childIds = count > 1 ? Array.from({ length: count }, () => nanoid()) : [];
                    const targetIds = count > 1 ? childIds : [rootId];
                    pendingChildIds = isEmptyImageNode ? childIds : [rootId, ...childIds];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + gap,
                            y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2 + (workflow ? (workflow.layoutIndex + 1) * (imageConfig.height + rowGap) : 0),
                        },
                        width: isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
                        height: isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
                        metadata: {
                            prompt: effectivePrompt,
                            promptDraft: prompt,
                            status: NODE_STATUS_LOADING,
                            isBatchRoot: count > 1,
                            batchChildIds: count > 1 ? childIds : undefined,
                            batchUsesReferenceImages: referenceImages.length > 0,
                            ...generationMetadata,
                            ...workflowMetadata,
                            batchExpanded: count > 1 ? true : undefined,
                        },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: mediaBatchChildPosition(rootNode, index, imageConfig.width),
                        width: imageConfig.width,
                        height: imageConfig.height,
                        metadata: { prompt: effectivePrompt, promptDraft: prompt, status: NODE_STATUS_LOADING, batchRootId: count > 1 ? rootId : undefined, ...generationMetadata, ...workflowMetadata },
                    }));
                    const batchConnections = [...(isEmptyImageNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }))];

                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isConfigNode
                                    ? {
                                          ...node,
                                          metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined },
                                      }
                                    : isEmptyImageNode
                                      ? {
                                            ...node,
                                            position: rootNode.position,
                                            width: rootNode.width,
                                            height: rootNode.height,
                                            title: rootNode.title,
                                            metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                                        }
                                      : isImageNode
                                        ? {
                                              ...node,
                                              metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                                          }
                                        : {
                                              ...node,
                                              type: CanvasNodeType.Text,
                                              title: prompt.slice(0, 32) || "Prompt",
                                              width: parentConfig.width,
                                              height: parentConfig.height,
                                              metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
                                          }
                                : node,
                        ),
                        ...(isEmptyImageNode ? [] : [rootNode]),
                        ...childNodes,
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    if (!workflow) {
                        setSelectedNodeIds(new Set([nodeId]));
                        setSelectedConnectionId(null);
                        setDialogNodeId(nodeId);
                    }

                    const controller = runController;
                    targetIds.forEach((targetId) => startGenerationRequest(targetId, nodeId, runningId, controller));
                    if (count > 1) startGenerationRequest(rootId, nodeId, runningId, controller);
                    let hasSuccess = false;
                    let hasFailure = false;
                    let successfulTargetIds: string[] = [];
                    try {
                        const requestOptions = {
                            signal: controller.signal,
                            onJobCreated: (generationJobId: string, outputIndex = 0) => setNodes((prev) => prev.map((item) => {
                                const targetId = targetIds[outputIndex];
                                if (item.id === targetId) return { ...item, metadata: { ...item.metadata, generationJobId, imageOutputIndex: outputIndex } };
                                if (outputIndex === 0 && count > 1 && item.id === rootId) return { ...item, metadata: { ...item.metadata, generationJobId, imageOutputIndex: 0 } };
                                return item;
                            })),
                        };
                        const images = referenceImages.length
                            ? await requestEdit({ ...generationConfig, count: String(count) }, effectivePrompt, referenceImages, undefined, requestOptions)
                            : await requestGeneration({ ...generationConfig, count: String(count) }, effectivePrompt, requestOptions);
                        const uploadedImages = (await Promise.allSettled(images.map(async (image) => ({ outputIndex: image.outputIndex, uploaded: await uploadImage(image.dataUrl) })))).flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
                        const succeededIndexes = new Set<number>();
                        uploadedImages.forEach(({ outputIndex, uploaded }) => {
                            const targetId = targetIds[outputIndex];
                            if (!targetId) return;
                            succeededIndexes.add(outputIndex);
                            const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                            setNodes((prev) => {
                                const root = prev.find((node) => node.id === rootId);
                                return prev.map((node) => {
                                    if (node.id !== targetId && node.id !== rootId) return node;
                                    const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
                                    if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryResultId))
                                        return {
                                            ...node,
                                            position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                            width: imageSize.width,
                                            height: imageSize.height,
                                            metadata: { ...node.metadata, ...imageMetadata(uploaded), primaryResultId: targetId },
                                        };
                                    if (node.id === targetId)
                                        return {
                                            ...node,
                                            position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                            width: imageSize.width,
                                            height: imageSize.height,
                                            metadata: { ...node.metadata, ...imageMetadata(uploaded) },
                                        };
                                    return node;
                                });
                            });
                        });
                        hasSuccess = succeededIndexes.size > 0;
                        successfulTargetIds = targetIds.filter((_, index) => succeededIndexes.has(index));
                        hasFailure = succeededIndexes.size < targetIds.length;
                        if (hasFailure) setNodes((prev) => prev.map((item) => {
                            const outputIndex = targetIds.indexOf(item.id);
                            return outputIndex >= 0 && !succeededIndexes.has(outputIndex) ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "图片生成失败" } } : item;
                        }));
                        if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                    } catch (error) {
                        if (!isGenerationCanceled(error)) {
                            const errorDetails = error instanceof Error ? error.message : "生成失败";
                            hasFailure = true;
                            setNodes((prev) => prev.map((node) => (targetIds.includes(node.id) ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                        }
                    } finally {
                        targetIds.forEach((targetId) => finishGenerationRequest(targetId, controller));
                        if (count > 1) finishGenerationRequest(rootId, controller);
                    }
                    if (controller.signal.aborted) {
                        setNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                        return [];
                    }
                    if (hasFailure && !workflow) message.error(hasSuccess ? "部分图片生成失败" : "全部图片生成失败");
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } }
                                : node.id === nodeId && isEmptyImageNode
                                  ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } }
                                  : node.id === rootId && !hasSuccess
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "全部图片生成失败" } }
                                    : node,
                        ),
                    );
                    if (hasFailure && workflow) throw new Error(hasSuccess ? "部分图片生成失败" : "全部图片生成失败");
                    return successfulTargetIds;
                }

                if (mode === "video") {
                    const providerId = providerIdForModel(generationConfig.model) || "";
                    const options = normalizeVideoGenerationOptions(providerId, modelConfigForModel(generationConfig.model), { inputMode: videoGenerationConfig.videoInputMode, quality: videoGenerationConfig.vquality, size: videoGenerationConfig.size, duration: videoGenerationConfig.videoSeconds, count: Number(videoGenerationConfig.videoCount) });
                    if (options.error) throw new Error(options.error);
                    const count = options.selection.count;
                    const videoConfig = { ...videoGenerationConfig, size: options.selection.size, vquality: options.selection.quality, videoSeconds: String(options.selection.duration), videoCount: String(count) };
                    const spec = nodeSizeFromRatio(videoConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content && !workflow;
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const rootId = isEmptyVideoNode ? nodeId : nanoid();
                    const childIds = count > 1 ? Array.from({ length: count }, () => nanoid()) : [];
                    const targetIds = count > 1 ? childIds : [rootId];
                    pendingChildIds = isEmptyVideoNode ? childIds : [rootId, ...childIds];
                    const generationMetadata = { model: videoConfig.model, size: videoConfig.size, seconds: videoConfig.videoSeconds, vquality: videoConfig.vquality, videoCount: String(count), generateAudio: videoConfig.videoGenerateAudio, watermark: videoConfig.videoWatermark, returnLastFrame: videoConfig.videoReturnLastFrame, videoPromptEnhance: videoConfig.videoPromptEnhance, videoStage1Review: videoConfig.videoStage1Review, videoAudioSetting: videoConfig.videoAudioSetting, videoInputMode: videoConfig.videoInputMode, videoReferenceSizePolicy: videoConfig.videoReferenceSizePolicy, videoFirstFrameNodeId: sourceNode?.metadata?.videoFirstFrameNodeId, videoLastFrameNodeId: sourceNode?.metadata?.videoLastFrameNodeId, videoEditSourceNodeId: sourceNode?.metadata?.videoEditSourceNodeId, references: generationReferenceUrls(videoGenerationContext) };
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Video,
                        title: count > 1 ? "视频组" : effectivePrompt.slice(0, 32) || "Generated Video",
                        position: isEmptyVideoNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + (workflow ? (workflow.layoutIndex + 1) * (spec.height + 36) : 0) },
                        width: isEmptyVideoNode ? sourceNode.width : spec.width,
                        height: isEmptyVideoNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, promptDraft: prompt, status: NODE_STATUS_LOADING, isBatchRoot: count > 1, batchChildIds: count > 1 ? childIds : undefined, batchExpanded: count > 1 ? true : undefined, videoOutputIndex: 0, ...generationMetadata, ...workflowMetadata },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((childId, index) => ({
                        id: childId,
                        type: CanvasNodeType.Video,
                        title: effectivePrompt.slice(0, 32) || "Generated Video",
                        position: mediaBatchChildPosition(rootNode, index, spec.width),
                        width: spec.width,
                        height: spec.height,
                        metadata: { prompt: effectivePrompt, promptDraft: prompt, status: NODE_STATUS_LOADING, batchRootId: rootId, videoOutputIndex: index, ...generationMetadata, ...workflowMetadata },
                    }));
                    const batchConnections = [...(isEmptyVideoNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }))];
                    setNodes((prev) => [
                        ...prev.map((node) => node.id !== nodeId ? node : isEmptyVideoNode ? { ...node, ...rootNode, metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined } } : { ...node, metadata: { ...node.metadata, status: isConfigNode ? NODE_STATUS_LOADING : NODE_STATUS_SUCCESS, errorDetails: undefined } }),
                        ...(isEmptyVideoNode ? [] : [rootNode]),
                        ...childNodes,
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    const controller = runController;
                    targetIds.forEach((targetId) => startGenerationRequest(targetId, nodeId, runningId, controller));
                    if (count > 1) startGenerationRequest(rootId, nodeId, runningId, controller);
                    let hasSuccess = false;
                    let hasFailure = false;
                    let successfulTargetIds: string[] = [];
                    const applyDeliveredVideo = (result: VideoGenerationResult) => {
                        const targetId = targetIds[result.outputIndex];
                        if (!targetId || !result.url) return;
                        setNodes((prev) => prev.map((item) => {
                            if (item.id === targetId) return { ...item, metadata: { ...item.metadata, ...videoDeliveryMetadata(result) } };
                            if (item.id === rootId && (result.outputIndex === 0 || !item.metadata?.primaryResultId)) return { ...item, metadata: { ...item.metadata, ...videoDeliveryMetadata(result), primaryResultId: targetId } };
                            return item;
                        }));
                    };
                    const applyStage1Review = (review: LtxStage1ReviewReady) => {
                        const targetId = targetIds[review.outputIndex];
                        if (!targetId) return;
                        setNodes((prev) => prev.map((item) => {
                            if (item.id === targetId) return { ...item, metadata: { ...item.metadata, ...stage1ReviewMetadata(review) } };
                            if (item.id === rootId && (review.outputIndex === 0 || !item.metadata?.primaryResultId)) return { ...item, metadata: { ...item.metadata, ...stage1ReviewMetadata(review), primaryResultId: targetId } };
                            return item;
                        }));
                    };
                    try {
                        const results = await requestVideoGeneration(videoConfig, effectivePrompt, videoGenerationContext.referenceImages, videoGenerationContext.referenceVideos, videoGenerationContext.referenceAudios, {
                            ltxFrames: videoContextResult?.ltxFrames,
                            signal: controller.signal,
                            onJobCreated: (generationJobId, outputIndex = 0) => setNodes((prev) => prev.map((item) => item.id === targetIds[outputIndex] || (outputIndex === 0 && item.id === rootId) ? { ...item, metadata: { ...item.metadata, generationJobId, generationState: "queued" } } : item)),
                            onStatusChange: (generationState, outputIndex = 0) => setNodes((prev) => prev.map((item) => item.id === targetIds[outputIndex] || (outputIndex === 0 && item.id === rootId) ? { ...item, metadata: { ...item.metadata, generationState: generationState === "queued" ? "queued" : "running" } } : item)),
                            onProgress: (generationProgress, generationStage, outputIndex = 0, remoteOperationLabel) => setNodes((prev) => prev.map((item) => item.id === targetIds[outputIndex] || (outputIndex === 0 && item.id === rootId) ? { ...item, metadata: { ...item.metadata, generationProgress, generationStage, remoteOperationLabel } } : item)),
                            onResult: applyDeliveredVideo,
                            onArchived: applyDeliveredVideo,
                            onReviewReady: applyStage1Review,
                        });
                        const stored = (await Promise.allSettled(results.map(async (result) => ({ outputIndex: result.outputIndex, video: await storeGeneratedVideo(result) })))).flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
                        const succeededIndexes = new Set<number>();
                        stored.forEach(({ outputIndex, video }) => {
                            const targetId = targetIds[outputIndex];
                            if (!targetId) return;
                            succeededIndexes.add(outputIndex);
                            const videoSize = fitNodeSize(video.width || spec.width, video.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                            setNodes((prev) => {
                                const root = prev.find((node) => node.id === rootId);
                                return prev.map((node) => {
                                    if (node.id !== targetId && node.id !== rootId) return node;
                                    const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
                                    if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryResultId)) return { ...node, width: videoSize.width, height: videoSize.height, position: { x: center.x - videoSize.width / 2, y: center.y - videoSize.height / 2 }, metadata: { ...node.metadata, ...videoMetadata(video), primaryResultId: targetId } };
                                    if (node.id === targetId) return { ...node, width: videoSize.width, height: videoSize.height, position: { x: center.x - videoSize.width / 2, y: center.y - videoSize.height / 2 }, metadata: { ...node.metadata, ...videoMetadata(video) } };
                                    return node;
                                });
                            });
                        });
                        hasSuccess = succeededIndexes.size > 0;
                        successfulTargetIds = targetIds.filter((_, index) => succeededIndexes.has(index));
                        hasFailure = succeededIndexes.size < targetIds.length;
                        if (hasFailure) setNodes((prev) => prev.map((item) => {
                            const outputIndex = targetIds.indexOf(item.id);
                            return outputIndex >= 0 && !succeededIndexes.has(outputIndex) ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "视频生成失败" } } : item;
                        }));
                    } catch (error) {
                        if (!isGenerationCanceled(error)) {
                            hasFailure = true;
                            const errorDetails = error instanceof Error ? error.message : "视频生成失败";
                            setNodes((prev) => prev.map((item) => targetIds.includes(item.id) ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item));
                        }
                    } finally {
                        targetIds.forEach((targetId) => finishGenerationRequest(targetId, controller));
                        if (count > 1) finishGenerationRequest(rootId, controller);
                    }
                    if (controller.signal.aborted) return [];
                    if (hasFailure && !workflow) message.error(hasSuccess ? "部分视频生成失败" : "全部视频生成失败");
                    setNodes((prev) => prev.map((node) => node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部视频生成失败" } } : node.id === rootId && !hasSuccess ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "全部视频生成失败" } } : node));
                    if (hasFailure && workflow) throw new Error(hasSuccess ? "部分视频生成失败" : "全部视频生成失败");
                    return successfulTargetIds;
                }

                if (mode === "audio") {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content && !workflow;
                    const audioId = isEmptyAudioNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioNode: CanvasNodeData = {
                        id: audioId,
                        type: CanvasNodeType.Audio,
                        title: effectivePrompt.slice(0, 32) || "Generated Audio",
                        position: isEmptyAudioNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 + (workflow ? (workflow.layoutIndex + 1) * (spec.height + 36) : 0) },
                        width: isEmptyAudioNode ? sourceNode.width : spec.width,
                        height: isEmptyAudioNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, promptDraft: prompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig), ...workflowMetadata },
                    };
                    pendingChildIds = [audioId];
                    setNodes((prev) => (isEmptyAudioNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode]));
                    if (!isEmptyAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    const controller = startGenerationRequest(audioId, nodeId, runningId, runController);
                    try {
                        const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, effectivePrompt, { signal: controller.signal, onJobCreated: (generationJobId) => setNodes((prev) => prev.map((item) => item.id === audioId ? { ...item, metadata: { ...item.metadata, generationJobId } } : item)) }), generationConfig.audioFormat);
                        setNodes((prev) => prev.map((node) => (node.id === audioId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), prompt: effectivePrompt, promptDraft: prompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)));
                    } finally {
                        finishGenerationRequest(audioId, controller);
                    }
                    return [audioId];
                }

                if (mode === "music" && musicConfig) {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Music];
                    const isEmptyMusicNode = sourceNode?.type === CanvasNodeType.Music && !sourceNode.metadata?.content && !workflow;
                    const musicBatchId = nanoid();
                    const musicCount = generationConfig.model === "minimax-music-3" ? 1 : 2;
                    const musicIds = Array.from({ length: musicCount }, (_, index) => index === 0 && isEmptyMusicNode ? nodeId : nanoid());
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const parentWidth = sourceNode?.width || spec.width;
                    const parentHeight = sourceNode?.height || spec.height;
                    const musicRowY = parent.y + parentHeight / 2 - spec.height / 2 + (workflow ? (workflow.layoutIndex + 1) * (spec.height + 36) : 0);
                    const musicNodes = musicIds.map((id, index): CanvasNodeData => ({
                        id,
                        type: CanvasNodeType.Music,
                        title: musicConfig.title || `音乐 ${index + 1}`,
                        position: isEmptyMusicNode
                            ? index === 0 ? sourceNode!.position : horizontalBatchResultPosition(sourceNode!, index - 1, spec.width, { startGap: 36 })
                            : horizontalBatchResultPosition({ position: parent, width: parentWidth }, index, spec.width, { y: musicRowY }),
                        width: isEmptyMusicNode && index === 0 ? sourceNode!.width : spec.width,
                        height: isEmptyMusicNode && index === 0 ? sourceNode!.height : spec.height,
                        metadata: { ...(isEmptyMusicNode && index === 0 ? sourceNode!.metadata : {}), status: NODE_STATUS_LOADING, errorDetails: undefined, ...buildMusicGenerationMetadata(generationConfig, musicConfig, musicBatchId, index), ...workflowMetadata },
                    }));
                    pendingChildIds = musicIds;
                    setNodes((prev) => isEmptyMusicNode ? [...prev.map((node) => node.id === nodeId ? musicNodes[0] : node), ...musicNodes.slice(1)] : [...prev, ...musicNodes]);
                    if (!isEmptyMusicNode) setConnections((prev) => [...prev, ...musicIds.map((musicId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: musicId }))]);
                    musicIds.filter((id) => id !== nodeId).forEach((id) => startGenerationRequest(id, nodeId, runningId, runController));
                    let musicFailure = false;
                    try {
                        const results = await requestMusicGeneration(generationConfig, musicConfig, { signal: runController.signal, onJobCreated: (generationJobId) => setNodes((prev) => prev.map((item) => musicIds.includes(item.id) ? { ...item, metadata: { ...item.metadata, generationJobId } } : item)) });
                        musicFailure = results.length < musicIds.length;
                        setNodes((prev) => prev.map((node) => {
                            const index = musicIds.indexOf(node.id);
                            if (index >= 0) {
                                const result = results[index];
                                return result
                                    ? { ...node, title: result.title || node.title, metadata: { ...node.metadata, ...buildMusicGenerationMetadata(generationConfig, musicConfig, musicBatchId, index), ...generatedMusicMetadata(result), errorDetails: undefined } }
                                    : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "音乐任务只返回了一个结果" } };
                            }
                            return node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node;
                        }));
                    } finally {
                        musicIds.filter((id) => id !== nodeId).forEach((id) => finishGenerationRequest(id, runController));
                    }
                    if (musicFailure && workflow) throw new Error("音乐任务只返回了一个结果");
                    return musicIds;
                }

                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textCount = isConfigNode ? getGenerationCount(generationConfig.count) : 1;
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const textRowY = parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (workflow ? (workflow.layoutIndex + 1) * (textConfig.height + 36) : 0);
                const childIds = isConfigNode || editingTextNode || workflow ? Array.from({ length: textCount }, () => nanoid()) : [];
                pendingChildIds = childIds;
                if (isConfigNode || editingTextNode || workflow) {
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Text,
                        title: effectivePrompt.slice(0, 32) || "Generated Text",
                        position: horizontalBatchResultPosition({ position: parentPosition, width: parentConfig.width }, index, textConfig.width, { y: textRowY }),
                        width: textConfig.width,
                        height: textConfig.height,
                        metadata: { prompt: effectivePrompt, model: generationConfig.model, webSearch: modelSupportsWebSearch(generationConfig.model) && sourceNode?.metadata?.webSearch === true, status: NODE_STATUS_LOADING, fontSize: 14, reasoningText: undefined, reasoningState: supportsReasoningModel(generationConfig.model) ? "streaming" as const : undefined, ...workflowMetadata },
                    }));
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
                    setConnections((prev) => [...prev, ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }))]);
                }

                const controller = runController;
                const textTargetIds = childIds.length ? childIds : [nodeId];
                textTargetIds.forEach((targetNodeId) => startGenerationRequest(targetNodeId, nodeId, runningId, controller));
                const answers = await Promise.allSettled(
                    textTargetIds.map((targetNodeId) => requestImageQuestion(generationConfig, buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt }), {
                        webSearch: modelSupportsWebSearch(generationConfig.model) && sourceNode?.metadata?.webSearch === true,
                        signal: controller.signal,
                        onJobCreated: (generationJobId) => setNodes((prev) => prev.map((node) => node.id === targetNodeId
                            ? { ...node, metadata: { ...node.metadata, generationJobId } }
                            : node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)),
                        onReasoning: (reasoningText, generationJobId) => setNodes((prev) => prev.map((node) => node.id === targetNodeId && node.metadata?.status === NODE_STATUS_LOADING && node.metadata.generationJobId === generationJobId
                            ? { ...node, metadata: { ...node.metadata, reasoningText: reasoningText || undefined, reasoningState: reasoningText ? "streaming" as const : undefined } }
                            : node)),
                    }).then((content) => {
                        setNodes((prev) => prev.map((node) => node.id === targetNodeId ? { ...node, type: CanvasNodeType.Text, title: targetNodeId === nodeId && !editingTextNode ? prompt.slice(0, 32) || "Generated Text" : node.title, metadata: { ...node.metadata, content, status: NODE_STATUS_SUCCESS, errorDetails: undefined, reasoningState: node.metadata?.reasoningText?.trim() ? "complete" as const : undefined } } : node));
                        return content;
                    }).catch((error) => {
                        if (!isGenerationCanceled(error)) setNodes((prev) => prev.map((node) => node.id === targetNodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: error instanceof Error ? error.message : "生成失败", reasoningText: undefined, reasoningState: undefined } } : node));
                        throw error;
                    }).finally(() => finishGenerationRequest(targetNodeId, controller))),
                );
                if (controller.signal.aborted) return [];
                const failed = answers.find((answer) => answer.status === "rejected");
                const failureMessage = failed?.status === "rejected" ? failed.reason instanceof Error ? failed.reason.message : "生成失败" : undefined;
                if (isConfigNode) setNodes((prev) => prev.map((node) => node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: failureMessage ? NODE_STATUS_ERROR : NODE_STATUS_SUCCESS, errorDetails: failureMessage } } : node));
                if (workflow && !isConfigNode) setNodes((prev) => prev.map((node) => node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: failureMessage ? NODE_STATUS_ERROR : NODE_STATUS_SUCCESS, errorDetails: failureMessage } } : node));
                if (failureMessage && !workflow) message.error(failureMessage);
                if (failureMessage && workflow) throw new Error(failureMessage);
                return textTargetIds;
            } catch (error) {
                if (isGenerationCanceled(error)) return [];
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                if (!workflow) message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((node) => (node.id === nodeId || pendingChildIds.includes(node.id) ? (node.id === nodeId && !markSourceStatus ? node : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, reasoningText: undefined, reasoningState: undefined } }) : node)),
                );
                if (workflow) throw error;
                return [];
            } finally {
                finishGenerationRequest(nodeId, runController);
                if (!workflow) setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, projectId, startGenerationRequest],
    );

    const handleSplitNode = useCallback(async (nodeId: string, workflow?: WorkflowGenerationOptions): Promise<string[]> => {
        const contextNodes = workflow?.contextNodes || nodesRef.current;
        const contextConnections = workflow?.contextConnections || connectionsRef.current;
        const node = contextNodes.find((item) => item.id === nodeId);
        if (!node || node.type !== CanvasNodeType.Split) return [];
        if (isCanvasNodeLocked(node, contextNodes)) {
            if (!workflow) message.warning("请先解锁节点");
            return [];
        }
        const inputs = buildNodeGenerationInputs(nodeId, contextNodes, contextConnections);
        if (!inputs.length) {
            if (!workflow) message.warning("请先连接至少一个有效输入");
            if (workflow) throw new Error("拆分节点缺少有效输入");
            return [];
        }
        const context = buildSplitContext(inputs, node.metadata?.composerContent);
        const required = requiredInputModalities(context.selectedInputs);
        const compatibleModels = selectableModelsByInputModalities(effectiveConfig, required);
        const model = modelSupportsInputModalities(node.metadata?.model || "", required) ? node.metadata?.model || "" : compatibleModels.includes(effectiveConfig.textModel) ? effectiveConfig.textModel : compatibleModels[0] || "";
        if (!model || !isAiConfigReady(effectiveConfig, model)) {
            if (!workflow) message.warning("没有支持当前输入类型的模型");
            if (workflow) throw new Error("没有支持当前输入类型的模型");
            return [];
        }
        const splitCount = node.metadata?.splitCount ?? "auto";
        if (splitCount !== "auto" && (!Number.isInteger(splitCount) || splitCount < 2 || splitCount > 24)) {
            if (!workflow) message.warning("拆分数量需要是 2–24 的整数");
            if (workflow) throw new Error("拆分数量需要是 2–24 的整数");
            return [];
        }

        if (!workflow) setRunningNodeId(nodeId);
        setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, metadata: { ...item.metadata, model, prompt: context.prompt, status: NODE_STATUS_LOADING, errorDetails: undefined, generationJobId: undefined, reasoningText: undefined, reasoningState: supportsReasoningModel(model) ? "streaming" as const : undefined } } : item));
        const controller = startGenerationRequest(nodeId, nodeId, workflow?.runningId || nodeId);
        try {
            const inputAssetIds = await splitInputAssetIds(context.selectedInputs);
            const output = await requestSplitGeneration({
                model,
                prompt: context.prompt,
                systemPrompt: SPLIT_SYSTEM_PROMPT,
                splitCount,
                inputAssetIds,
                signal: controller.signal,
                onJobCreated: (generationJobId) => setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, metadata: { ...item.metadata, generationJobId } } : item)),
                onReasoning: (reasoningText, generationJobId) => setNodes((current) => current.map((item) => item.id === nodeId && item.metadata?.status === NODE_STATUS_LOADING && item.metadata.generationJobId === generationJobId ? { ...item, metadata: { ...item.metadata, reasoningText: reasoningText || undefined, reasoningState: reasoningText ? "streaming" as const : undefined } } : item)),
            });
            if (controller.signal.aborted) return [];
            const contents = parseSplitResponse(output, splitCount);
            const source = contextNodes.find((item) => item.id === nodeId) || node;
            const graph = createSplitOutputGraph(source, contents, nanoid, context.prompt);
            const outputNodes = workflow ? graph.nodes.map((item) => ({ ...item, position: { ...item.position, y: item.position.y + (workflow.layoutIndex + 1) * (item.height + 36) * graph.nodes.length }, metadata: { ...item.metadata, groupId: workflow.groupId, workflowRunId: workflow.runId, workflowResultOf: workflow.templateNodeId, workflowBatchIndex: workflow.batchIndex } })) : graph.nodes;
            setNodes((current) => [...current.map((item) => item.id === nodeId ? { ...item, metadata: { ...item.metadata, model, prompt: context.prompt, status: NODE_STATUS_SUCCESS, errorDetails: undefined, reasoningState: item.metadata?.reasoningText?.trim() ? "complete" as const : undefined } } : item), ...outputNodes]);
            setConnections((current) => {
                if (workflow) return [...current, ...graph.connections];
                const workflowTargets = current.filter((connection) => connection.fromNodeId === nodeId && connection.toPort === "workflow-input").map((connection) => connection.toNodeId);
                const retained = current.filter((connection) => !(connection.fromNodeId === nodeId && connection.toPort === "workflow-input"));
                const batchConnections = workflowTargets.flatMap((groupId) => outputNodes.map((outputNode) => ({ id: nanoid(), fromNodeId: outputNode.id, toNodeId: groupId, toPort: "workflow-input" as const })));
                return [...retained, ...graph.connections, ...batchConnections];
            });
            return outputNodes.map((item) => item.id);
        } catch (error) {
            if (isGenerationCanceled(error)) return [];
            const errorDetails = error instanceof Error ? error.message : "拆分失败";
            if (!workflow) message.error(errorDetails);
            setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, reasoningText: undefined, reasoningState: undefined } } : item));
            if (workflow) throw error;
            return [];
        } finally {
            finishGenerationRequest(nodeId, controller);
            if (!workflow) setRunningNodeId(null);
        }
    }, [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, startGenerationRequest]);

    const stopWorkflowGroup = useCallback((groupId: string) => {
        workflowRunTokensRef.current.delete(groupId);
        stopGenerationByRunningId(groupId);
        setNodes((current) => current.map((node) => {
            if (node.id === groupId) return { ...node, metadata: { ...node.metadata, workflowState: "stopped" } };
            if (node.metadata?.groupId === groupId && (node.metadata.workflowState === "waiting" || node.metadata.workflowState === "ready" || node.metadata.workflowState === "running")) return { ...node, metadata: { ...node.metadata, workflowState: "stopped", reasoningText: undefined, reasoningState: undefined } };
            return node;
        }));
    }, [stopGenerationByRunningId]);

    const runWorkflowGroup = useCallback(async (groupId: string) => {
        if (workflowRunTokensRef.current.has(groupId)) return;
        const baseNodes = nodesRef.current;
        const baseConnections = connectionsRef.current;
        const group = baseNodes.find((node) => node.id === groupId && node.type === CanvasNodeType.WorkflowGroup);
        if (!group) return;
        if (isCanvasNodeLocked(group, baseNodes)) {
            message.warning("请先解锁工作流");
            return;
        }
        const executable = workflowExecutableNodes(groupId, baseNodes, baseConnections);
        const dependencies = new Map(executable.map((node) => [node.id, workflowTemplateDependencies(node, groupId, baseNodes, baseConnections)]));
        const outputTemplateIds = workflowOutputTemplateIds(groupId, baseNodes, baseConnections);
        const batchInputs = workflowBatchInputs(groupId, baseNodes, baseConnections);
        const batches: Array<CanvasNodeData | null> = batchInputs.length ? batchInputs : [null];
        const attachedOutputIds = new Set(baseConnections.flatMap((connection) => connection.fromNodeId === groupId && connection.fromPort === "workflow-output" ? [connection.toNodeId] : []));
        const previousLayoutRows = new Set(baseNodes.flatMap((node) => (node.metadata?.groupId === groupId || attachedOutputIds.has(node.id)) && node.metadata.workflowRunId ? [`${node.metadata.workflowRunId}:${node.metadata.workflowBatchIndex || 0}`] : [])).size;
        const runId = nanoid();
        workflowRunTokensRef.current.set(groupId, runId);
        setNodes((current) => current.map((node) => node.id === groupId
            ? { ...node, metadata: { ...node.metadata, workflowState: "running", workflowRunId: runId, errorDetails: undefined } }
            : node.metadata?.groupId === groupId && executable.some((item) => item.id === node.id)
                ? { ...node, metadata: { ...node.metadata, workflowState: "waiting", errorDetails: undefined } }
                : node));

        try {
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
                const batch = batches[batchIndex];
                const results = new Map<string, string[]>();
                if (batch && (batch.type !== CanvasNodeType.WorkflowGroup || workflowBatchReferenceIds(batch, nodesRef.current, baseConnections).length)) results.set(WORKFLOW_INPUT_ID, [batch.id]);
                const started = new Set<string>();

                while (started.size < executable.length) {
                    if (workflowRunTokensRef.current.get(groupId) !== runId) return;
                    const readyIds = workflowReadyNodeIds(executable, dependencies, results, started);
                    if (!readyIds.length) {
                        setNodes((current) => current.map((node) => node.id === groupId ? { ...node, metadata: { ...node.metadata, workflowState: "waiting" } } : node));
                        return;
                    }
                    readyIds.forEach((id) => started.add(id));
                    setNodes((current) => current.map((node) => readyIds.includes(node.id) ? { ...node, metadata: { ...node.metadata, workflowState: "running" } } : node));

                    const settled = await Promise.allSettled(readyIds.map(async (templateId) => {
                        const template = executable.find((node) => node.id === templateId)!;
                        const runtime = buildWorkflowRunContext(template, groupId, batch, results, baseNodes, baseConnections, nodesRef.current);
                        const options: WorkflowGenerationOptions = { runningId: groupId, runId, groupId, templateNodeId: templateId, batchIndex, layoutIndex: previousLayoutRows + batchIndex, contextNodes: runtime.nodes, contextConnections: runtime.connections };
                        const outputIds = template.type === CanvasNodeType.Split
                            ? await handleSplitNode(templateId, options)
                            : await handleGenerateNode(templateId, workflowGenerationMode(template)!, runtime.prompt, options);
                        if (!outputIds.length) throw new Error(`${template.title || "工作流步骤"}未产生结果`);
                        results.set(templateId, outputIds);
                        setNodes((current) => current.map((node) => node.id === templateId ? { ...node, metadata: { ...node.metadata, workflowState: "success" } } : node));
                    }));
                    const failed = settled.find((item) => item.status === "rejected");
                    if (failed?.status === "rejected") throw failed.reason;
                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

                    setNodes((current) => {
                        const currentGroup = current.find((node) => node.id === groupId);
                        if (!currentGroup) return current;
                        const outputResultIds = new Set(outputTemplateIds.flatMap((templateId) => results.get(templateId) || []));
                        const outputBatchRootIds = new Set(current.flatMap((node) => outputResultIds.has(node.id) && node.metadata?.batchRootId ? [node.metadata.batchRootId] : []));
                        const children = current.filter((node) => node.metadata?.groupId === groupId && !outputResultIds.has(node.id) && !outputBatchRootIds.has(node.id));
                        const expanded = expandWorkflowGroupBounds(currentGroup, children);
                        const widthDelta = expanded.width - currentGroup.width;
                        const attachedOutputIds = widthDelta > 0 ? new Set(connectionsRef.current.flatMap((connection) => connection.fromNodeId === groupId && connection.fromPort === "workflow-output" ? [connection.toNodeId] : [])) : new Set<string>();
                        return current.map((node) => node.id === groupId
                            ? expanded
                            : attachedOutputIds.has(node.id) && node.metadata?.workflowRunId
                                ? { ...node, position: { ...node.position, x: node.position.x + widthDelta } }
                                : node);
                    });
                }
                const missingMappedOutput = baseConnections
                    .filter((connection) => connection.toNodeId === groupId && connection.toPort === "workflow-output")
                    .some((connection) => {
                        const source = baseNodes.find((node) => node.id === connection.fromNodeId);
                        if (source?.metadata?.content) return false;
                        return !results.has(source?.metadata?.workflowResultOf || connection.fromNodeId);
                    });
                if (missingMappedOutput) {
                    setNodes((current) => current.map((node) => node.id === groupId ? { ...node, metadata: { ...node.metadata, workflowState: "waiting" } } : node));
                    return;
                }
                const outputResultIds = outputTemplateIds.flatMap((templateId) => results.get(templateId) || []);
                if (outputResultIds.length) {
                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                    const published = attachWorkflowOutputResults(groupId, runId, outputResultIds, nodesRef.current, connectionsRef.current, nanoid);
                    nodesRef.current = published.nodes;
                    connectionsRef.current = published.connections;
                    setNodes(published.nodes);
                    setConnections(published.connections);
                }
            }

            if (workflowRunTokensRef.current.get(groupId) !== runId) return;
            workflowRunTokensRef.current.delete(groupId);
            setNodes((current) => current.map((node) => node.id === groupId ? { ...node, metadata: { ...node.metadata, workflowState: "success" } } : node));
        } catch (error) {
            if (workflowRunTokensRef.current.get(groupId) !== runId) return;
            workflowRunTokensRef.current.delete(groupId);
            stopGenerationByRunningId(groupId);
            const errorDetails = error instanceof Error ? error.message : "工作流运行失败";
            message.error(errorDetails);
            setNodes((current) => current.map((node) => node.id === groupId
                ? { ...node, metadata: { ...node.metadata, workflowState: "error", errorDetails } }
                : node.metadata?.groupId === groupId && node.metadata.workflowState === "running"
                    ? { ...node, metadata: { ...node.metadata, workflowState: "error", errorDetails } }
                    : node));
        }
    }, [handleGenerateNode, handleSplitNode, message, stopGenerationByRunningId]);

    useEffect(() => {
    }, [handleGenerateNode]);

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            if (isCanvasNodeLocked(node, nodesRef.current)) {
                message.warning("请先解锁节点");
                return;
            }
            if (node.type === CanvasNodeType.Split) {
                await handleSplitNode(node.id);
                return;
            }
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            if (node.type === CanvasNodeType.Music) {
                const musicSource = sourceNode.type === CanvasNodeType.Config && sourceNode.metadata?.generationMode === "music" ? sourceNode : node;
                await handleGenerateNode(musicSource.id, "music", musicSource.metadata?.musicDescription || "");
                return;
            }
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const savedImageModel = savedImageMetadata?.model || effectiveConfig.imageModel || effectiveConfig.model;
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                          ...effectiveConfig,
                          model: savedImageModel,
                          imagePromptOptimize: savedImageMetadata.optimizePrompt == null ? effectiveConfig.imagePromptOptimize : String(savedImageMetadata.optimizePrompt),
                          imageWebSearch: savedImageMetadata.imageWebSearch == null ? effectiveConfig.imageWebSearch : String(savedImageMetadata.imageWebSearch),
                          imageSearch: savedImageMetadata.imageSearch == null ? effectiveConfig.imageSearch : String(savedImageMetadata.imageSearch),
                          size: normalizeImageSizeForModel(savedImageModel, savedImageMetadata.size || effectiveConfig.size),
                          count: "1",
                      }
                    : { ...buildGenerationConfig(effectiveConfig, node.type === CanvasNodeType.Video ? node : sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1", ...(node.type === CanvasNodeType.Video ? { videoCount: node.metadata?.batchRootId ? "1" : String(node.metadata?.videoCount || 1) } : {}) };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const baseContext = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const videoContextResult = node.type === CanvasNodeType.Video && baseContext ? resolveVideoGenerationContext(generationConfig, node, baseContext, buildNodeGenerationInputs(sourceNode.id, nodesRef.current, connectionsRef.current)) : null;
            if (videoContextResult?.error) {
                message.warning(videoContextResult.error);
                return;
            }
            const context = videoContextResult ? await hydrateNodeGenerationContext(videoContextResult.context) : baseContext;
            const videoGenerationConfig = videoContextResult?.videoInputMode
                ? { ...generationConfig, videoInputMode: videoContextResult.videoInputMode }
                : generationConfig;
            const prompt = (savedImageMetadata?.prompt || context?.prompt || "").trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            const retryImages = retryReferenceImages || [];

            setRunningNodeId(node.id);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined, reasoningText: undefined, reasoningState: item.type === CanvasNodeType.Text && supportsReasoningModel(generationConfig.model) ? "streaming" as const : undefined } } : item)));
            const controller = startGenerationRequest(node.id, sourceNode.id, node.id);

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    const answer = await requestImageQuestion(generationConfig, buildNodeResponseMessages({ ...context, prompt }), {
                        webSearch: modelSupportsWebSearch(generationConfig.model) && node.metadata?.webSearch === true,
                        signal: controller.signal,
                        onJobCreated: (generationJobId) => setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, generationJobId } } : item)),
                        onReasoning: (reasoningText, generationJobId) => setNodes((prev) => prev.map((item) => item.id === node.id && item.metadata?.status === NODE_STATUS_LOADING && item.metadata.generationJobId === generationJobId ? { ...item, metadata: { ...item.metadata, reasoningText: reasoningText || undefined, reasoningState: reasoningText ? "streaming" as const : undefined } } : item)),
                    });
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer, prompt, status: NODE_STATUS_SUCCESS, reasoningState: item.metadata?.reasoningText?.trim() ? "complete" as const : undefined } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const targetIds = isMediaBatchRoot(node) ? node.metadata?.batchChildIds || [] : [node.id];
                    setNodes((prev) => prev.map((item) => targetIds.includes(item.id) ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item));
                    const applyDeliveredVideo = (result: VideoGenerationResult) => {
                        const targetId = targetIds[result.outputIndex];
                        if (!targetId || !result.url) return;
                        setNodes((prev) => prev.map((item) => {
                            if (item.id === targetId) return { ...item, metadata: { ...item.metadata, ...videoDeliveryMetadata(result), prompt } };
                            if (item.id === node.id && (result.outputIndex === 0 || !item.metadata?.primaryResultId)) return { ...item, metadata: { ...item.metadata, ...videoDeliveryMetadata(result), prompt, primaryResultId: targetId } };
                            return item;
                        }));
                    };
                    const applyStage1Review = (review: LtxStage1ReviewReady) => {
                        const targetId = targetIds[review.outputIndex];
                        if (!targetId) return;
                        setNodes((prev) => prev.map((item) => {
                            if (item.id === targetId) return { ...item, metadata: { ...item.metadata, ...stage1ReviewMetadata(review), prompt } };
                            if (item.id === node.id && (review.outputIndex === 0 || !item.metadata?.primaryResultId)) return { ...item, metadata: { ...item.metadata, ...stage1ReviewMetadata(review), prompt, primaryResultId: targetId } };
                            return item;
                        }));
                    };
                    const results = await requestVideoGeneration(videoGenerationConfig, prompt, retryImages, context?.referenceVideos || [], context?.referenceAudios || [], {
                        ltxFrames: videoContextResult?.ltxFrames,
                        signal: controller.signal,
                        onJobCreated: (generationJobId, outputIndex = 0) => setNodes((prev) => prev.map((item) => item.id === targetIds[outputIndex] || (outputIndex === 0 && item.id === node.id) ? { ...item, metadata: { ...item.metadata, generationJobId, generationState: "queued" } } : item)),
                        onStatusChange: (generationState, outputIndex = 0) => setNodes((prev) => prev.map((item) => item.id === targetIds[outputIndex] || (outputIndex === 0 && item.id === node.id) ? { ...item, metadata: { ...item.metadata, generationState: generationState === "queued" ? "queued" : "running" } } : item)),
                        onProgress: (generationProgress, generationStage, outputIndex = 0, remoteOperationLabel) => setNodes((prev) => prev.map((item) => item.id === targetIds[outputIndex] || (outputIndex === 0 && item.id === node.id) ? { ...item, metadata: { ...item.metadata, generationProgress, generationStage, remoteOperationLabel } } : item)),
                        onResult: applyDeliveredVideo,
                        onArchived: applyDeliveredVideo,
                        onReviewReady: applyStage1Review,
                    });
                    const stored = await Promise.all(results.map(async (result) => ({ outputIndex: result.outputIndex, video: await storeGeneratedVideo(result) })));
                    const succeeded = new Set<number>();
                    stored.forEach(({ outputIndex, video }) => {
                        const targetId = targetIds[outputIndex];
                        if (!targetId) return;
                        succeeded.add(outputIndex);
                        const videoSize = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                        setNodes((prev) => prev.map((item) => {
                            if (item.id !== targetId && item.id !== node.id) return item;
                            const center = { x: item.position.x + item.width / 2, y: item.position.y + item.height / 2 };
                            if (item.id === node.id && (targetId === node.id || !item.metadata?.primaryResultId)) return { ...item, width: videoSize.width, height: videoSize.height, position: { x: center.x - videoSize.width / 2, y: center.y - videoSize.height / 2 }, metadata: { ...item.metadata, ...videoMetadata(video), prompt, primaryResultId: targetId } };
                            if (item.id === targetId) return { ...item, width: videoSize.width, height: videoSize.height, position: { x: center.x - videoSize.width / 2, y: center.y - videoSize.height / 2 }, metadata: { ...item.metadata, ...videoMetadata(video), prompt } };
                            return item;
                        }));
                    });
                    setNodes((prev) => prev.map((item) => {
                        const outputIndex = targetIds.indexOf(item.id);
                        return outputIndex >= 0 && !succeeded.has(outputIndex) ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "视频生成失败" } } : item;
                    }));
                    if (!succeeded.size) throw new Error("全部视频生成失败");
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, prompt, { signal: controller.signal, onJobCreated: (generationJobId) => setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, generationJobId } } : item)) }), generationConfig.audioFormat);
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), prompt, ...buildAudioGenerationMetadata(generationConfig) } } : item)));
                    return;
                }

                const imageOptions = { signal: controller.signal, onJobCreated: (generationJobId: string) => setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, generationJobId, imageOutputIndex: 0 } } : item)) };
                const image = useReferenceImages ? await requestEdit(generationConfig, prompt, retryImages, undefined, imageOptions).then((items) => items[0]) : await requestGeneration(generationConfig, prompt, imageOptions).then((items) => items[0]);
                const uploadedImage = await uploadImage(image.dataUrl);
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const imageSize = fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
                const generationMetadata = savedImageMetadata?.generationType
                    ? { generationType: savedImageMetadata.generationType, model: generationConfig.model, size: generationConfig.size, optimizePrompt: generationConfig.imagePromptOptimize === "true", imageWebSearch: generationConfig.imageWebSearch === "true", imageSearch: generationConfig.imageSearch === "true", count: savedImageMetadata.count || 1, references: savedImageMetadata.references }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  type: CanvasNodeType.Image,
                                  width: imageSize.width,
                                  height: imageSize.height,
                                  metadata: { ...item.metadata, ...imageMetadata(uploadedImage), prompt, ...generationMetadata },
                              }
                            : item,
                    ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, reasoningText: undefined, reasoningState: undefined } } : item)));
            } finally {
                finishGenerationRequest(node.id, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, handleGenerateNode, handleSplitNode, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            if (isCanvasNodeLocked(node, nodesRef.current)) return;
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    optimizePrompt: effectiveConfig.imagePromptOptimize === "true",
                    imageWebSearch: effectiveConfig.imageWebSearch === "true",
                    imageSearch: effectiveConfig.imageSearch === "true",
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count, 3),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.imagePromptOptimize, effectiveConfig.imageSearch, effectiveConfig.imageWebSearch, effectiveConfig.model, effectiveConfig.size],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
                title: text.slice(0, 32) || "Assistant Text",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content);
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                setNodes((prev) => [...prev, { id, type: CanvasNodeType.Video, title: payload.title, position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 }, width: nextSize.width, height: nextSize.height, metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height } }]);
                setSelectedNodeIds(new Set([id]));
            } else if (payload.kind === "audio") {
                const type = payload.audioKind === "music" ? CanvasNodeType.Music : CanvasNodeType.Audio;
                const spec = NODE_DEFAULT_SIZE[type];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                setNodes((prev) => [...prev, { id, type, title: payload.title, position: { x: center.x - spec.width / 2, y: center.y - spec.height / 2 }, width: spec.width, height: spec.height, metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, durationMs: payload.durationMs, mimeType: payload.mimeType, musicTitle: type === CanvasNodeType.Music ? payload.title : undefined } }]);
                setSelectedNodeIds(new Set([id]));
                setSelectedConnectionId(null);
            } else {
                insertAssistantImage({ id: `asset-${Date.now()}`, prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey });
            }
            setAssetPickerOpen(false);
        },
        [insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    const handleCanvasNodeHoverStart = useCallback((nodeId: string) => {
        if (nodeDraggingRef.current) return;
        setHoveredNodeId(nodeId);
    }, []);
    const handleCanvasNodeHoverEnd = useCallback((nodeId: string) => {
        setHoveredNodeId((current) => current === nodeId ? null : current);
    }, []);
    const handleCanvasNodeContextMenu = useCallback((event: ReactMouseEvent, id: string) => {
        if (isReadOnly) return;
        event.preventDefault();
        event.stopPropagation();
        const node = nodesRef.current.find((item) => item.id === id);
        const target = event.target;
        const editor = target instanceof Element ? target.closest("[contenteditable='true']") : null;
        const selection = window.getSelection();
        const selectedText = node?.type === CanvasNodeType.Text && !isCanvasNodeLocked(node, nodesRef.current) && editor && selection?.anchorNode && selection?.focusNode && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode) ? selection.toString() : "";
        setCanvasCreatePosition(null);
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id, selectedText: selectedText.trim() ? selectedText : undefined });
    }, [isReadOnly]);
    const handleCanvasNodeViewImage = useCallback((node: CanvasNodeData) => setPreviewNodeId(node.id), []);

    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || "未命名画布"}
                    readOnly={isReadOnly}
                    ownerName={currentProject?.ownerName || currentProject?.ownerUsername || "其他用户"}
                    saveState={saveState}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onHome={() => navigate("/")}
                    onProjects={() => navigate("/canvas")}
                    onStudio={() => window.location.assign(studioOrigin)}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onCopyProject={() => void copyAndOpenProject()}
                    onSubmitTemplate={() => {}}
                />

                <CrocoCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    backgroundMode={backgroundMode}
                    onViewportChange={(next) => {
                        setViewport(next);
                        setContextMenu(null);
                        setCanvasCreatePosition(null);
                    }}
                    onCanvasMouseDown={isReadOnly ? undefined : handleCanvasMouseDown}
                    onCanvasDeselect={isReadOnly ? undefined : deselectCanvas}
                    onContextMenu={handleCanvasContextMenu}
                    onDrop={isReadOnly ? undefined : handleDrop}
                    viewportOverlay={overviewActive ? <CanvasOverviewLayer nodes={visibleNodes} connections={visibleConnections} nodeById={nodeById} viewport={viewport} width={size.width} height={size.height} selectedNodeIds={selectedNodeIds} /> : null}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {renderedConnections.map((connection) => {
                                const from = nodeById.get(connection.fromNodeId);
                                const to = nodeById.get(connection.toNodeId);
                                if (!from || !to) return null;

                                return (
                                    <ConnectionPath
                                        key={connection.id}
                                        connection={connection}
                                        from={from}
                                        to={to}
                                        active={!isReadOnly && (selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id))}
                                        onSelect={() => {
                                            if (isReadOnly) return;
                                            setCanvasCreatePosition(null);
                                            setSelectedConnectionId(connection.id);
                                            setSelectedNodeIds(new Set());
                                            setContextMenu(null);
                                        }}
                                        onContextMenu={(event) => {
                                            if (isReadOnly) return;
                                            setCanvasCreatePosition(null);
                                            setSelectedConnectionId(connection.id);
                                            setSelectedNodeIds(new Set());
                                            setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: connection.id });
                                        }}
                                    />
                                );
                            })}
                        {connectingHandles.map((handle) => (
                            <ActiveConnectionPath key={`${handle.nodeId}-${handle.handleType}-${handle.port || "default"}`} node={nodeById.get(handle.nodeId)} handle={handle} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} />
                        ))}
                    </svg>

                    {renderedNodes.map((node) => {
                        const locked = isCanvasNodeLocked(node, nodes);
                        const canvasManagedGeneration = isCanvasManagedGeneration(node);
                        const nodeReadOnly = isReadOnly || (locked && !canvasManagedGeneration);
                        const renderDetail = overviewActive ? "outline" : canvasNodeRenderDetail(node, viewport.k, visibleNodes.length);
                        if (renderDetail !== "full") return (
                            <CanvasNodeLod
                                key={node.id}
                                node={node}
                                detail={renderDetail}
                                selected={!isReadOnly && selectedNodeIds.has(node.id)}
                                related={!isReadOnly && relatedHighlight.nodeIds.has(node.id)}
                                connectionTarget={!isReadOnly && connectionTargetNodeId === node.id}
                                readOnly={nodeReadOnly}
                                locked={locked}
                                themeKey={colorTheme}
                                onMouseDown={isReadOnly ? () => {} : handleNodeMouseDown}
                                onHoverStart={handleCanvasNodeHoverStart}
                                onHoverEnd={handleCanvasNodeHoverEnd}
                                onContextMenu={handleCanvasNodeContextMenu}
                                onViewImage={handleCanvasNodeViewImage}
                            />
                        );
                        return (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            locked={locked}
                            readOnly={nodeReadOnly}
                            scale={viewport.k}
                            isSelected={!isReadOnly && selectedNodeIds.has(node.id)}
                            isRelated={!isReadOnly && relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={!isReadOnly && activeNodeId === node.id}
                            isConnectionTarget={!isReadOnly && connectionTargetNodeId === node.id}
                            isConnecting={!isReadOnly && Boolean(connectingParams)}
                            editRequestNonce={editingNodeId === node.id ? editRequestNonce : 0}
                            showPanel={!isReadOnly && !locked && !hasMultipleSelectedNodes && selectedNodeIds.has(node.id) && dialogNodeId === node.id && !selectionBox}
                            batchCount={batchChildCountById.get(node.id) || 0}
                            groupChildCount={groupChildCountById.get(node.id) || 0}
                            isGroupDropTarget={dropTargetGroupId === node.id}
                            batchExpanded={Boolean(node.metadata?.batchExpanded)}
                            batchClosing={Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId))}
                            batchOpening={openingBatchIds.has(node.id)}
                            batchRecovering={collapsingBatchIds.has(node.id)}
                            batchMotion={batchMotionById.get(node.id)}
                            showImageInfo={true}
                            resourceLabel={resourceReferenceByNodeId.get(node.id)}
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || []}
                            renderPanel={(panelNode, panelLayout) => {
                                const panelVideoConfig = panelNode.type === CanvasNodeType.Config && panelNode.metadata?.generationMode === "video" ? buildGenerationConfig(effectiveConfig, panelNode, "video") : null;
                                return panelNode.type === CanvasNodeType.Config ? (
                                    panelNode.metadata?.generationMode === "music" ? null : (
                                        <CanvasConfigComposer
                                            value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                                            inputs={composerInputsById.get(panelNode.id) || []}
                                            contentHeight={panelLayout.contentHeight}
                                            videoInputMode={providerIdForModel(panelVideoConfig?.model || "") === "ltx" ? "multimodal" : panelVideoConfig?.videoInputMode}
                                            allowMultimodalVideoFrames={providerIdForModel(panelVideoConfig?.model || "") === "ltx"}
                                            allowedMultimodalMedia={providerIdForModel(panelVideoConfig?.model || "") === "minimax_h3" ? ["image", "audio"] : undefined}
                                            videoFirstFrameNodeId={panelNode.metadata?.videoFirstFrameNodeId}
                                            videoLastFrameNodeId={panelNode.metadata?.videoLastFrameNodeId}
                                            onVideoFirstFrameChange={(videoFirstFrameNodeId) => handleConfigNodeChange(panelNode.id, { videoFirstFrameNodeId })}
                                            onVideoLastFrameChange={(videoLastFrameNodeId) => handleConfigNodeChange(panelNode.id, { videoLastFrameNodeId })}
                                            videoEditSourceNodeId={panelNode.metadata?.videoEditSourceNodeId}
                                            onVideoEditSourceChange={(videoEditSourceNodeId) => handleConfigNodeChange(panelNode.id, { videoEditSourceNodeId })}
                                            onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                                            onClose={() => setDialogNodeId(null)}
                                        />
                                    )
                                ) : panelNode.type === CanvasNodeType.Split ? (
                                    <CanvasConfigComposer
                                        value={panelNode.metadata?.composerContent ?? ""}
                                        inputs={composerInputsById.get(panelNode.id) || []}
                                        contentHeight={panelLayout.contentHeight}
                                        title="组装拆分内容"
                                        description="自然语言描述要求；使用 @ 可选择并排列输入"
                                        placeholder="描述如何拆分，按 @ 引用指定的文本或媒体"
                                        onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                                        onClose={() => setDialogNodeId(null)}
                                    />
                                ) : panelNode.type === CanvasNodeType.Audio && panelNode.metadata?.content ? (
                                    <AudioSegmentationPanel
                                        nodeId={panelNode.id}
                                        title={panelNode.title || "音频"}
                                        url={panelNode.metadata.content}
                                        durationMs={panelNode.metadata.durationMs}
                                        onSubmit={handleCanvasAudioSegments}
                                    />
                                ) : (
                                    <CanvasNodePromptPanel
                                        node={panelNode}
                                        contentHeight={panelLayout.contentHeight}
                                        isRunning={runningNodeId === panelNode.id}
                                        mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || []}
                                        onPromptChange={handleNodePromptChange}
                                        onConfigChange={handleConfigNodeChange}
                                        onGenerate={handleGenerateNode}
                                        onStop={confirmStopGeneration}
                                        onImageSettingsOpenChange={(open) => {
                                            setNodeImageSettingsOpen(open);
                                            if (open) setToolbarNodeId(null);
                                        }}
                                    />
                                );
                            }}
                            renderNodeContent={(contentNode) => contentNode.metadata?.framePickerSourceNodeId ? (
                                <CanvasVideoFramePicker
                                    sourceUrl={nodeById.get(contentNode.metadata.framePickerSourceNodeId)?.metadata?.content || ""}
                                    initialTime={contentNode.metadata.framePickerTime}
                                    readOnly={isReadOnly || locked}
                                    onTimeCommit={(framePickerTime) => handleConfigNodeChange(contentNode.id, { framePickerTime })}
                                    onCancel={() => deleteNodes(new Set([contentNode.id]))}
                                    onConfirm={(result) => confirmVideoMiddleFrame(contentNode, result)}
                                />
                            ) : nodeReadOnly ? <ReadOnlyConfigNode node={contentNode} /> : contentNode.type === CanvasNodeType.Split ? (
                                <CanvasSplitNodePanel node={contentNode} inputs={moduleInputsById.get(contentNode.id) || []} isRunning={runningNodeId === contentNode.id} onConfigChange={handleConfigNodeChange} onComposerToggle={() => setDialogNodeId((current) => current === contentNode.id ? null : contentNode.id)} onStop={confirmStopGeneration} onGenerate={(nodeId) => void handleSplitNode(nodeId)} />
                            ) : (
                                <CanvasConfigNodePanel node={contentNode} isRunning={runningNodeId === contentNode.id || isCanvasManagedGeneration(contentNode)} inputSummary={getInputSummary(moduleInputsById.get(contentNode.id) || [])} mentionReferences={mentionReferencesByNodeId.get(contentNode.id) || []} onConfigChange={handleConfigNodeChange} onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))} onStop={confirmStopGeneration} onGenerate={(nodeId) => { const target = nodesRef.current.find((item) => item.id === nodeId); void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? ""); }} />
                            )}
                            onMouseDown={isReadOnly ? () => {} : handleNodeMouseDown}
                            onHoverStart={handleCanvasNodeHoverStart}
                            onHoverEnd={handleCanvasNodeHoverEnd}
                            onConnectStart={handleConnectStart}
                            onResize={handleNodeResize}
                            onPanelResize={handlePromptPanelResize}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onRetry={(node) => void handleRetryNode(node)}
                            onApproveStage1={(node) => void handleApproveStage1(node)}
                            onGenerateImage={generateImageFromTextNode}
                            onViewImage={handleCanvasNodeViewImage}
                            onRunWorkflow={(nodeId) => void runWorkflowGroup(nodeId)}
                            onStopWorkflow={stopWorkflowGroup}
                            onContextMenu={handleCanvasNodeContextMenu}
                        />
                        );
                    })}

                    {!isReadOnly && selectionBox ? (
                        <div
                            className="pointer-events-none absolute z-[100] border"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                                borderColor: theme.canvas.selectionStroke,
                                background: theme.canvas.selectionFill,
                            }}
                        />
                    ) : null}
                    {!isReadOnly && pendingConnectionCreate ? <CanvasCreateNodeMenu position={pendingConnectionCreate.position} title={pendingConnectionCreate.connections.length > 1 ? `引用 ${pendingConnectionCreate.connections.length} 个选中节点生成` : "引用该节点生成"} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                    {!isReadOnly && canvasCreatePosition ? <CanvasCreateNodeMenu position={canvasCreatePosition} title="添加节点" onCreate={(type) => { createNode(type, canvasCreatePosition); setCanvasCreatePosition(null); }} onClose={() => setCanvasCreatePosition(null)} /> : null}
                </CrocoCanvas>

                {!isReadOnly ? (
                    <CanvasNodeHoverToolbar
                        node={isNodeDragging || nodeImageSettingsOpen ? null : toolbarNode}
                        viewport={viewport}
                        locked={Boolean(toolbarNode && isCanvasNodeLocked(toolbarNode, nodes))}
                        lockDisabled={Boolean(toolbarNode && !isCanvasNodeLocked(toolbarNode, nodes) && isCanvasNodeLockBusy(toolbarNode.id, nodes))}
                        onToggleLock={(node) => toggleNodeLocked(node.id)}
                        onDuplicate={(node) => duplicateNode(node.id)}
                        onKeep={keepNodeToolbar}
                        onLeave={hideNodeToolbar}
                        onInfo={(node) => setInfoNodeId(node.id)}
                        onEditText={openTextEditor}
                        onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                        onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                        onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                        onGenerateImage={generateImageFromTextNode}
                        onUseMiddleFrame={createVideoMiddleFramePicker}
                        onUseLastFrame={useVideoLastFrame}
                        onUpload={(node) => handleUploadRequest(node.id)}
                        onDownload={downloadNodeImage}
                        onEnhancementReady={(node, asset: CloudAsset) => {
                            const sourceStorageKey = node.metadata?.h3SourceStorageKey || node.metadata?.storageKey;
                            if (!sourceStorageKey || !asset.url) return;
                            setNodes((current) => current.map((item) => {
                                const itemSource = item.metadata?.h3SourceStorageKey || item.metadata?.storageKey;
                                if (itemSource !== sourceStorageKey) return item;
                                const width = asset.width || item.metadata?.naturalWidth || item.width;
                                const height = asset.height || item.metadata?.naturalHeight || item.height;
                                const size = fitNodeSize(width, height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                                const center = { x: item.position.x + item.width / 2, y: item.position.y + item.height / 2 };
                                return {
                                    ...item,
                                    width: size.width,
                                    height: size.height,
                                    position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
                                    metadata: {
                                        ...item.metadata,
                                        h3SourceStorageKey: item.metadata?.h3SourceStorageKey || item.metadata?.storageKey,
                                        h3SourceContent: item.metadata?.h3SourceContent || item.metadata?.content,
                                        ...videoMetadata({ url: asset.url!, storageKey: asset.id, bytes: asset.byte_size || 0, mimeType: asset.mime_type || "video/mp4", width: asset.width || undefined, height: asset.height || undefined, durationMs: asset.duration_seconds ? Math.round(asset.duration_seconds * 1000) : undefined }),
                                        h3EnhancedAssetId: asset.id,
                                    },
                                };
                            }));
                        }}
                        onSaveAsset={(node) => void saveNodeAsset(node)}
                        onSavePrompt={(node) => void saveNodePrompt(node)}
                        onMaskEdit={(node) => {
                            if (!modelSupportsMaskEdit(buildGenerationConfig(effectiveConfig, node, "image").model)) return void message.warning("当前模型不支持局部编辑");
                            setMaskEditNodeId(node.id);
                        }}
                        onCrop={(node) => setCropNodeId(node.id)}
                        onSplit={(node) => setSplitNodeId(node.id)}
                        onUpscale={(node) => setUpscaleNodeId(node.id)}
                        onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                        onAngle={(node) => setAngleNodeId(node.id)}
                        onViewImage={(node) => setPreviewNodeId(node.id)}
                        onReversePrompt={createImageReversePromptNodes}
                        onRetry={(node) => void handleRetryNode(node)}
                        onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                        onDelete={(node) => deleteNodes(new Set([node.id]))}
                        commentModels={effectiveConfig.textModels}
                        onBeautifyComment={(node) => void beautifyCommentNode(node)}
                        onSetCommentColor={(node, commentColor) => updateCommentNode(node.id, { commentColor })}
                        onSetCommentModel={(node, commentModel) => updateCommentNode(node.id, { commentModel })}
                    />
                ) : null}

                {!isReadOnly ? (
                    <CanvasToolbar
                        selectedCount={selectedNodeIds.size}
                        selectedResultCount={exportableSelectedNodes.length}
                        exportingSelectedResults={exportingSelectedResults}
                        canUndo={historyState.canUndo}
                        canRedo={historyState.canRedo}
                        onAddImage={() => createNode(CanvasNodeType.Image)}
                        onAddVideo={() => createNode(CanvasNodeType.Video)}
                        onAddAudio={() => createNode(CanvasNodeType.Audio)}
                        onAddMusic={() => createNode(CanvasNodeType.Music)}
                        onAddText={() => createNode(CanvasNodeType.Text)}
                        onAddComment={() => createNode(CanvasNodeType.Comment)}
                        onAddConfig={() => createNode(CanvasNodeType.Config)}
                        onAddSplit={() => createNode(CanvasNodeType.Split)}
                        onAddGroup={() => createNode(CanvasNodeType.Group)}
                        onExportSelectedResults={() => void exportSelectedResults()}
                        onUndo={undoCanvas}
                        onRedo={redoCanvas}
                        onUpload={() => handleUploadRequest()}
                        onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                        onClear={() => setClearConfirmOpen(true)}
                        onDeselect={deselectCanvas}
                        onOpenMyAssets={() => setAssetPickerOpen(true)}
                        onOpenPrompts={() => setPromptLibraryOpen(true)}
                    />
                ) : null}

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

                {!isReadOnly && contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        canCreateGroup={contextMenu.type === "node" && selectedNodeIds.has(contextMenu.nodeId) && [...selectedNodeIds].every((id) => !isCanvasNodeLocked(nodeById.get(id), nodes)) && nodes.some((node) => selectedNodeIds.has(node.id) && !isCanvasGroupNode(node))}
                        canExportSelected={contextMenu.type === "node" && selectedNodeIds.has(contextMenu.nodeId) && selectedNodeIds.size > 1 && exportableSelectedNodes.length > 0 && !exportingSelectedResults}
                        canCopySelectedNodeIds={contextMenu.type === "node" && selectedNodeIds.has(contextMenu.nodeId) && selectedNodeIds.size > 1}
                        selectedExportCount={exportableSelectedNodes.length}
                        selectedNodeCount={selectedNodeIds.size}
                        canDelete={contextMenu.type === "connection"
                            ? !connections.some((connection) => connection.id === contextMenu.connectionId && [connection.fromNodeId, connection.toNodeId].some((id) => isCanvasNodeLocked(nodeById.get(id), nodes)))
                            : !isCanvasNodeLocked(nodeById.get(contextMenu.nodeId), nodes)}
                        onClose={() => setContextMenu(null)}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onDuplicateSelectedText={() => {
                            if (contextMenu.type !== "node" || !contextMenu.selectedText) return;
                            duplicateSelectedText(contextMenu.nodeId, contextMenu.selectedText);
                            setContextMenu(null);
                        }}
                        onCopySelectedNodeIds={() => {
                            const ids = nodes.filter((node) => selectedNodeIds.has(node.id)).map((node) => node.id);
                            void copyText(ids.join("\n"), `已复制 ${ids.length} 个节点 ID`);
                            setContextMenu(null);
                        }}
                        onCreateGroup={() => {
                            createSelectedCanvasGroup();
                            setContextMenu(null);
                        }}
                        onExportSelected={() => {
                            setContextMenu(null);
                            void exportSelectedResults();
                        }}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                deleteNodes(new Set([contextMenu.nodeId]));
                            } else {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                {!isReadOnly ? <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} /> : null}

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />

                {!isReadOnly && cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => void cropImageNode(cropNode!, crop)} /> : null}

                {!isReadOnly && maskEditNode?.metadata?.content ? <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open={Boolean(maskEditNode)} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} /> : null}

                {!isReadOnly && splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => setSplitNodeId(null)} onConfirm={(params) => void splitImageNode(splitNode!, params)} /> : null}

                {!isReadOnly && upscaleNode?.metadata?.content ? <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} onClose={() => setUpscaleNodeId(null)} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} /> : null}

                <Modal title="AI 超分" open={!isReadOnly && Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={() => setSuperResolveNodeId(null)}>
                    <div className="py-8 text-center text-base font-medium">暂未实现</div>
                </Modal>

                {!isReadOnly && angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <Modal
                    title="图片详情"
                    open={Boolean(previewNode?.metadata?.content)}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    width="auto"
                    styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewNode?.metadata?.content ? (
                        <img
                            src={previewNode.metadata.content}
                            alt={previewNode.title || "图片"}
                            style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }}
                        />
                    ) : null}
                </Modal>

                <Modal
                    title="清空画布？"
                    open={!isReadOnly && clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>

                {!isReadOnly ? <AssetPickerModal open={assetPickerOpen} onInsert={handleAssetInsert} onClose={() => setAssetPickerOpen(false)} /> : null}
                {!isReadOnly ? <PromptSelectDialog open={promptLibraryOpen} onOpenChange={setPromptLibraryOpen} onSelect={insertPromptNode} /> : null}
                <CanvasTemplateSubmitModal open={!isReadOnly && Boolean(templateProjectSnapshot)} project={templateProjectSnapshot} profile={profile} onCancel={() => setTemplateProjectSnapshot(null)} onSuccess={() => setTemplateProjectSnapshot(null)} />
            </section>
        </main>
    );
}

function CanvasTopBar({
    title,
    readOnly,
    ownerName,
    saveState,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onStudio,
    onCreateProject,
    onDeleteProject,
    onImportImage,
    onUndo,
    onRedo,
    onCopyProject,
    onSubmitTemplate,
}: {
    title: string;
    readOnly: boolean;
    ownerName: string;
    saveState?: CanvasSaveState;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onStudio: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onImportImage: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onCopyProject: () => void;
    onSubmitTemplate: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    useEffect(() => {
        if (!isTitleEditing || readOnly) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing, readOnly]);

    const menuItems = readOnly
        ? [
              { key: "home", icon: <Home className="size-4" />, label: "主页", onClick: onHome },
              { key: "projects", icon: <Images className="size-4" />, label: "我的画布", onClick: onProjects },
              { key: "studio", icon: <Clapperboard className="size-4" />, label: "视频工坊", onClick: onStudio },
          ]
        : [
              { key: "home", icon: <Home className="size-4" />, label: "主页", onClick: onHome },
              { key: "projects", icon: <Images className="size-4" />, label: "我的画布", onClick: onProjects },
              { key: "studio", icon: <Clapperboard className="size-4" />, label: "视频工坊", onClick: onStudio },
              { type: "divider" as const },
              { key: "new", icon: <Plus className="size-4" />, label: "新建画布", onClick: onCreateProject },
              { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除当前画布", onClick: onDeleteProject },
              { type: "divider" as const },
              { key: "import", icon: <Upload className="size-4" />, label: "导入素材", onClick: onImportImage },
              { type: "divider" as const },
              { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text="撤销" shortcut="⌘ Z" />, onClick: onUndo },
              { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
          ];

    return (
        <>
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex h-16 items-center justify-between px-4">
                <div className="pointer-events-auto flex min-w-0 items-center gap-3">
                    <Dropdown
                        trigger={["click"]}
                        menu={{ items: menuItems }}
                    >
                        <button type="button" className="grid size-9 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label="打开画布菜单">
                            <Menu className="size-5" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-2">
                        {isTitleEditing && !readOnly ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="max-w-[280px] bg-transparent p-0 text-left text-lg font-semibold tracking-normal outline-none"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="max-w-[280px] truncate border-b border-dashed border-transparent text-left text-lg font-semibold tracking-normal transition hover:border-current"
                                onDoubleClick={readOnly ? undefined : onStartTitleEditing}
                                title={readOnly ? `${ownerName} 的画布` : "双击修改画布名称"}
                            >
                                {title}
                            </button>
                        )}
                        <span className={`shrink-0 text-xs ${readOnly || saveState?.status === "saved" || saveState?.status === "saving" ? "opacity-45" : saveState?.status === "retrying" ? "text-amber-500" : "text-red-500"}`}>
                            {readOnly ? `${ownerName} · 只读` : saveState?.message || "已保存"}
                        </span>
                    </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-1">
                    {readOnly ? <Button type="text" icon={<Copy className="size-4" />} onClick={onCopyProject}>复制到我的画布</Button> : null}
                    <UserStatusActions
                        variant="canvas"
                        onOpenShortcuts={() => setShortcutsOpen(true)}
                    />
                </div>
            </div>
            <Modal title="快捷键" open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["拖动画布"]} value="平移视图" />
                    <Shortcut keys={["滚轮"]} value="缩放画布" />
                    <Shortcut keys={["缩放滑杆"]} value="精确调整缩放" />
                    {!readOnly ? (
                        <>
                            <Shortcut keys={["Ctrl / Cmd", "拖动"]} value="框选多个节点" />
                            <Shortcut keys={["Shift / Ctrl / Cmd", "点击"]} value="追加选择节点" />
                            <Shortcut keys={["Ctrl / Cmd", "A"]} value="全选节点" />
                            <Shortcut keys={["Ctrl / Cmd", "C / V"]} value="复制 / 粘贴节点，或粘贴剪切板文本/图片" />
                            <Shortcut keys={["Ctrl / Cmd", "Z"]} value="撤销" />
                            <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value="重做" />
                            <Shortcut keys={["Ctrl / Cmd", "Y"]} value="重做" />
                            <Shortcut keys={["Delete / Backspace"]} value="删除选中" />
                            <Shortcut keys={["Esc"]} value="取消选择并关闭浮层" />
                            <Shortcut keys={["拖入图片/视频/音频"]} value="上传到画布" />
                        </>
                    ) : null}
                </div>
            </Modal>
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-6 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
                            style={{ borderColor: "rgba(120,113,108,.28)", background: "linear-gradient(#fff, rgba(245,245,244,.92))", color: "rgb(68,64,60)" }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}

function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

function imageMetadata(image: UploadedImage): CanvasNodeMetadata {
    return { content: image.url, storageKey: image.storageKey, status: "success", naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
    return { content: video.url, ...(video.storageKey ? { storageKey: video.storageKey } : {}), status: "success", generationState: "ready", persistenceState: video.storageKey ? "saved" : "uploading", deliveryMode: video.storageKey ? undefined : "ltx-direct-preview-v1", isTemporaryPreview: !video.storageKey, naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType || "video/mp4", durationMs: video.durationMs, stage1ReviewState: undefined, stage1ReviewVersion: undefined, stage1ReviewExpiresAt: undefined };
}

function videoDeliveryMetadata(video: VideoGenerationResult): CanvasNodeMetadata {
    return { content: video.url, ...(video.storageKey ? { storageKey: video.storageKey } : {}), status: "success", generationState: "ready", persistenceState: video.storageKey ? "saved" : "uploading", deliveryMode: video.storageKey ? undefined : "ltx-direct-preview-v1", isTemporaryPreview: !video.storageKey, naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType || "video/mp4", durationMs: video.durationMs, errorDetails: undefined, stage1ReviewState: undefined, stage1ReviewVersion: undefined, stage1ReviewExpiresAt: undefined };
}

function stage1ReviewMetadata(review: LtxStage1ReviewReady): CanvasNodeMetadata {
    return { content: review.url, status: "success", generationState: "running", generationStage: "stage1_review", persistenceState: undefined, deliveryMode: "ltx-direct-preview-v1", isTemporaryPreview: true, mimeType: review.mimeType, stage1ReviewState: "awaiting", stage1ReviewVersion: review.reviewVersion, stage1ReviewExpiresAt: review.expiresAt, errorDetails: undefined };
}

function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
    return { content: audio.url, storageKey: audio.storageKey, status: "success", bytes: audio.bytes, mimeType: audio.mimeType || "audio/mpeg", durationMs: audio.durationMs };
}

function buildImageGenerationMetadata(type: CanvasImageGenerationType, config: AiConfig, count: number, references: ReferenceImage[]): CanvasNodeMetadata {
    return {
        generationType: type,
        model: config.model,
        size: config.size,
        optimizePrompt: config.imagePromptOptimize === "true",
        imageWebSearch: config.imageWebSearch === "true",
        imageSearch: config.imageSearch === "true",
        count,
        references: references.map(referenceUrl).filter((url): url is string => Boolean(url)),
    };
}

function buildAudioGenerationMetadata(config: AiConfig): CanvasNodeMetadata {
    return {
        model: config.model,
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: config.audioSpeed,
        audioVolume: config.audioVolume,
        audioPitch: config.audioPitch,
        audioInstructions: config.audioInstructions,
    };
}

function buildMusicGenerationMetadata(config: AiConfig, music: MusicGenerationConfig, musicBatchId: string, musicOutputIndex: number): CanvasNodeMetadata {
    return {
        model: config.model,
        prompt: music.description,
        musicTitle: music.title,
        musicDescription: music.description,
        musicLyrics: music.instrumental ? "" : music.lyrics,
        musicInstrumental: music.instrumental,
        musicStyles: music.styles,
        musicNegativeTags: music.negativeTags,
        musicVocalGender: music.vocalGender,
        musicStyleWeight: music.styleWeight,
        musicWeirdnessConstraint: music.weirdnessConstraint,
        musicMaxDuration: music.maxDuration,
        musicSeed: music.seed,
        musicTiledDecode: music.tiledDecode,
        musicOutputFormat: music.outputFormat,
        musicBatchId,
        musicOutputIndex,
    };
}

function generatedMusicMetadata(music: GeneratedMusic): CanvasNodeMetadata {
    return { content: music.url, storageKey: music.storageKey, status: "success", bytes: music.bytes, mimeType: music.mimeType, durationMs: music.durationMs, musicTitle: music.title, musicCoverUrl: music.coverUrl };
}

function resolveMusicConfigReferences(node: CanvasNodeData | undefined, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const music = musicConfigFromMetadata(node?.metadata);
    if (!node) return music;
    const references = buildNodeMentionReferences(node, nodes, connections).filter((reference) => reference.kind === "text" && reference.text);
    const resolve = (value: string) => references.reduce((text, reference) => text.split(reference.label).join(reference.text || reference.label), value);
    return { ...music, description: resolve(music.description), lyrics: resolve(music.lyrics) };
}

function referenceUrl(image: ReferenceImage) {
    return image.storageKey || image.url || (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined);
}

function generationReferenceUrls(context: { referenceImages: ReferenceImage[]; referenceVideos: Array<{ storageKey?: string; url?: string }>; referenceAudios?: Array<{ storageKey?: string; url?: string }> }) {
    return [
        ...context.referenceImages.map(referenceUrl).filter((url): url is string => Boolean(url)),
        ...context.referenceVideos.map((video) => video.storageKey || video.url).filter((url): url is string => Boolean(url)),
        ...(context.referenceAudios || []).map((audio) => audio.storageKey || audio.url).filter((url): url is string => Boolean(url)),
    ];
}

async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio || node.type === CanvasNodeType.Music) && node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveMediaUrl(node.metadata.storageKey, content) } };
            if (node.type !== CanvasNodeType.Image) return node;
            if (node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveImageUrl(node.metadata.storageKey, content) } };
            if (!content) return node;
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

function getGenerationCount(count: string, max = 15) {
    return Math.max(1, Math.min(max, Math.floor(Math.abs(Number(count)) || 1)));
}

function applyNodeConfigPatch(node: CanvasNodeData, patch: Partial<CanvasNodeData["metadata"]>) {
    const safePatch = patch || {};
    const next = { ...node, metadata: { ...node.metadata, ...safePatch } };
    if (node.type === CanvasNodeType.Config && (safePatch.generationMode !== undefined || safePatch.musicInstrumental !== undefined)) {
        const musicMode = next.metadata?.generationMode === "music";
        const width = NODE_DEFAULT_SIZE[CanvasNodeType.Config].width;
        const height = musicMode ? (next.metadata?.musicInstrumental ? 460 : 580) : NODE_DEFAULT_SIZE[CanvasNodeType.Config].height;
        return { ...next, width, height, position: { x: node.position.x + node.width / 2 - width / 2, y: node.position.y + node.height / 2 - height / 2 } };
    }
    const spec = node.type === CanvasNodeType.Video ? NODE_DEFAULT_SIZE[CanvasNodeType.Video] : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const size = typeof safePatch.size === "string" && !node.metadata?.content ? nodeSizeFromRatio(safePatch.size, spec.width, spec.height) : null;
    return size && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) ? { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : next;
}

function findGroupDropTarget(movedIds: Set<string>, nodes: CanvasNodeData[]) {
    if (nodes.some((node) => movedIds.has(node.id) && isCanvasGroupNode(node))) return null;
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && !isCanvasGroupNode(node));
    if (!movingNodes.length) return null;
    return (
        [...nodes]
            .reverse()
            .find((group) => {
                if (!isCanvasGroupNode(group) || movedIds.has(group.id) || isCanvasNodeLocked(group, nodes)) return false;
                return movingNodes.some((node) => {
                    const centerX = node.position.x + node.width / 2;
                    const centerY = node.position.y + node.height / 2;
                    return centerX >= group.position.x && centerX <= group.position.x + group.width && centerY >= group.position.y && centerY <= group.position.y + group.height;
                });
            }) || null
    );
}

function snapNodesIntoGroup(movedIds: Set<string>, nodes: CanvasNodeData[], group: CanvasNodeData) {
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && !isCanvasGroupNode(node));
    if (!movingNodes.length) return nodes;
    const pad = 24;
    const bounds = nodeBounds(movingNodes);
    const left = group.position.x + pad;
    const top = group.position.y + pad;
    const right = group.position.x + group.width - pad;
    const bottom = group.position.y + group.height - pad;
    const dx = bounds.right - bounds.left > right - left ? left - bounds.left : bounds.left < left ? left - bounds.left : bounds.right > right ? right - bounds.right : 0;
    const dy = bounds.bottom - bounds.top > bottom - top ? top - bounds.top : bounds.top < top ? top - bounds.top : bounds.bottom > bottom ? bottom - bounds.bottom : 0;
    return nodes.map((node) => {
        if (!movedIds.has(node.id) || isCanvasGroupNode(node)) return node;
        return { ...node, position: { x: node.position.x + dx, y: node.position.y + dy }, metadata: { ...node.metadata, groupId: group.id } };
    });
}

function nodeBounds(nodes: CanvasNodeData[]) {
    return nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
}

function createCanvasGroup(selectedIds: Set<string>, nodes: CanvasNodeData[], createId: () => string) {
    const selected = nodes.filter((node) => selectedIds.has(node.id) && !isCanvasGroupNode(node));
    if (!selected.length) return { nodes, groupId: null as string | null };

    const groupId = createId();
    const bounds = nodeBounds(selected);
    const padding = 48;
    const header = 24;
    const selectedIdSet = new Set(selected.map((node) => node.id));
    const group: CanvasNodeData = {
        id: groupId,
        type: CanvasNodeType.Group,
        title: "组",
        position: { x: bounds.left - padding, y: bounds.top - padding - header },
        width: bounds.right - bounds.left + padding * 2,
        height: bounds.bottom - bounds.top + padding * 2 + header,
        metadata: { status: "idle" },
    };

    return {
        groupId,
        nodes: [
            ...nodes.map((node) => selectedIdSet.has(node.id) ? { ...node, metadata: { ...node.metadata, groupId } } : node),
            group,
        ],
    };
}

function findContainingGroupId(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const centerX = node.position.x + node.width / 2;
    const centerY = node.position.y + node.height / 2;
    return (
        [...nodes]
            .reverse()
            .find((group) => isCanvasGroupNode(group) && group.id !== node.id && !isCanvasNodeLocked(group, nodes) && centerX >= group.position.x && centerX <= group.position.x + group.width && centerY >= group.position.y && centerY <= group.position.y + group.height)?.id || undefined
    );
}

function getConnectionTargetAnchor(node: CanvasNodeData, current: ConnectionHandle) {
    return {
        x: current.handleType === "source" ? node.position.x : node.position.x + node.width,
        y: node.position.y + node.height / 2,
    };
}

function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target", firstPort?: CanvasConnectionPort) {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Group || second.type === CanvasNodeType.Group) return null;
    if (first.type === CanvasNodeType.WorkflowGroup && second.type === CanvasNodeType.WorkflowGroup) {
        return firstHandleType === "source" && firstPort === "workflow-output"
            ? { fromNodeId: first.id, toNodeId: second.id, fromPort: "workflow-output" as const, toPort: "workflow-input" as const }
            : null;
    }
    if (first.type === CanvasNodeType.WorkflowGroup || second.type === CanvasNodeType.WorkflowGroup) {
        const group = first.type === CanvasNodeType.WorkflowGroup ? first : second;
        const other = group === first ? second : first;
        if (other.type === CanvasNodeType.Group) return null;
        const otherInside = other.metadata?.groupId === group.id;
        if (group === first) {
            if (firstPort === "workflow-input" && firstHandleType === "target" && otherInside) return { fromNodeId: group.id, toNodeId: other.id, fromPort: "workflow-input" as const };
            if (firstPort === "workflow-output" && firstHandleType === "source" && !otherInside) return { fromNodeId: group.id, toNodeId: other.id, fromPort: "workflow-output" as const };
            return null;
        }
        if (firstHandleType === "source") {
            return otherInside
                ? { fromNodeId: other.id, toNodeId: group.id, toPort: "workflow-output" as const }
                : { fromNodeId: other.id, toNodeId: group.id, toPort: "workflow-input" as const };
        }
        return null;
    }
    if (!canConnectCanvasNodes(first.type, second.type)) return null;
    if (first.type === CanvasNodeType.Split || second.type === CanvasNodeType.Split) {
        const split = first.type === CanvasNodeType.Split ? first : second;
        const input = split === first ? second : first;
        const isInput = input.type === CanvasNodeType.Text || input.type === CanvasNodeType.Image || input.type === CanvasNodeType.Video || input.type === CanvasNodeType.Audio || input.type === CanvasNodeType.Music;
        if (!isInput || (split === first && firstHandleType !== "target")) return null;
        return { fromNodeId: input.id, toNodeId: split.id };
    }
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    return { fromNodeId: first.id, toNodeId: second.id };
}

function buildWorkflowRunContext(template: CanvasNodeData, groupId: string, batch: CanvasNodeData | null, results: Map<string, string[]>, baseNodes: CanvasNodeData[], baseConnections: CanvasConnection[], currentNodes: CanvasNodeData[]) {
    const referenceMap = new Map<string, string>();
    results.forEach((ids, templateId) => {
        if (templateId !== WORKFLOW_INPUT_ID && ids[0]) referenceMap.set(templateId, ids[0]);
    });
    baseNodes.forEach((node) => {
        const outputId = node.metadata?.workflowResultOf ? results.get(node.metadata.workflowResultOf)?.[0] : undefined;
        if (outputId) referenceMap.set(node.id, outputId);
    });
    const batchReferenceIds = batch ? workflowBatchReferenceIds(batch, currentNodes, baseConnections) : [];
    if (batchReferenceIds[0]) referenceMap.set(groupId, batchReferenceIds[0]);

    const remapId = (id: string | undefined) => id ? referenceMap.get(id) || id : undefined;
    const remapPrompt = (value: string | undefined) => {
        const expanded = batchReferenceIds.length && value?.includes(`@[node:${groupId}]`)
            ? value.replaceAll(`@[node:${groupId}]`, batchReferenceIds.map((id) => `@[node:${id}]`).join(" "))
            : value;
        return remapWorkflowPrompt(expanded, referenceMap);
    };
    const mappedBatchInput = Boolean(batch && baseConnections.some((connection) => connection.fromNodeId === groupId && connection.toNodeId === template.id && connection.fromPort === "workflow-input"));
    const hasExplicitWorkflowInput = Boolean(template.metadata?.composerContent?.includes(`@[node:${groupId}]`));
    const remappedComposer = remapPrompt(template.metadata?.composerContent);
    const composerContent = mappedBatchInput && !hasExplicitWorkflowInput && remappedComposer?.trim() && (template.type === CanvasNodeType.Config || template.type === CanvasNodeType.Split)
        ? `${remappedComposer}\n${batchReferenceIds.map((id) => `@[node:${id}]`).join(" ")}`
        : remappedComposer;
    const metadata: CanvasNodeMetadata = {
        ...template.metadata,
        composerContent,
        prompt: remapPrompt(template.metadata?.prompt),
        musicDescription: remapPrompt(template.metadata?.musicDescription),
        musicLyrics: remapPrompt(template.metadata?.musicLyrics),
        videoFirstFrameNodeId: remapId(template.metadata?.videoFirstFrameNodeId),
        videoLastFrameNodeId: remapId(template.metadata?.videoLastFrameNodeId),
        videoEditSourceNodeId: remapId(template.metadata?.videoEditSourceNodeId),
        videoReferenceImageNodeIds: template.metadata?.videoReferenceImageNodeIds?.map((id) => remapId(id) || id),
    };
    const runtimeTemplate = { ...template, metadata };
    const nodes = currentNodes.some((node) => node.id === template.id)
        ? currentNodes.map((node) => node.id === template.id ? runtimeTemplate : node)
        : [...currentNodes, runtimeTemplate];
    if (batch && !nodes.some((node) => node.id === batch.id)) nodes.push(batch);

    const connections = baseConnections.flatMap((connection): CanvasConnection[] => {
        if (connection.toNodeId === groupId) return [];
        if (connection.fromNodeId === groupId) {
            if (connection.fromPort !== "workflow-input" || !batch) return [];
            return [{ ...connection, fromNodeId: batch.id, fromPort: batch.type === CanvasNodeType.WorkflowGroup ? "workflow-output" : undefined }];
        }
        const fromNodeId = referenceMap.get(connection.fromNodeId) || connection.fromNodeId;
        return [{ ...connection, fromNodeId }];
    });
    return {
        nodes,
        connections,
        prompt: metadata.generationMode === "music" ? metadata.musicDescription || "" : metadata.composerContent ?? metadata.prompt ?? "",
    };
}

function workflowBatchReferenceIds(batch: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    if (batch.type !== CanvasNodeType.WorkflowGroup) return [batch.id];
    const attachedOutputs = connections
        .filter((connection) => connection.fromNodeId === batch.id && connection.fromPort === "workflow-output")
        .map((connection) => nodes.find((node) => node.id === connection.toNodeId))
        .filter((node): node is CanvasNodeData => Boolean(node?.metadata?.workflowResultOf && node.metadata.workflowRunId === batch.metadata?.workflowRunId && node.metadata.content));
    if (attachedOutputs.length) return attachedOutputs.map((node) => node.id);
    return connections
        .filter((connection) => connection.toNodeId === batch.id && connection.toPort === "workflow-output")
        .flatMap((connection) => {
            const mapped = nodes.find((node) => node.id === connection.fromNodeId);
            if (!mapped) return [];
            if (mapped.metadata?.content && !mapped.metadata.workflowResultOf) return [mapped.id];
            const producerId = mapped.metadata?.workflowResultOf || mapped.id;
            const generated = nodes.filter((node) => node.metadata?.groupId === batch.id && node.metadata.workflowRunId === batch.metadata?.workflowRunId && node.metadata.workflowResultOf === producerId && node.metadata.content);
            return generated.some((node) => node.metadata?.batchRootId) ? generated.filter((node) => !node.metadata?.isBatchRoot).map((node) => node.id) : generated.map((node) => node.id);
        });
}

function getInputSummary(inputs: NodeGenerationInput[]) {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}

function resolveVideoGenerationContext(config: AiConfig, node: CanvasNodeData | undefined, context: NodeGenerationContext, inputs: NodeGenerationInput[]) {
    const imagesByNodeId = new Map(inputs.flatMap((input) => input.image ? [[input.nodeId, input.image] as const] : []));
    const providerId = providerIdForModel(config.model || config.videoModel);
    const isLtx = providerId === "ltx";
    const isMiniMaxH3 = providerId === "minimax_h3";
    const multimodalContext = isLtx ? selectExplicitMediaMentions(context) : context;
    const selectedFirstFrameId = node?.metadata?.videoFirstFrameNodeId;
    const selectedLastFrameId = node?.metadata?.videoLastFrameNodeId;
    const videoInputMode = isLtx
        ? resolveAutomaticLtxVideoInputMode({
              firstFrameNodeId: selectedFirstFrameId,
              lastFrameNodeId: selectedLastFrameId,
              referenceImageNodeIds: multimodalContext.referenceImages.map((image) => image.id),
              referenceVideoCount: multimodalContext.referenceVideos.length,
              referenceAudioCount: multimodalContext.referenceAudios.length,
          })
        : config.videoInputMode;
    if (videoInputMode === "multimodal") {
        if (isMiniMaxH3) {
            const sourcePrompt = node?.type === CanvasNodeType.Config ? node.metadata?.composerContent ?? context.prompt : context.prompt;
            const inline = resolveMiniMaxH3InlineReferences(
                sourcePrompt,
                inputs.map((input) => ({
                    nodeId: input.nodeId,
                    type: input.type,
                    label: input.label || generationInputLabel(input, inputs),
                    text: input.text,
                })),
            );
            if ("error" in inline) return { context, videoInputMode, error: inline.error };
            const audiosByNodeId = new Map(inputs.flatMap((input) => input.audio ? [[input.nodeId, input.audio] as const] : []));
            const referenceImages = inline.imageNodeIds.map((nodeId) => imagesByNodeId.get(nodeId)).filter((image): image is ReferenceImage => Boolean(image));
            const referenceAudios = inline.audioNodeIds.map((nodeId) => audiosByNodeId.get(nodeId)).filter((audio): audio is ReferenceAudio => Boolean(audio));
            if (referenceImages.length !== inline.imageNodeIds.length || referenceAudios.length !== inline.audioNodeIds.length) {
                return { context, videoInputMode, error: "MiniMax H3 引用素材尚未上传完成，请稍后重试" };
            }
            return {
                context: {
                    ...context,
                    prompt: inline.prompt,
                    referenceImages,
                    referenceVideos: [],
                    referenceAudios,
                    imageCount: referenceImages.length,
                    videoCount: 0,
                    audioCount: referenceAudios.length,
                },
                videoInputMode,
            };
        }
        if (!isLtx || (!selectedFirstFrameId && !selectedLastFrameId)) return { context: multimodalContext, videoInputMode };
        const firstFrame = selectedFirstFrameId ? imagesByNodeId.get(selectedFirstFrameId) : undefined;
        if (selectedFirstFrameId && !firstFrame) return { context: multimodalContext, videoInputMode, error: "已选择的首帧图片不存在，请重新选择" };
        const lastFrame = selectedLastFrameId ? imagesByNodeId.get(selectedLastFrameId) : undefined;
        if (selectedLastFrameId && !lastFrame) return { context: multimodalContext, videoInputMode, error: "已选择的尾帧图片不存在，请重新选择" };
        return {
            context: multimodalContext,
            videoInputMode,
            ltxFrames: {
                ...(firstFrame ? { firstFrame } : {}),
                ...(lastFrame ? { lastFrame } : {}),
            },
        };
    }
    if (videoInputMode === "text") return { context: { ...context, referenceImages: [], referenceVideos: [], referenceAudios: [], imageCount: 0, videoCount: 0, audioCount: 0 }, videoInputMode };
    if (videoInputMode === "referenceImages" || videoInputMode === "videoEdit") {
        const sourcePrompt = node?.type === CanvasNodeType.Config ? node.metadata?.composerContent ?? context.prompt : context.prompt;
        const inline = resolveHappyHorseInlineReferences(
            sourcePrompt,
            inputs.map((input) => ({
                nodeId: input.nodeId,
                type: input.type,
                label: input.label || generationInputLabel(input, inputs),
                text: input.text,
            })),
            videoInputMode === "videoEdit" ? 5 : 9,
        );
        if ("error" in inline) return { context, videoInputMode, error: inline.error };
        const selection = resolveHappyHorseVideoSelection(videoInputMode, node?.metadata || {}, inputs, inline.imageNodeIds);
        if ("error" in selection) return { context, videoInputMode, error: selection.error };
        const referenceImages = (selection.imageNodeIds || []).map((nodeId) => imagesByNodeId.get(nodeId)).filter((image): image is ReferenceImage => Boolean(image));
        const videosByNodeId = new Map(inputs.flatMap((input) => input.video ? [[input.nodeId, input.video] as const] : []));
        const referenceVideos = selection.videoNodeId ? [videosByNodeId.get(selection.videoNodeId)].filter((video): video is ReferenceVideo => Boolean(video)) : [];
        return { context: { ...context, prompt: inline.prompt, referenceImages, referenceVideos, referenceAudios: [], imageCount: referenceImages.length, videoCount: referenceVideos.length, audioCount: 0 }, videoInputMode };
    }
    const firstFrame = selectedFirstFrameId ? imagesByNodeId.get(selectedFirstFrameId) : undefined;
    if (!firstFrame) return { context, videoInputMode, error: "请先选择一张已连接的首帧图片" };
    const lastFrame = videoInputMode === "firstLastFrame" && selectedLastFrameId ? imagesByNodeId.get(selectedLastFrameId) : undefined;
    if (selectedLastFrameId && !lastFrame) return { context, videoInputMode, error: "已选择的尾帧图片不存在，请重新选择" };
    const referenceImages = videoInputMode === "firstLastFrame" ? resolveVideoFramePair(firstFrame, lastFrame) : [firstFrame];
    return { context: { ...context, referenceImages, referenceVideos: [], referenceAudios: [], imageCount: referenceImages.length, videoCount: 0, audioCount: 0 }, videoInputMode };
}

function generationInputLabel(input: NodeGenerationInput, inputs: NodeGenerationInput[]) {
    const index = inputs.filter((item) => item.type === input.type).findIndex((item) => item.nodeId === input.nodeId) + 1;
    if (input.type === "image") return `图片${index}`;
    if (input.type === "video") return `视频${index}`;
    if (input.type === "audio") return `音频${index}`;
    return `文本${index}`;
}

async function splitInputAssetIds(inputs: NodeGenerationInput[]) {
    return Promise.all(inputs.flatMap((input) => {
        if (input.type === "image" && input.image) return [input.image.storageKey ? Promise.resolve(input.image.storageKey) : uploadImage(input.image.dataUrl || input.image.url || "").then((file) => file.storageKey)];
        if (input.type === "video" && input.video) return [input.video.storageKey ? Promise.resolve(input.video.storageKey) : uploadMediaFile(input.video.url, "video").then((file) => file.storageKey)];
        if (input.type === "audio" && input.audio) return [input.audio.storageKey ? Promise.resolve(input.audio.storageKey) : uploadMediaFile(input.audio.url, "audio").then((file) => file.storageKey)];
        return [];
    }));
}

function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode): AiConfig {
    const currentModel = node?.metadata?.model;
    const nodeModel = mode === "audio"
        ? providerCapabilityForModel(currentModel || "") === "speech" ? currentModel : ""
        : mode === "music"
          ? providerCapabilityForModel(currentModel || "") === "music" ? currentModel : ""
        : currentModel && modelMatchesCapability(currentModel, mode) ? currentModel : "";
    const defaultModel = mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : mode === "audio" ? audioModelForKind(config, "speech") : mode === "music" ? audioModelForKind(config, "music") : config.textModel;
    const model = nodeModel || defaultModel || (mode === "audio" ? audioModelForKind(defaultConfig, "speech") : mode === "music" ? audioModelForKind(defaultConfig, "music") : config.model || defaultConfig.model);
    const generationConfig = {
        ...config,
        model,
        imagePromptOptimize: node?.metadata?.optimizePrompt == null ? config.imagePromptOptimize : String(node.metadata.optimizePrompt),
        imageWebSearch: node?.metadata?.imageWebSearch == null ? config.imageWebSearch : String(node.metadata.imageWebSearch),
        imageSearch: node?.metadata?.imageSearch == null ? config.imageSearch : String(node.metadata.imageSearch),
        size: mode === "image" ? normalizeImageSizeForModel(model, node?.metadata?.size || config.size || defaultConfig.size) : node?.metadata?.size || config.size || defaultConfig.size,
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaultConfig.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaultConfig.videoWatermark,
        videoReturnLastFrame: node?.metadata?.returnLastFrame || config.videoReturnLastFrame || defaultConfig.videoReturnLastFrame,
        videoPromptEnhance: node?.metadata?.videoPromptEnhance || config.videoPromptEnhance || defaultConfig.videoPromptEnhance,
        videoStage1Review: node?.metadata?.videoStage1Review || config.videoStage1Review || defaultConfig.videoStage1Review,
        videoAudioSetting: node?.metadata?.videoAudioSetting || config.videoAudioSetting || defaultConfig.videoAudioSetting,
        videoInputMode: mode === "video" ? normalizeVideoInputModeForModel(model, node?.metadata?.videoInputMode || config.videoInputMode) : config.videoInputMode,
        videoReferenceSizePolicy: node?.metadata?.videoReferenceSizePolicy || config.videoReferenceSizePolicy || "match",
        audioVoice: node?.metadata?.audioVoice || config.audioVoice || defaultConfig.audioVoice,
        audioFormat: node?.metadata?.audioFormat || config.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node?.metadata?.audioSpeed || config.audioSpeed || defaultConfig.audioSpeed,
        audioVolume: node?.metadata?.audioVolume || config.audioVolume || defaultConfig.audioVolume,
        audioPitch: node?.metadata?.audioPitch || config.audioPitch || defaultConfig.audioPitch,
        audioInstructions: node?.metadata?.audioInstructions || config.audioInstructions || defaultConfig.audioInstructions,
        count: String(node?.metadata?.count || (mode === "image" ? config.canvasImageCount || config.count : config.count) || defaultConfig.count),
        videoCount: String(node?.metadata?.videoCount || config.videoCount || defaultConfig.videoCount),
    };
    return mode === "video" ? bindActiveVideoModel(generationConfig, model) : generationConfig;
}

function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) => {
        if (node.metadata?.remoteOperationActive) return node;
        if (node.metadata?.status === "loading" && !node.metadata.generationJobId) return { ...node, metadata: { ...node.metadata, status: "error" as const, workflowState: node.metadata.workflowState ? "stopped" as const : undefined, errorDetails: "页面刷新后生成已中断，请重新生成。", reasoningText: undefined, reasoningState: undefined } };
        if (node.metadata?.status === "loading" && node.metadata.generationJobId && (node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Split)) return { ...node, metadata: { ...node.metadata, reasoningState: supportsReasoningModel(node.metadata.model || "") ? "streaming" as const : node.metadata.reasoningState } };
        if (node.metadata?.workflowState === "running" || node.metadata?.workflowState === "ready" || node.metadata?.workflowState === "waiting") return { ...node, metadata: { ...node.metadata, workflowState: "stopped" as const } };
        return node;
    });
}

function supportsReasoningModel(model: string) {
    return ["bigmodel", "gemini"].includes(providerIdForModel(model));
}

function isGenerationCanceled(error: unknown) {
    return error instanceof Error && (error.message === "请求已取消" || error.name === "AbortError");
}

function findRetrySourceNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Config) return node;
        connections.filter((connection) => connection.toNodeId === id).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

function sourceNodeReferenceImages(node: CanvasNodeData | null) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
        },
    ];
}

function isAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}

function isHiddenBatchChild(node: CanvasNodeData, nodes: CanvasNodeData[], collapsingBatchIds?: Set<string>) {
    const rootId = node.metadata?.batchRootId;
    if (!rootId) return false;
    const root = nodes.find((item) => item.id === rootId);
    if (root && collapsingBatchIds?.has(rootId)) return false;
    return Boolean(root && !root.metadata?.batchExpanded);
}

function isHiddenBatchConnectionEndpoint(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const rootId = node.metadata?.batchRootId;
    if (!rootId) return false;
    const root = nodes.find((item) => item.id === rootId);
    return Boolean(root && !root.metadata?.batchExpanded);
}

function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? "正面视角" : params.horizontalAngle > 0 ? `向右旋转 ${params.horizontalAngle} 度` : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
    const pitch = params.pitchAngle === 0 ? "水平视角" : params.pitchAngle > 0 ? `俯视 ${params.pitchAngle} 度` : `仰视 ${Math.abs(params.pitchAngle)} 度`;
    return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${params.cameraDistance.toFixed(1)}，${params.wideAngle ? "广角" : "标准"}镜头`;
}

function buildAnglePrompt(params: CanvasImageAngleParams) {
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
