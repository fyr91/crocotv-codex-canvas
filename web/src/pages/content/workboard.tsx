import { App, Button, Empty, Input, Modal, Result, Skeleton, Tag } from "antd";
import { CheckCircle2, Eye, LogOut, PackageCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type SetStateAction } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ConnectionPath } from "@/components/canvas/canvas-connections";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { CrocoCanvas } from "@/components/canvas/crocotv-canvas";
import { CONTENT_NODE_HEIGHT, CONTENT_NODE_WIDTH, contentNodeMinimumHeight, contentNodePath, layoutContentTree } from "@/lib/content-production/content-tree";
import {
    contentBranchNodes,
    contentNodeProducingRun,
    contentWorkboardNodes,
    contentWorkboardShortcut,
    contentWorkboardViewReducer,
    mergeOptimisticContentBranchNode,
    startConfirmedRegeneration,
} from "@/lib/content-production/content-workboard";
import { contentAttemptOrientation } from "@/lib/content-production/content-orientation";
import { contentMediaStage } from "@/lib/content-production/content-media";
import { buildDeliveryManifest } from "@/lib/content-production/content-delivery";
import { summarizeOwnedTopic } from "@/lib/content-production/topic-workspace";
import {
    contentTopicFactorySnapshot,
    createOptimisticTopicFactoryNodes,
    mergeOptimisticTopicFactoryNodes,
    runOptimisticTopicFactoryStart,
    topicFactorySummary,
} from "@/lib/content-production/topic-factory";
import {
    contentStorylineSnapshot,
    createOptimisticStorylineNode,
    mergeOptimisticStorylineNode,
    runOptimisticStorylineStart,
} from "@/lib/content-production/storyline";
import { collapsedStoryboardNodes, contentStoryboardSnapshot } from "@/lib/content-production/storyboard";
import { contentAudioSegmentChildIds, contentAudioSegmentNodeInputs } from "@/lib/content-production/audio-segment-nodes";
import type { AudioSegmentationSubmit } from "@/lib/audio/segmentation";
import { useContentProductionUiStore } from "@/stores/use-content-production-ui-store";
import { useUserStore } from "@/stores/use-user-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";
import type { ContentGenerationRun, ContentNode, ContentNodeReference, ContentNodeType, ContentStage, ContentTopicOrientation } from "@/types/content-production";
import { createContentArtifact, createContentNode, startContentOrchestration } from "@/services/api/content-production";
import { deleteCloudAssets, uploadCloudAsset } from "@/services/api/cloud-assets";
import { runContentMediaGeneration } from "@/services/content-media-runner";
import { runContentTextExploration } from "@/services/content-text-runner";
import { inputModalitiesForModel, modelOptionLabel, providerCapabilityForModel, providerIdForModel, useEffectiveConfig } from "@/stores/use-config-store";
import { ContentNodePanel } from "./components/content-node-panel";
import { ContentModelPromptTuning, contentModelPromptFallbackStage } from "./components/content-model-prompt-tuning";
import type { ContentNodePanelTab } from "./components/content-node-panel-tabs";
import { ContentTreeNode } from "./components/content-tree-node";
import { ContentAssetReferences } from "./components/content-asset-references";
import { ContentClipResults, type ContentClipView } from "./components/content-clip-results";
import { ContentDeliveryModal } from "./components/content-delivery-modal";
import { ContentCompletionModal } from "./components/content-completion-modal";
import { uploadAssetFile } from "@/pages/assets/asset-file";
import { TopicStrip } from "./components/topic-strip";
import { TopicFactoryProgress } from "./components/topic-factory-progress";
import { TopicNodePanel } from "./components/topic-node-panel";
import { StoryboardGenerationModal } from "./components/storyboard-generation-modal";
import {
    useContentNoticeNodesQuery,
    useContentCompletionsQuery,
    useContentProductionRealtime,
    useContentTopicQuery,
    useContentTopicsQuery,
    useContentWorkboardQuery,
    useContentStagePoliciesQuery,
    useCreateContentDeliveryMutation,
    useCreateContentReferenceMutation,
    useDeleteContentReferenceMutation,
    useDeselectContentClipMutation,
    useSelectContentClipMutation,
    useCompleteContentTopicMutation,
    useAbandonContentTopicMutation,
    useMarkContentNodeNoticeSeenMutation,
    useOwnerContentRunsQuery,
    useContentGenerationJobsQuery,
    useRegenerateContentTopicFactoryMutation,
    useStopContentTopicFactoryMutation,
    useOptimizeContentTopicFactoryMutation,
    useStartContentTopicFactoryMutation,
    useStartContentStorylineMutation,
    useStartContentStoryboardMutation,
    useStopContentStoryboardMutation,
    useUpdateContentNodeMutation,
} from "./use-content-production";
import { WorkspacePage } from "@/components/layout/page-shell";
import { useContentNodeNoticeTone } from "./use-content-node-notice-tone";
import type { ContentStoryboardReference } from "@/types/content-production";

const defaultViewport: ViewportTransform = { x: 70, y: 90, k: 0.88 };
const emptyContentNodes: ContentNode[] = [];

export default function ContentWorkboardPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const { topicId = "" } = useParams<{ topicId: string }>();
    const profile = useUserStore((state) => state.profile);
    const config = useEffectiveConfig();
    const topic = useContentTopicQuery(topicId);
    const attemptId = topic.data?.currentAttemptId || "";
    const workboard = useContentWorkboardQuery(attemptId);
    const ownedTopics = useContentTopicsQuery({ ownerId: profile?.id || "" });
    const ownerRuns = useOwnerContentRunsQuery(profile?.id || "");
    const noticeNodes = useContentNoticeNodesQuery(profile?.id || "");
    const completions = useContentCompletionsQuery(topicId);
    const markNoticeSeen = useMarkContentNodeNoticeSeenMutation(attemptId, profile?.id || "");
    const updateNode = useUpdateContentNodeMutation(attemptId);
    const startTopicFactory = useStartContentTopicFactoryMutation(attemptId);
    const regenerateTopicFactory = useRegenerateContentTopicFactoryMutation(attemptId);
    const stopTopicFactory = useStopContentTopicFactoryMutation(attemptId);
    const optimizeTopicFactory = useOptimizeContentTopicFactoryMutation(attemptId);
    const startStoryline = useStartContentStorylineMutation(attemptId);
    const startStoryboard = useStartContentStoryboardMutation(attemptId);
    const stopStoryboard = useStopContentStoryboardMutation(attemptId);
    const policies = useContentStagePoliciesQuery();
    const createReference = useCreateContentReferenceMutation(attemptId);
    const deleteReference = useDeleteContentReferenceMutation(attemptId);
    const selectClip = useSelectContentClipMutation(attemptId);
    const deselectClip = useDeselectContentClipMutation(attemptId);
    const createDelivery = useCreateContentDeliveryMutation(attemptId);
    const completeTopic = useCompleteContentTopicMutation();
    const abandonTopic = useAbandonContentTopicMutation();
    const containerRef = useRef<HTMLDivElement>(null);
    const undoStackRef = useRef<Array<{ rootNodeId: string; nodes: ContentNode[] }>>([]);
    const keyboardActionRunningRef = useRef(false);
    const storedView = useContentProductionUiStore((state) => state.topicViews[topicId]);
    const notificationMode = useContentProductionUiStore((state) => state.notificationMode);
    const setTopicView = useContentProductionUiStore((state) => state.setTopicView);
    const [{ selectedNodeId, viewport }, dispatchView] = useReducer(contentWorkboardViewReducer, {
        selectedNodeId: storedView?.focusedNodeId || null,
        viewport: storedView?.viewport || defaultViewport,
    });
    const selectNode = useCallback((nodeId: string | null) => dispatchView({ type: "select", nodeId }), []);
    const setViewport = useCallback((value: SetStateAction<ViewportTransform>) => dispatchView({ type: "viewport", value }), []);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [deliveryOpen, setDeliveryOpen] = useState(false);
    const [completionOpen, setCompletionOpen] = useState(false);
    const [abandonOpen, setAbandonOpen] = useState(false);
    const [abandonReason, setAbandonReason] = useState("");
    const [uploadingClip, setUploadingClip] = useState(false);
    const [segmentingAudio, setSegmentingAudio] = useState(false);
    const [regeneratingNodeId, setRegeneratingNodeId] = useState<string | null>(null);
    const [stoppingNodeId, setStoppingNodeId] = useState<string | null>(null);
    const [optimizingNodeId, setOptimizingNodeId] = useState<string | null>(null);
    const [storyboardSource, setStoryboardSource] = useState<ContentNode | null>(null);
    const [collapsedStoryboardGroups, setCollapsedStoryboardGroups] = useState<Set<string>>(() => new Set());
    const [optimisticFactory, setOptimisticFactory] = useState<{ attemptId: string; nodes: ContentNode[] } | null>(null);
    const [optimisticBranch, setOptimisticBranch] = useState<{ attemptId: string; node: ContentNode } | null>(null);
    const [viewportSize, setViewportSize] = useState({ width: 1200, height: 720 });
    const [measuredNodeHeights, setMeasuredNodeHeights] = useState<Record<string, number>>({});
    const [panelTab, setPanelTab] = useState<ContentNodePanelTab>("content");
    const [promptDirty, setPromptDirty] = useState(false);
    useContentProductionRealtime(Boolean(profile));

    const serverNodes = workboard.nodes.data || emptyContentNodes;
    const optimisticFactoryNodes = optimisticFactory?.attemptId === attemptId ? optimisticFactory.nodes : emptyContentNodes;
    const optimisticBranchNode = optimisticBranch?.attemptId === attemptId ? optimisticBranch.node : null;
    const factoryNodes = useMemo(
        () => mergeOptimisticTopicFactoryNodes(serverNodes, optimisticFactoryNodes),
        [optimisticFactoryNodes, serverNodes],
    );
    const nodes = useMemo(() => contentStorylineSnapshot(optimisticBranchNode)
        ? mergeOptimisticStorylineNode(factoryNodes, optimisticBranchNode)
        : mergeOptimisticContentBranchNode(factoryNodes, optimisticBranchNode), [factoryNodes, optimisticBranchNode]);
    useContentNodeNoticeTone(serverNodes, notificationMode, workboard.nodes.isFetched);
    const orientation = useMemo(() => contentAttemptOrientation(nodes), [nodes]);
    const orientationReady = Boolean(orientation);
    const selectedNode = nodes.find((node) => node.id === selectedNodeId && !node.hiddenAt) || null;
    const continueAfterDiscardingPrompt = useCallback((action: () => void) => {
        if (!promptDirty) {
            action();
            return;
        }
        modal.confirm({
            title: "放弃未保存的 Prompt 修改？",
            content: "切换节点或页签后，当前编辑内容不会保留。",
            okText: "放弃修改",
            cancelText: "继续编辑",
            onOk: () => {
                setPromptDirty(false);
                action();
            },
        });
    }, [modal, promptDirty]);
    const selectNodeWithPromptGuard = useCallback((nodeId: string | null) => {
        if (nodeId === selectedNodeId) return;
        continueAfterDiscardingPrompt(() => selectNode(nodeId));
    }, [continueAfterDiscardingPrompt, selectNode, selectedNodeId]);
    useEffect(() => {
        if (!selectedNodeId) {
            const root = nodes.find((node) => node.nodeType === "topic" && !node.parentId && !node.hiddenAt);
            if (root) selectNode(root.id);
        }
    }, [nodes, selectNode, selectedNodeId]);
    const openNode = useCallback((node: ContentNode) => {
        const open = () => {
            selectNode(node.id);
            if (node.noticeUnread && !markNoticeSeen.isPending) markNoticeSeen.mutate(node.id);
        };
        if (node.id === selectedNodeId) open();
        else continueAfterDiscardingPrompt(open);
    }, [continueAfterDiscardingPrompt, markNoticeSeen, selectNode, selectedNodeId]);
    useEffect(() => {
        const optimisticSelected = optimisticFactoryNodes.find((node) => node.id === selectedNodeId);
        const optimisticSnapshot = contentTopicFactorySnapshot(optimisticSelected);
        if (!optimisticSelected || !optimisticSnapshot) return;
        const realNode = serverNodes.find((node) => {
            const snapshot = contentTopicFactorySnapshot(node);
            return !node.hiddenAt
                && node.parentId === optimisticSelected.parentId
                && snapshot?.laneNumber === optimisticSnapshot.laneNumber;
        });
        if (realNode) selectNode(realNode.id);
    }, [optimisticFactoryNodes, selectNode, selectedNodeId, serverNodes]);
    useEffect(() => {
        if (!optimisticBranchNode || !selectedNodeId?.startsWith("optimistic-storyline:")) return;
        const requestId = optimisticBranchNode.data.clientRequestId;
        const realNode = serverNodes.find((node) => node.data.clientRequestId === requestId && !node.hiddenAt);
        if (realNode) selectNode(realNode.id);
    }, [optimisticBranchNode, selectNode, selectedNodeId, serverNodes]);
    const topicFactorySnapshots = useMemo(() => nodes.flatMap((node) => {
        if (node.hiddenAt) return [];
        const snapshot = contentTopicFactorySnapshot(node);
        return snapshot ? [snapshot] : [];
    }), [nodes]);
    const serverTopicFactorySnapshots = useMemo(() => serverNodes.flatMap((node) => {
        if (node.hiddenAt) return [];
        const snapshot = contentTopicFactorySnapshot(node);
        return snapshot ? [snapshot] : [];
    }), [serverNodes]);
    const topicSummary = useMemo(() => topicFactorySummary(topicFactorySnapshots), [topicFactorySnapshots]);
    const factoryRunning = topicSummary.generating + topicSummary.reviewing + topicSummary.revising + topicSummary.humanizing > 0;
    const workflowRunIds = useMemo(() => new Set(nodes.flatMap((node) => {
        const snapshot = contentTopicFactorySnapshot(node) || contentStorylineSnapshot(node) || contentStoryboardSnapshot(node);
        return snapshot ? [snapshot.runId] : [];
    })), [nodes]);
    const workflowRuns = useMemo(
        () => (workboard.runs.data || []).filter((run) => workflowRunIds.has(run.id)),
        [workflowRunIds, workboard.runs.data],
    );
    const workflowJobIds = useMemo(
        () => workflowRuns.flatMap((run) => run.generationJobIds),
        [workflowRuns],
    );
    const generationJobs = useContentGenerationJobsQuery(attemptId, workflowJobIds);
    const jobsByRun = useMemo(() => {
        const jobsById = new Map((generationJobs.data || []).map((job) => [job.id, job]));
        return new Map(workflowRuns.map((run) => [run.id, run.generationJobIds.flatMap((id) => jobsById.get(id) ? [jobsById.get(id)!] : [])]));
    }, [workflowRuns, generationJobs.data]);
    const selectedFactory = contentTopicFactorySnapshot(selectedNode);
    const selectedStoryline = contentStorylineSnapshot(selectedNode);
    const selectedStoryboard = contentStoryboardSnapshot(selectedNode);
    const selectedWorkflow = selectedFactory || selectedStoryline || selectedStoryboard;
    const selectedWorkflowJobs = selectedWorkflow ? jobsByRun.get(selectedWorkflow.runId) || [] : [];
    const producingRun = useMemo(() => contentNodeProducingRun(selectedNode, workboard.runs.data || []), [selectedNode, workboard.runs.data]);
    const tuningEnabled = profile?.role === "superuser";
    const changePanelTab = useCallback((next: ContentNodePanelTab) => {
        if (next === panelTab) return;
        continueAfterDiscardingPrompt(() => setPanelTab(next));
    }, [continueAfterDiscardingPrompt, panelTab]);
    useEffect(() => {
        if (!tuningEnabled && panelTab !== "content") setPanelTab("content");
    }, [panelTab, tuningEnabled]);
    const selectedPath = useMemo(
        () => selectedNode ? contentNodePath(nodes, selectedNode.id).map((node) => node.title) : [],
        [nodes, selectedNode],
    );
    const visibleNodes = useMemo(
        () => collapsedStoryboardNodes(contentWorkboardNodes(nodes, null, "global"), collapsedStoryboardGroups),
        [collapsedStoryboardGroups, nodes],
    );
    const nodeHeights = useMemo(
        () => Object.fromEntries(visibleNodes.map((node) => [
            node.id,
            Math.max(contentNodeMinimumHeight(optimizingNodeId === node.id), measuredNodeHeights[node.id] || 0),
        ])),
        [measuredNodeHeights, optimizingNodeId, visibleNodes],
    );
    const handleNodeHeightChange = useCallback((nodeId: string, height: number) => {
        setMeasuredNodeHeights((current) => current[nodeId] === height ? current : { ...current, [nodeId]: height });
    }, []);
    const layout = useMemo(() => {
        if (!visibleNodes.length) return {};
        try {
            return layoutContentTree(visibleNodes, nodeHeights);
        } catch {
            return {};
        }
    }, [nodeHeights, visibleNodes]);
    const canvasNodes = useMemo(() => visibleNodes.flatMap((node) => layout[node.id] ? [toCanvasNode(node, layout[node.id], nodeHeights[node.id])] : []), [layout, nodeHeights, visibleNodes]);
    const nodeById = useMemo(() => new Map(canvasNodes.map((node) => [node.id, node])), [canvasNodes]);
    const connections = useMemo<CanvasConnection[]>(() => visibleNodes.flatMap((node) => node.parentId && nodeById.has(node.parentId)
        ? [{ id: `${node.parentId}:${node.id}`, fromNodeId: node.parentId, toNodeId: node.id }]
        : []), [nodeById, visibleNodes]);
    const editable = Boolean(profile?.id && topic.data?.ownerId === profile.id);
    const summaries = useMemo(
        () => new Map((ownedTopics.data || []).map((item) => [item.id, summarizeOwnedTopic(item.id, ownerRuns.data || [], noticeNodes.data || [])])),
        [noticeNodes.data, ownedTopics.data, ownerRuns.data],
    );
    const mediaModelOptions = useMemo(() => {
        if (!selectedNode) return [];
        const panelType = selectedNode.nodeType;
        const candidates = panelType === "video"
            ? config.videoModels.filter((model) => ["ltx", "minimax_h3"].includes(providerIdForModel(model) || ""))
            : panelType === "image" || panelType === "storyboard_prompt"
                ? config.imageModels
                : panelType === "tts"
                    ? config.audioModels.filter((model) => providerCapabilityForModel(model) === "speech")
                    : panelType === "music"
                        ? config.audioModels.filter((model) => providerCapabilityForModel(model) === "music")
                        : config.textModels;
        return candidates.map((model) => ({ value: model, label: modelOptionLabel(config, model) }));
    }, [config, selectedNode]);
    const storyboardAllowedKinds = useMemo<ContentStoryboardReference["kind"][]>(() => {
        const modelId = policies.data?.find((item) => item.stage === "shot_breakdown")?.producerModelId;
        if (!modelId) return ["text"];
        const supported = inputModalitiesForModel(modelId);
        return (["text", "image", "video", "audio"] as const).filter((kind) => supported.includes(kind));
    }, [policies.data]);
    const currentShot = useMemo(() => selectedNode ? [...contentNodePath(nodes, selectedNode.id)].reverse().find((node) => node.nodeType === "shot") || selectedNode : null, [nodes, selectedNode]);
    const clipViews = useMemo<ContentClipView[]>(() => {
        if (!currentShot) return [];
        const nodeMap = new Map(nodes.map((node) => [node.id, node]));
        const selectedIds = new Set((workboard.selections.data || []).filter((selection) => selection.shotNodeId === currentShot.id).map((selection) => selection.artifactId));
        return (workboard.artifacts.data || []).filter((artifact) => {
            if (artifact.kind !== "video" || artifact.metadata.rejected === true) return false;
            const artifactNode = nodeMap.get(artifact.nodeId);
            if (!artifactNode) return false;
            return contentNodePath(nodes, artifactNode.id).some((node) => node.id === currentShot.id);
        }).map((artifact) => {
            const mediaNode = nodeMap.get(artifact.nodeId);
            return {
                artifact,
                title: mediaNode?.title || `Clip ${artifact.outputIndex == null ? "" : artifact.outputIndex + 1}`,
                url: String(mediaNode?.data.url || ""),
                selected: selectedIds.has(artifact.id),
            };
        }).filter((clip) => clip.url);
    }, [currentShot, nodes, workboard.artifacts.data, workboard.selections.data]);
    const deliveryManifest = useMemo(() => {
        if (!topic.data || !profile) return null;
        const artifactById = new Map((workboard.artifacts.data || []).map((artifact) => [artifact.id, artifact]));
        const activeNodes = nodes.filter((node) => !node.hiddenAt);
        const nodeById = new Map(activeNodes.map((node) => [node.id, node]));
        const shotNodes = activeNodes.filter((node) => node.nodeType === "shot").sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
        const shotNumber = new Map(shotNodes.map((node, index) => [node.id, index + 1]));
        return buildDeliveryManifest({
            topic: { id: topic.data.id, title: topic.data.title },
            owner: { id: profile.id, name: profile.display_name },
            createdAt: new Date().toISOString(),
            clips: (workboard.selections.data || []).flatMap((selection) => {
                const artifact = artifactById.get(selection.artifactId);
                const shot = nodeById.get(selection.shotNodeId);
                if (!artifact || !shot) return [];
                return [{
                    artifactId: artifact.id,
                    assetId: typeof artifact.metadata.enhancedAssetId === "string" ? artifact.metadata.enhancedAssetId : artifact.assetId,
                    shotId: shot.id,
                    shotNumber: shotNumber.get(shot.id) || shot.sortOrder + 1,
                    shotTitle: shot.title,
                    source: artifact.source,
                    mimeType: String(artifact.metadata.mimeType || "video/mp4"),
                    selectedAt: selection.selectedAt,
                }];
            }),
        });
    }, [nodes, profile, topic.data, workboard.artifacts.data, workboard.selections.data]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const update = () => setViewportSize({ width: element.clientWidth, height: element.clientHeight });
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setTopicView(topicId, { focusedNodeId: selectedNodeId, viewport });
    }, [selectedNodeId, setTopicView, topicId, viewport]);

    const resetViewport = useCallback(() => {
        if (!canvasNodes.length) return setViewport(defaultViewport);
        const minX = Math.min(...canvasNodes.map((node) => node.position.x));
        const minY = Math.min(...canvasNodes.map((node) => node.position.y));
        const maxX = Math.max(...canvasNodes.map((node) => node.position.x + node.width));
        const maxY = Math.max(...canvasNodes.map((node) => node.position.y + node.height));
        const width = Math.max(maxX - minX, CONTENT_NODE_WIDTH);
        const height = Math.max(maxY - minY, CONTENT_NODE_HEIGHT);
        const k = Math.min(1, Math.max(0.2, Math.min((viewportSize.width - 120) / width, (viewportSize.height - 140) / height)));
        setViewport({ x: (viewportSize.width - width * k) / 2 - minX * k, y: (viewportSize.height - height * k) / 2 - minY * k, k });
    }, [canvasNodes, viewportSize.height, viewportSize.width]);

    const runStorylineOperation = async (
        operation: "generate" | "optimize" | "rebuild",
        source: ContentNode,
        direction?: string,
        prepare: () => Promise<ContentNode> = async () => source,
    ) => {
        if (!profile?.id || !editable || !topic.data || !orientation) {
            throw new Error("当前选题上下文尚未准备完成");
        }
        if (operation === "generate" && !contentTopicFactorySnapshot(source)?.candidate) {
            throw new Error("请先选择一条已生成的选题分支");
        }
        if (operation !== "generate" && !contentStorylineSnapshot(source)?.candidate) {
            throw new Error("当前故事线还没有可处理的内容");
        }
        const requestId = crypto.randomUUID();
        const optimisticNode = createOptimisticStorylineNode({
            operation,
            sourceNode: source,
            requestId,
            createdAt: new Date().toISOString(),
            direction,
        });
        if (operation === "rebuild") setRegeneratingNodeId(source.id);
        try {
            const result = await runOptimisticStorylineStart({
                node: optimisticNode,
                publish: (node) => {
                    setOptimisticBranch({ attemptId, node });
                    selectNode(node.id);
                },
                prepare,
                start: (preparedSource) => startStoryline.mutateAsync({
                    operation,
                    topicId,
                    attemptId,
                    sourceNodeId: preparedSource.id,
                    clientRequestId: requestId,
                    ...(operation === "optimize" ? { direction: direction?.trim() } : {}),
                    input: {
                        topic: {
                            id: topic.data.id,
                            title: topic.data.title,
                            originalTopic: topic.data.originalTopic,
                            creationNotes: topic.data.creationNotes,
                            tags: topic.data.tags,
                            backgroundSnapshot: topic.data.backgroundSnapshot,
                        },
                        orientation,
                        references: referencesForNode(preparedSource, workboard.references.data || [], profile.id),
                    },
                }),
            });
            selectNode(result.node.id);
            await Promise.all([workboard.nodes.refetch(), workboard.runs.refetch()]);
            setOptimisticBranch(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "故事线任务启动失败");
        } finally {
            if (operation === "rebuild") setRegeneratingNodeId(null);
        }
    };

    const runStoryboardOperation = async (
        operation: "generate" | "regenerate" | "optimize" | "optimize_node",
        source: ContentNode,
        direction?: string,
        setup?: { references: ContentStoryboardReference[]; additionalInfo?: string },
    ) => {
        if (!profile?.id || !editable || !topic.data || !orientation) throw new Error("当前选题上下文尚未准备完成");
        const storylineNode = source.nodeType === "storyline"
            ? source
            : [...contentNodePath(nodes, source.id)].reverse().find((node) => node.nodeType === "storyline");
        const storyline = contentStorylineSnapshot(storylineNode)?.candidate;
        if (!storyline) throw new Error("当前分支缺少已完成故事线");
        const priorRunId = contentStoryboardSnapshot(source)?.runId;
        const priorInput = (workboard.runs.data || []).find((run) => run.id === priorRunId)?.inputSnapshot || {};
        const references = setup?.references || (Array.isArray(priorInput.references) ? priorInput.references as ContentStoryboardReference[] : []);
        const additionalInfo = setup?.additionalInfo || (typeof priorInput.additionalInfo === "string" ? priorInput.additionalInfo : undefined);
        if (operation === "regenerate") setRegeneratingNodeId(source.id);
        try {
            const result = await startStoryboard.mutateAsync({
                operation,
                topicId,
                attemptId,
                sourceNodeId: source.id,
                clientRequestId: crypto.randomUUID(),
                ...(direction?.trim() ? { direction: direction.trim() } : {}),
                input: {
                    topic: {
                        id: topic.data.id,
                        title: topic.data.title,
                        originalTopic: topic.data.originalTopic,
                        creationNotes: topic.data.creationNotes,
                        tags: topic.data.tags,
                        backgroundSnapshot: topic.data.backgroundSnapshot,
                    },
                    orientation,
                    storyline,
                    references,
                    ...(additionalInfo?.trim() ? { additionalInfo: additionalInfo.trim() } : {}),
                },
            });
            selectNode(result.node.id);
            await Promise.all([workboard.nodes.refetch(), workboard.runs.refetch()]);
            setStoryboardSource(null);
        } finally {
            if (operation === "regenerate") setRegeneratingNodeId(null);
        }
    };

    const stopStoryboardNode = async (node: ContentNode) => {
        const snapshot = contentStoryboardSnapshot(node);
        if (!snapshot) return;
        setStoppingNodeId(node.id);
        try {
            await stopStoryboard.mutateAsync({ runId: snapshot.runId });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "分镜任务停止失败");
        } finally {
            setStoppingNodeId(null);
        }
    };

    const generateBranch = async (
        root: ContentNode,
        requestedStage?: ContentStage,
        prepare?: () => Promise<ContentNode>,
    ) => {
        if (!orientation) {
            message.warning("请先定义当前 Topic 的内容 Orientation");
            return;
        }
        if (requestedStage === "storyline_script") {
            await runStorylineOperation("generate", root, undefined, prepare);
            return;
        }
        if (requestedStage === "shot_breakdown") {
            if (!contentStorylineSnapshot(root)?.candidate) {
                message.warning("请先完成故事线");
                return;
            }
            setStoryboardSource(root);
            return;
        }
        const rootReferences = referencesForNode(root, workboard.references.data || [], profile?.id || "");
        const mediaStage = root.nodeType === "image" && root.data.assetId ? null : contentMediaStage(root.nodeType);
        if (mediaStage) {
            const policy = policies.data?.find((item) => item.stage === mediaStage);
            if (!policy || !profile?.id) {
                message.error("当前媒体阶段尚未完成 Super User 模型配置");
                return;
            }
            try {
                const result = await runContentMediaGeneration({
                    topicId,
                    attemptId,
                    ownerId: profile.id,
                    node: root,
                    references: rootReferences,
                    policy,
                    config,
                });
                await Promise.all([workboard.nodes.refetch(), workboard.artifacts.refetch(), workboard.runs.refetch()]);
                message.success(`已生成 ${result.count} 个媒体结果；可继续生成新的 Batch`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "媒体生成失败");
            }
            return;
        }
        const manualModel = ["topic", "angle", "orientation", "storyline", "script", "shot", "resource_requirements", "text"].includes(root.nodeType) ? String(root.data.model || "") : "";
        if (manualModel) {
            if (!profile?.id) return;
            try {
                const child = await runContentTextExploration({
                    topicId,
                    attemptId,
                    ownerId: profile.id,
                    node: root,
                    references: rootReferences,
                    model: manualModel,
                });
                await Promise.all([workboard.nodes.refetch(), workboard.runs.refetch()]);
                selectNode(child.id);
                message.success("Owner 探索分支已生成；未使用自动 System Prompt 或 Reviewer");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "文本探索失败");
            }
            return;
        }
        const stage = requestedStage;
        if (!stage) {
            message.info("请选择一个明确的生成操作");
            return;
        }
        const ancestorNodes = contentNodePath(nodes, root.id).map((node) => node.id === root.id ? root : node).map((node) => ({
            id: node.id,
            type: node.nodeType,
            title: node.title,
            summary: node.summary,
            data: node.data,
        }));
        const refs = rootReferences;
        if (!profile?.id) return;
        try {
            await startContentOrchestration({
                topicId,
                attemptId,
                rootNodeId: root.id,
                stage,
                mode: "automatic",
                input: {
                    topic: { id: topic.data?.id, title: topic.data?.title, originalTopic: topic.data?.originalTopic, tags: topic.data?.tags },
                    background: orientation,
                    orientation,
                    root: ancestorNodes.at(-1),
                    ancestors: ancestorNodes,
                    references: refs,
                },
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生成编排启动失败");
        }
        return;
    };

    const saveOrientation = async (value: ContentTopicOrientation) => {
        if (!profile?.id || !editable || !topic.data) return;
        const root = nodes.find((node) => node.nodeType === "topic" && !node.parentId);
        if (!root) throw new Error("当前 Attempt 缺少 Topic 根节点");
        await updateNode.mutateAsync({
            node: root,
            patch: { data: { ...root.data, orientation: value } },
        });
    };

    const topicFactoryInput = (root: ContentNode, value: ContentTopicOrientation) => ({
        topic: {
            id: topic.data!.id,
            title: topic.data!.title,
            originalTopic: topic.data!.originalTopic,
            creationNotes: topic.data!.creationNotes,
            tags: topic.data!.tags,
            backgroundSnapshot: topic.data!.backgroundSnapshot,
        },
        orientation: value,
        references: referencesForNode(root, workboard.references.data || [], profile!.id),
    });

    const reportRegenerationError = (error: unknown) => {
        message.error(error instanceof Error ? error.message : "选题重新生成失败");
    };

    const generateTopicBranches = async (value: ContentTopicOrientation) => {
        if (!profile?.id || !editable || !topic.data) return;
        const root = nodes.find((node) => node.nodeType === "topic" && !node.parentId);
        if (!root) throw new Error("当前 Attempt 缺少 Topic 根节点");
        if (serverTopicFactorySnapshots.length) {
            modal.confirm({
                title: "覆盖现有选题分支？",
                content: "确认后会隐藏现有选题分支及其后续内容，并重新生成 5 条分支。",
                okText: "覆盖并重新生成",
                okButtonProps: { danger: true },
                onOk: () => startConfirmedRegeneration(() => regenerateFactory(root, value), reportRegenerationError),
            });
            return;
        }
        const batchId = crypto.randomUUID();
        const optimisticNodes = createOptimisticTopicFactoryNodes({
            topicId,
            attemptId,
            rootNodeId: root.id,
            createdBy: profile.id,
            batchId,
            createdAt: new Date().toISOString(),
        });
        const result = await runOptimisticTopicFactoryStart({
            nodes: optimisticNodes,
            publish: (nodes) => setOptimisticFactory({ attemptId, nodes }),
            save: () => saveOrientation(value),
            start: () => startTopicFactory.mutateAsync({
                topicId,
                attemptId,
                rootNodeId: root.id,
                input: topicFactoryInput(root, value),
            }),
        });
        if (result.nodes[0]?.id) selectNode(result.nodes[0].id);
        await Promise.all([workboard.nodes.refetch(), workboard.runs.refetch()]);
        setOptimisticFactory(null);
    };

    async function regenerateFactory(node: ContentNode, orientationOverride?: ContentTopicOrientation) {
        const nextOrientation = orientationOverride || orientation;
        if (!profile?.id || !editable || !topic.data || !nextOrientation) return;
        const root = nodes.find((item) => item.nodeType === "topic" && !item.parentId);
        if (!root) throw new Error("当前 Attempt 缺少 Topic 根节点");
        const factory = contentTopicFactorySnapshot(node);
        if (node.nodeType !== "topic" && !factory) return;
        setRegeneratingNodeId(node.id);
        try {
            const result = await regenerateTopicFactory.mutateAsync({
                topicId,
                attemptId,
                rootNodeId: root.id,
                ...(factory ? { nodeId: node.id } : {}),
                input: topicFactoryInput(root, nextOrientation),
            });
            if (result.nodes[0]?.id) selectNode(factory ? node.id : result.nodes[0].id);
            await Promise.all([workboard.nodes.refetch(), workboard.runs.refetch()]);
        } catch (error) {
            reportRegenerationError(error);
        } finally {
            setRegeneratingNodeId(null);
        }
    }

    const confirmRegenerateFactory = (node: ContentNode) => {
        const factory = contentTopicFactorySnapshot(node);
        modal.confirm({
            title: factory ? "覆盖这个选题分支？" : "覆盖全部选题分支？",
            content: factory
                ? "确认后会隐藏这个选题分支下已有的优化版本和后续制作内容，并基于当前设置重新生成。"
                : "确认后会隐藏现有选题分支及其后续制作内容，并重新生成 5 条选题分支。",
            okText: "覆盖并重新生成",
            okButtonProps: { danger: true },
            onOk: () => startConfirmedRegeneration(() => regenerateFactory(node), reportRegenerationError),
        });
    };

    const stopFactoryNode = async (node: ContentNode) => {
        const factory = contentTopicFactorySnapshot(node);
        if (!factory || stoppingNodeId) return;
        setStoppingNodeId(node.id);
        try {
            await stopTopicFactory.mutateAsync({ runId: factory.runId });
            await Promise.all([workboard.nodes.refetch(), workboard.runs.refetch(), generationJobs.refetch()]);
            message.success("选题分支已停止，可以重新生成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "选题分支停止失败");
        } finally {
            setStoppingNodeId(null);
        }
    };

    const confirmRebuildStoryline = (node: ContentNode) => {
        modal.confirm({
            title: "重构这个故事线？",
            content: "确认后会复用当前故事线节点、隐藏其全部后续内容，并使用全新的 Interaction 从选题上下文重新构建；不会携带当前故事线内容。",
            okText: "重构故事线",
            okButtonProps: { danger: true },
            onOk: () => runStorylineOperation("rebuild", node),
        });
    };

    const optimizeFactoryNode = async (source: ContentNode, direction: string) => {
        if (!profile?.id || !editable || !topic.data || !orientation) return;
        const sourceFactory = contentTopicFactorySnapshot(source);
        const root = nodes.find((node) => node.nodeType === "topic" && !node.parentId);
        if (!root || !sourceFactory?.candidate) throw new Error("当前选题还没有可优化的内容");
        const requestId = crypto.randomUUID();
        try {
            const result = await optimizeTopicFactory.mutateAsync({
                topicId,
                attemptId,
                rootNodeId: root.id,
                sourceNodeId: source.id,
                direction,
                clientRequestId: requestId,
                input: topicFactoryInput(root, orientation),
            });
            selectNode(result.nodes[0]?.id || source.id);
            await Promise.all([workboard.nodes.refetch(), workboard.runs.refetch()]);
        } catch (error) {
            selectNode(source.id);
            message.error(error instanceof Error ? error.message : "选题优化失败");
        }
    };

    const deleteSelectedBranch = useCallback(async () => {
        const root = nodes.find((node) => node.id === selectedNodeId);
        if (!editable || !root?.parentId || root.id.startsWith("optimistic-topic-factory:") || keyboardActionRunningRef.current) return;
        const branch = contentBranchNodes(nodes, root.id);
        if (!branch.length) return;
        keyboardActionRunningRef.current = true;
        const hidden: ContentNode[] = [];
        try {
            const hiddenAt = new Date().toISOString();
            for (const node of [...branch].reverse()) {
                hidden.unshift(await updateNode.mutateAsync({ node, patch: { hiddenAt } }));
            }
            undoStackRef.current = [...undoStackRef.current.slice(-19), { rootNodeId: root.id, nodes: hidden }];
            selectNode(null);
            await workboard.nodes.refetch();
        } catch (error) {
            await Promise.allSettled(hidden.map((node) => updateNode.mutateAsync({ node, patch: { hiddenAt: null } })));
            await workboard.nodes.refetch();
            message.error(error instanceof Error ? error.message : "分支删除失败");
        } finally {
            keyboardActionRunningRef.current = false;
        }
    }, [editable, message, nodes, selectNode, selectedNodeId, updateNode, workboard.nodes]);

    const undoWorkboard = useCallback(async () => {
        const entry = undoStackRef.current.at(-1);
        if (!editable || !entry || keyboardActionRunningRef.current) return;
        keyboardActionRunningRef.current = true;
        let restoredCount = 0;
        try {
            for (const node of entry.nodes) {
                await updateNode.mutateAsync({ node, patch: { hiddenAt: null } });
                restoredCount += 1;
            }
            undoStackRef.current = undoStackRef.current.slice(0, -1);
            selectNode(entry.rootNodeId);
            await workboard.nodes.refetch();
        } catch (error) {
            undoStackRef.current = [
                ...undoStackRef.current.slice(0, -1),
                { ...entry, nodes: entry.nodes.slice(restoredCount) },
            ];
            await workboard.nodes.refetch();
            message.error(error instanceof Error ? error.message : "撤销失败");
        } finally {
            keyboardActionRunningRef.current = false;
        }
    }, [editable, message, selectNode, updateNode, workboard.nodes]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (
                event.target instanceof HTMLInputElement
                || event.target instanceof HTMLTextAreaElement
                || event.target instanceof HTMLSelectElement
                || target?.closest("button,a,[contenteditable='true'],[data-canvas-no-zoom],.ant-modal,.ant-drawer,.ant-popover,.ant-dropdown,.ant-select-dropdown")
            ) return;
            const action = contentWorkboardShortcut(event);
            if (action === "undo") {
                event.preventDefault();
                void undoWorkboard();
            } else if (action === "delete" && selectedNodeId) {
                event.preventDefault();
                void deleteSelectedBranch();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [deleteSelectedBranch, selectedNodeId, undoWorkboard]);

    const toggleClip = async (clip: ContentClipView, selected: boolean) => {
        if (!currentShot || !profile?.id) return;
        if (selected) {
            await selectClip.mutateAsync({ topicId, attemptId, shotNodeId: currentShot.id, artifactId: clip.artifact.id, selectedBy: profile.id });
        } else {
            await deselectClip.mutateAsync({ shotNodeId: currentShot.id, artifactId: clip.artifact.id });
        }
    };

    const uploadClip = async (file: File) => {
        if (!selectedNode || !profile?.id) return;
        setUploadingClip(true);
        try {
            const asset = await uploadAssetFile(file);
            if (asset.kind !== "video" || !asset.url) throw new Error("请上传视频 Clip");
            const clipNode = await createContentNode({
                topicId,
                attemptId,
                parentId: selectedNode.id,
                nodeType: "video",
                title: asset.title || "上传 Clip",
                summary: "Owner 上传的可用 Clip",
                sortOrder: nodes.filter((node) => node.parentId === selectedNode.id).length,
                data: { assetId: asset.id, url: asset.url, mimeType: asset.mime_type || "video/mp4", durationMs: asset.duration_seconds ? asset.duration_seconds * 1000 : undefined },
                status: "succeeded",
                createdBy: profile.id,
            });
            await createContentArtifact({
                topicId,
                attemptId,
                nodeId: clipNode.id,
                runId: null,
                assetId: asset.id,
                ownerId: profile.id,
                kind: "video",
                source: "upload",
                outputIndex: null,
                metadata: { mimeType: asset.mime_type || "video/mp4", bytes: asset.byte_size || 0, durationMs: asset.duration_seconds ? asset.duration_seconds * 1000 : undefined },
            });
            await Promise.all([workboard.nodes.refetch(), workboard.artifacts.refetch()]);
            message.success("Clip 已上传，可直接勾选");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Clip 上传失败");
        } finally {
            setUploadingClip(false);
        }
    };

    const segmentTopicAudio = useCallback(async (input: AudioSegmentationSubmit) => {
        const parent = nodes.find((node) => node.id === input.parentNodeId);
        if (!editable || !parent || !profile?.id || segmentingAudio) return;
        setSegmentingAudio(true);
        const uploadedAssetIds: string[] = [];
        const createdNodes: ContentNode[] = [];
        const hiddenOldNodes: ContentNode[] = [];
        try {
            const uploaded = await Promise.all(input.segments.map(async (segment) => {
                const asset = await uploadCloudAsset(
                    segment.blob,
                    "audio",
                    `${parent.title || "音频"} · 片段 ${segment.index + 1}`,
                    {
                        duration_seconds: (segment.endMs - segment.startMs) / 1000,
                        audio_kind: "speech",
                        metadata: {
                            source: "音频分段",
                            parentAudioNodeId: parent.id,
                            segmentationRunId: input.segmentationRunId,
                            segmentIndex: segment.index,
                            sourceStartMs: segment.startMs,
                            sourceEndMs: segment.endMs,
                            tags: [],
                            coverUrl: "",
                        },
                    },
                );
                uploadedAssetIds.push(asset.id);
                if (!asset.url) throw new Error("分段音频地址生成失败");
                return {
                    assetId: asset.id,
                    url: asset.url,
                    mimeType: asset.mime_type || "audio/wav",
                    bytes: asset.byte_size || segment.blob.size,
                    durationMs: segment.endMs - segment.startMs,
                    index: segment.index,
                    startMs: segment.startMs,
                    endMs: segment.endMs,
                };
            }));
            const inputs = contentAudioSegmentNodeInputs(parent, profile.id, input.segmentationRunId, uploaded);
            for (const nodeInput of inputs) {
                const child = await createContentNode(nodeInput);
                createdNodes.push(child);
                await createContentArtifact({
                    topicId,
                    attemptId,
                    nodeId: child.id,
                    runId: null,
                    assetId: String(child.data.assetId),
                    ownerId: profile.id,
                    kind: "audio",
                    source: parent.data.sourceType === "generated" ? "ai" : "upload",
                    outputIndex: Number(child.data.segmentIndex),
                    metadata: {
                        mimeType: child.data.mimeType,
                        bytes: child.data.bytes,
                        durationMs: child.data.durationMs,
                        parentAudioNodeId: parent.id,
                        segmentationRunId: input.segmentationRunId,
                        sourceStartMs: child.data.sourceStartMs,
                        sourceEndMs: child.data.sourceEndMs,
                    },
                });
            }
            const oldIds = new Set(contentAudioSegmentChildIds(nodes, parent.id));
            const oldBranchNodes = nodes.filter((node) => oldIds.has(node.id) || [...oldIds].some((id) => contentBranchNodes(nodes, id).some((item) => item.id === node.id)));
            const hiddenAt = new Date().toISOString();
            for (const oldNode of [...oldBranchNodes].reverse()) {
                hiddenOldNodes.unshift(await updateNode.mutateAsync({ node: oldNode, patch: { hiddenAt } }));
            }
            await Promise.all([workboard.nodes.refetch(), workboard.artifacts.refetch()]);
            selectNode(createdNodes[0]?.id || parent.id);
            message.success(`已生成 ${createdNodes.length} 个独立音频节点`);
        } catch (error) {
            await Promise.allSettled(hiddenOldNodes.map((node) => updateNode.mutateAsync({ node, patch: { hiddenAt: null } })));
            await Promise.allSettled(createdNodes.map((node) => updateNode.mutateAsync({ node, patch: { hiddenAt: new Date().toISOString() } })));
            if (uploadedAssetIds.length) await deleteCloudAssets(uploadedAssetIds).catch(() => undefined);
            await Promise.all([workboard.nodes.refetch(), workboard.artifacts.refetch()]);
            throw error;
        } finally {
            setSegmentingAudio(false);
        }
    }, [attemptId, editable, message, nodes, profile?.id, segmentingAudio, selectNode, topicId, updateNode, workboard.artifacts, workboard.nodes]);

    if (topic.isLoading) return <Skeleton active className="p-8" />;
    if (topic.isError || !topic.data) return <Result status="404" title="Topic 不存在" extra={<Button onClick={() => navigate("/content")}>返回内容生产中心</Button>} />;
    if (workboard.nodes.isLoading) return <Skeleton active className="p-8" />;

    return (
        <WorkspacePage
            topBar={<TopicStrip
                topics={ownedTopics.data || []}
                summaries={summaries}
                currentTopicId={topicId}
                onOpen={(id) => navigate(`/content/topics/${id}`)}
                onOverview={() => navigate("/content")}
                status={
                    <div className="hidden shrink-0 items-center gap-2 xl:flex">
                        {workboard.deliveries.data?.[0] ? <Tag>交付 v{workboard.deliveries.data[0].version}</Tag> : null}
                        {completions.data?.[0] ? <Tag color={topic.data.hasPostCompletionChanges ? "gold" : "green"}>完成 v{completions.data[0].version}{topic.data.hasPostCompletionChanges ? " · 有新修改" : ""}</Tag> : null}
                        {!editable ? <Tag icon={<Eye className="size-3" />}>只读查看</Tag> : null}
                    </div>
                }
                actions={<>
                    <Button disabled={!orientationReady} icon={<PackageCheck className="size-4" />} onClick={() => setDeliveryOpen(true)}>交付包</Button>
                    <Button type="primary" disabled={!editable || !orientationReady} icon={<CheckCircle2 className="size-4" />} onClick={() => setCompletionOpen(true)}>{topic.data.status === "completed" ? "再次完成" : "完成 Topic"}</Button>
                    <Button danger disabled={!editable || topic.data.status === "completed"} icon={<LogOut className="size-4" />} onClick={() => setAbandonOpen(true)}>放弃</Button>
                </>}
            />}
        >
            <div className="flex min-h-0 flex-1 flex-col">
                <TopicFactoryProgress
                    summary={topicSummary}
                    total={topicFactorySnapshots.length}
                    selectedPath={selectedPath}
                />
                <div className="flex min-h-0 flex-1">
                <div className="relative min-w-0 flex-1">
                    {!canvasNodes.length ? <Empty className="mt-24" description="当前 Attempt 还没有可显示节点" /> : (
                        <CrocoCanvas
                            containerRef={containerRef}
                            viewport={viewport}
                            onViewportChange={setViewport}
                            onCanvasDeselect={() => selectNodeWithPromptGuard(null)}
                        >
                            <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", zIndex: 0 }}>
                                {connections.map((connection) => {
                                    const from = nodeById.get(connection.fromNodeId);
                                    const to = nodeById.get(connection.toNodeId);
                                    if (!from || !to) return null;
                                    return <ConnectionPath key={connection.id} connection={connection} from={from} to={to} active={selectedNodeId === connection.fromNodeId || selectedNodeId === connection.toNodeId} onSelect={() => selectNodeWithPromptGuard(connection.toNodeId)} />;
                                })}
                            </svg>
                            {visibleNodes.map((node) => {
                                const position = layout[node.id];
                                if (!position) return null;
                                const factory = contentTopicFactorySnapshot(node);
                                const storyline = contentStorylineSnapshot(node);
                                const storyboard = contentStoryboardSnapshot(node);
                                const workflow = factory || storyline || storyboard;
                                const optimistic = node.id.startsWith("optimistic-");
                                return <ContentTreeNode
                                    key={node.id}
                                    node={node}
                                    x={position.x}
                                    y={position.y}
                                    selected={node.id === selectedNodeId}
                                    jobs={workflow ? jobsByRun.get(workflow.runId) || [] : []}
                                    onSelect={() => openNode(node)}
                                    onRegenerate={editable && !optimistic ? (
                                        storyline?.candidate
                                            ? () => confirmRebuildStoryline(node)
                                            : storyboard?.header
                                                ? () => modal.confirm({
                                                    title: "重新生成整套分镜？",
                                                    content: "当前父节点内容与其标准分镜子节点将被新结果覆盖。",
                                                    okText: "重新生成",
                                                    cancelText: "取消",
                                                    onOk: () => runStoryboardOperation("regenerate", node),
                                                })
                                            : ((node.nodeType === "topic" && serverTopicFactorySnapshots.length > 0) || Boolean(factory))
                                                ? () => confirmRegenerateFactory(node)
                                                : undefined
                                    ) : undefined}
                                    regenerating={(regenerateTopicFactory.isPending || startStoryline.isPending || startStoryboard.isPending) && regeneratingNodeId === node.id}
                                    regenerateDisabled={regenerateTopicFactory.isPending || startStoryline.isPending || startStoryboard.isPending || (node.nodeType === "topic" && factoryRunning)}
                                    onStop={editable && !optimistic && factory
                                        ? () => void stopFactoryNode(node)
                                        : editable && !optimistic && storyboard && storyboard.phase === "producer_running"
                                            ? () => void stopStoryboardNode(node)
                                            : undefined}
                                    stopping={(stopTopicFactory.isPending || stopStoryboard.isPending) && stoppingNodeId === node.id}
                                    optimizeOpen={optimizingNodeId === node.id}
                                    optimizing={optimizeTopicFactory.isPending || startStoryline.isPending || startStoryboard.isPending}
                                    onHeightChange={handleNodeHeightChange}
                                    onToggleOptimize={editable && !optimistic && Boolean(factory?.candidate || storyline?.candidate || (storyboard && storyboard.phase === "accepted")) ? () => setOptimizingNodeId((current) => current === node.id ? null : node.id) : undefined}
                                    onOptimize={async (direction) => {
                                        if (storyline) await runStorylineOperation("optimize", node, direction);
                                        else if (storyboard) await runStoryboardOperation(storyboard.header ? "optimize" : "optimize_node", node, direction);
                                        else await optimizeFactoryNode(node, direction);
                                        setOptimizingNodeId(null);
                                    }}
                                    collapsed={collapsedStoryboardGroups.has(node.id)}
                                    onToggleCollapse={storyboard?.header ? () => setCollapsedStoryboardGroups((current) => {
                                        const next = new Set(current);
                                        if (next.has(node.id)) next.delete(node.id);
                                        else next.add(node.id);
                                        return next;
                                    }) : undefined}
                                />;
                            })}
                        </CrocoCanvas>
                    )}
                    {isMiniMapOpen ? <Minimap nodes={canvasNodes} viewport={viewport} viewportSize={viewportSize} onViewportChange={setViewport} /> : null}
                    <CanvasZoomControls
                        scale={viewport.k}
                        onScaleChange={(k) => setViewport((current) => ({ ...current, k }))}
                        onReset={resetViewport}
                        isMiniMapOpen={isMiniMapOpen}
                        onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
                    />
                </div>
                {selectedNode?.nodeType === "topic" ? (
                    <TopicNodePanel
                        orientation={orientation}
                        references={(workboard.references.data || []).filter((reference) => reference.nodeId === selectedNode.id)}
                        editable={editable}
                        saving={updateNode.isPending}
                        generating={startTopicFactory.isPending || regenerateTopicFactory.isPending}
                        panelTab={panelTab}
                        tuningEnabled={tuningEnabled}
                        tuning={<ContentModelPromptTuning run={producingRun} onDirtyChange={setPromptDirty} />}
                        onPanelTabChange={changePanelTab}
                        onSave={saveOrientation}
                        onGenerate={generateTopicBranches}
                        onAttach={async (assetId, purpose) => {
                            if (!profile?.id) return;
                            await createReference.mutateAsync({
                                topicId,
                                attemptId,
                                nodeId: selectedNode.id,
                                assetId,
                                referencedNodeId: null,
                                referenceKind: "asset",
                                purpose,
                                createdBy: profile.id,
                            });
                        }}
                        onRemove={async (referenceId) => {
                            await deleteReference.mutateAsync(referenceId);
                        }}
                    />
                ) : selectedNode ? (
                    <ContentNodePanel
                        node={selectedNode}
                        editable={editable}
                        saving={updateNode.isPending || startStoryline.isPending || startStoryboard.isPending || segmentingAudio}
                        onSave={(patch, sourceNode) => updateNode.mutateAsync({ node: sourceNode || selectedNode, patch })}
                        onGenerate={generateBranch}
                        modelOptions={mediaModelOptions}
                        jobs={selectedWorkflowJobs}
                        panelTab={panelTab}
                        tuningEnabled={tuningEnabled}
                        tuning={<ContentModelPromptTuning
                            run={producingRun}
                            fallbackStage={contentModelPromptFallbackStage(selectedNode, producingRun)}
                            onDirtyChange={setPromptDirty}
                        />}
                        onPanelTabChange={changePanelTab}
                        onSegmentAudio={segmentTopicAudio}
                        clipResults={selectedNode.nodeType === "video" || currentShot?.nodeType === "shot" ? (
                            <ContentClipResults
                                clips={clipViews}
                                editable={editable}
                                selecting={selectClip.isPending || deselectClip.isPending}
                                uploading={uploadingClip}
                                onToggle={toggleClip}
                                onUpload={uploadClip}
                                onEnhanced={() => void workboard.artifacts.refetch()}
                            />
                        ) : undefined}
                        references={(
                            <ContentAssetReferences
                                references={(workboard.references.data || []).filter((reference) => reference.nodeId === selectedNode.id)}
                                editable={editable}
                                onAttach={async (assetId, purpose) => {
                                    if (!profile?.id) return;
                                    await createReference.mutateAsync({
                                        topicId,
                                        attemptId,
                                        nodeId: selectedNode.id,
                                        assetId,
                                        referencedNodeId: null,
                                        referenceKind: "asset",
                                        purpose,
                                        createdBy: profile.id,
                                    });
                                }}
                                onRemove={async (referenceId) => {
                                    await deleteReference.mutateAsync(referenceId);
                                }}
                            />
                        )}
                    />
                ) : null}
                </div>
            </div>
            <ContentDeliveryModal
                open={deliveryOpen}
                manifest={deliveryManifest}
                onClose={() => setDeliveryOpen(false)}
                onCreateSnapshot={async () => {
                    if (!deliveryManifest || !profile?.id) return;
                    await createDelivery.mutateAsync({
                        topicId,
                        attemptId,
                        ownerId: profile.id,
                        version: (workboard.deliveries.data?.[0]?.version || 0) + 1,
                        artifactIds: deliveryManifest.clips.map((clip) => clip.artifactId),
                        manifest: deliveryManifest,
                    });
                }}
            />
            <ContentCompletionModal
                open={completionOpen}
                completing={completeTopic.isPending}
                onClose={() => setCompletionOpen(false)}
                onComplete={async (assetId, notes) => {
                    await completeTopic.mutateAsync({ topicId, finalAssetIds: [assetId], notes });
                    await topic.refetch();
                    message.success("Topic 完成版本已保存");
                }}
            />
            <StoryboardGenerationModal
                open={Boolean(storyboardSource)}
                submitting={startStoryboard.isPending}
                allowedKinds={storyboardAllowedKinds}
                onClose={() => setStoryboardSource(null)}
                onSubmit={(value) => storyboardSource
                    ? runStoryboardOperation("generate", storyboardSource, undefined, value)
                    : Promise.resolve()}
            />
            <Modal
                title="放弃 Topic"
                open={abandonOpen}
                okText="确认放弃并退回公共池"
                okButtonProps={{ danger: true }}
                confirmLoading={abandonTopic.isPending}
                onCancel={() => setAbandonOpen(false)}
                onOk={() => void (async () => {
                    if (!abandonReason.trim()) return message.warning("请填写放弃原因");
                    await abandonTopic.mutateAsync({ topicId, reason: abandonReason.trim() });
                    navigate("/content");
                })()}
            >
                <p className="mb-3 text-sm text-stone-500">当前 Attempt 会完整保留用于统计，但不会向下一位 Owner 展示为起点。</p>
                <Input.TextArea value={abandonReason} rows={4} placeholder="请填写不适合继续制作的原因" onChange={(event) => setAbandonReason(event.target.value)} />
            </Modal>
        </WorkspacePage>
    );
}

function toCanvasNode(node: ContentNode, position: { x: number; y: number }, height = CONTENT_NODE_HEIGHT): CanvasNodeData {
    return {
        id: node.id,
        title: node.title,
        type: canvasType(node.nodeType),
        position,
        width: CONTENT_NODE_WIDTH,
        height,
    };
}

function canvasType(nodeType: ContentNodeType) {
    if (nodeType === "image" || nodeType === "storyboard_prompt") return CanvasNodeType.Image;
    if (nodeType === "video") return CanvasNodeType.Video;
    if (nodeType === "tts") return CanvasNodeType.Audio;
    if (nodeType === "music") return CanvasNodeType.Music;
    if (nodeType === "batch") return CanvasNodeType.Config;
    return CanvasNodeType.Text;
}

function referencesForNode(node: ContentNode, references: ContentNodeReference[], userId: string): ContentNodeReference[] {
    const direct = references.filter((reference) => reference.nodeId === node.id);
    const assetId = typeof node.data.assetId === "string" ? node.data.assetId : "";
    if (!assetId || direct.some((reference) => reference.assetId === assetId)) return direct;
    return [...direct, {
        id: `node-asset:${node.id}`,
        topicId: node.topicId,
        attemptId: node.attemptId,
        nodeId: node.id,
        assetId,
        referencedNodeId: null,
        referenceKind: node.nodeType === "tts" || node.nodeType === "music" ? "audio" : node.nodeType === "image" ? "frame" : "asset",
        purpose: "当前节点自身的生成媒体",
        createdBy: userId || node.createdBy,
        createdAt: node.createdAt,
    }];
}
