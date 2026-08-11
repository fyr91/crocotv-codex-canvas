import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Divider, Dropdown, Input, message, Modal, Select, Skeleton, Switch, Tag, Upload } from "antd";
import { ArrowLeft, Copy, GraduationCap, Image, Mic2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { ActiveConnectionPath, ConnectionPath } from "@/components/canvas/canvas-connections";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasNodeIconButton } from "@/components/canvas/canvas-node-icon-button";
import { CrocoCanvas } from "@/components/canvas/crocotv-canvas";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { AudioSegmentationPanel } from "@/components/audio/audio-segmentation-panel";
import { SystemState } from "@/components/layout/system-state";
import { WorkspacePage } from "@/components/layout/page-shell";
import { shouldIgnoreCanvasKeyboardShortcut } from "@/lib/canvas/canvas-keyboard";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { normalizeAudioSpeedValue, normalizeAudioVolumeValue } from "@/lib/audio-generation";
import { kouboCanvasFlow } from "@/lib/koubo-video/canvas-flow";
import { courseScriptModelOption, courseScriptModels } from "@/lib/koubo-video/course-script-models";
import { courseScriptGroupOptimizationPrompt, courseScriptPrompt } from "@/lib/koubo-video/course-script-prompt";
import { kouboCascadeSelectionIds, kouboDownloadSelection, kouboGroupSelectionIds } from "@/lib/koubo-video/node-selection";
import { deriveKouboStatus, kouboRefetchInterval } from "@/lib/koubo-video/workflow";
import { videoWorkflowCopy, type VideoWorkflowCopy } from "@/lib/koubo-video/workflow-copy";
import { exportCanvasResultNodes } from "@/lib/canvas/canvas-result-export";
import type { AudioSegmentationSubmit } from "@/lib/audio/segmentation";
import { imageSizeValue } from "@/lib/image-generation-size";
import { expressiveSpeechModels, kouboImageModels, ltx23VideoModels } from "@/lib/koubo-video/runtime";
import { readKouboInitialization, videoWorkflowDefinition } from "@/lib/koubo-video/initialization";
import { useCopyText } from "@/hooks/use-copy-text";
import { createKouboImageNode, createKouboScriptGroup, deleteKouboNodes, editKouboSegment, getKouboWorkspace, linkKouboAudioImage, markKouboNoticeSeen, registerKouboAudioNode, registerKouboImageAsset, replaceKouboAudioSegments, runKouboAction, subscribeKouboWorkspace, unlinkKouboAudioImage } from "@/services/api/koubo-video";
import { modelId, waitForGeneration, type GenerationJob } from "@/services/api/generation-client";
import { getCloudAsset } from "@/services/api/cloud-assets";
import { getSpeechVoices } from "@/services/api/speech-voices";
import { initializeVideoWorkflowProject } from "@/services/api/content-production";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { imageSizePresetsForModel, modelOptionLabel, useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import type { ContentGenerationRun, ContentModelPromptBinding, ContentNode, VideoWorkflowType } from "@/types/content-production";
import type { KouboAudioNode, KouboImageResult, KouboModelPromptBinding, KouboSegment, KouboVideoCandidate, KouboWorkspace } from "@/types/koubo-video";
import { ContentTreeNode } from "./components/content-tree-node";
import { ContentModelPromptTuning } from "./components/content-model-prompt-tuning";
import { ContentNodePanelTabs, type ContentNodePanelTab } from "./components/content-node-panel-tabs";
import { KouboNodeContextMenu } from "./components/koubo-node-context-menu";
import { LiveRecordingWaveform } from "./components/live-recording-waveform";
import { contentQueryKeys, useContentWorkflowProjectQuery, useContentWorkflowProjectsQuery, useSaveCourseScriptModelMutation } from "./use-content-production";

const statusLabels = {
    draft: "草稿", preparing_assets: "准备素材", adjusting_segments: "调整分段", generating: "生成中",
    review: "待审核", partial_failure: "部分失败", exportable: "可导出", exported: "已导出",
} as const;

type OptimisticRoleImage = { audioId: string; image: KouboImageResult };
type ScriptGenerationTask = { id: string; prompt: string; mode: "ai" | "pasted"; job: GenerationJob };

export default function KouboVideoPage({ workflowType = "koubo-video" }: { workflowType?: VideoWorkflowType }) {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { projectId = "" } = useParams<{ projectId: string }>();
    const workflowDefinition = videoWorkflowDefinition(workflowType);
    const workflowCopy = videoWorkflowCopy(workflowType);
    const initialization = useMemo(() => readKouboInitialization(location.search), [location.search]);
    const initializeProject = useQuery({
        queryKey: ["koubo-initialize", workflowType, projectId, initialization?.clientRequestId],
        queryFn: () => initializeVideoWorkflowProject(workflowType, projectId, initialization!.clientRequestId),
        enabled: Boolean(projectId && initialization),
        retry: false,
    });
    const project = useContentWorkflowProjectQuery(projectId, !initialization || initializeProject.isSuccess);
    const projects = useContentWorkflowProjectsQuery();
    const workspace = useQuery({ queryKey: ["koubo-workspace", workflowType, projectId], queryFn: () => getKouboWorkspace(projectId, workflowType), enabled: project.data?.workflowType === workflowType, refetchInterval: (query) => kouboRefetchInterval(query.state.data) });
    const voices = useQuery({ queryKey: ["speech-voices"], queryFn: getSpeechVoices, staleTime: 300_000 });
    const config = useConfigStore((state) => state.config);
    const profile = useUserStore((state) => state.profile);
    const copyText = useCopyText();
    const speechModels = useMemo(() => expressiveSpeechModels(config), [config]);
    const roleImageModels = useMemo(() => kouboImageModels(config), [config]);
    const videoModels = useMemo(() => ltx23VideoModels(config), [config]);
    const availableCourseScriptModels = useMemo(() => courseScriptModels(config), [config]);
    const saveCourseScriptModel = useSaveCourseScriptModelMutation(projectId);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ x: 40, y: 36, k: 1 });
    const [scriptOpen, setScriptOpen] = useState(false);
    const [scriptMode, setScriptMode] = useState<"ai" | "pasted">("pasted");
    const [scriptSegmented, setScriptSegmented] = useState(true);
    const [scriptText, setScriptText] = useState("");
    const [scriptDirection, setScriptDirection] = useState("");
    const [courseTopic, setCourseTopic] = useState("");
    const [courseAudience, setCourseAudience] = useState("");
    const [courseExtraPrompt, setCourseExtraPrompt] = useState("");
    const [audioOpen, setAudioOpen] = useState(false);
    const [audioProcessing, setAudioProcessing] = useState(false);
    const [scriptGenerationTasks, setScriptGenerationTasks] = useState<ScriptGenerationTask[]>([]);
    const [scriptImporting, setScriptImporting] = useState(false);
    const scriptGenerating = workflowType === "koubo-video" && scriptGenerationTasks.some((task) => ["queued", "running"].includes(task.job.status));
    const [busy, setBusy] = useState("");
    const [editingText, setEditingText] = useState("");
    const [editingDirection, setEditingDirection] = useState("");
    const [selectedGroup, setSelectedGroup] = useState("script");
    const [collapsedScriptGroups, setCollapsedScriptGroups] = useState<Set<string>>(new Set());
    const [panelTab, setPanelTab] = useState<ContentNodePanelTab>("content");
    const [promptDirty, setPromptDirty] = useState(false);
    const [optimizingSegmentId, setOptimizingSegmentId] = useState("");
    const [optimizingGroupId, setOptimizingGroupId] = useState("");
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const [audioTargetSegmentId, setAudioTargetSegmentId] = useState("");
    const recorderRef = useRef<MediaRecorder | null>(null);
    const [recording, setRecording] = useState(false);
    const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
    const [audioSource, setAudioSource] = useState<"upload" | "recording">("upload");
    const [speechModel, setSpeechModel] = useState("");
    const [voice, setVoice] = useState("");
    const [speechSpeed, setSpeechSpeed] = useState("1");
    const [speechVolume, setSpeechVolume] = useState("1");
    const [optimizeTone, setOptimizeTone] = useState(true);
    const [connectingAudioId, setConnectingAudioId] = useState("");
    const [connectionMouseWorld, setConnectionMouseWorld] = useState({ x: 0, y: 0 });
    const [imagePrompt, setImagePrompt] = useState("");
    const [roleImageModel, setRoleImageModel] = useState("");
    const [imageResolution, setImageResolution] = useState("2K");
    const [imageAspectRatio, setImageAspectRatio] = useState("16:9");
    const [personReferenceAssetId, setPersonReferenceAssetId] = useState("");
    const [backgroundReferenceAssetId, setBackgroundReferenceAssetId] = useState("");
    const [assetPickerTarget, setAssetPickerTarget] = useState<"image" | "person" | "background" | null>(null);
    const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
    const [hiddenAudioRequestIds, setHiddenAudioRequestIds] = useState<Set<string>>(new Set());
    const [optimisticSegments, setOptimisticSegments] = useState<Record<string, KouboSegment>>({});
    const [optimisticAudioNodes, setOptimisticAudioNodes] = useState<KouboAudioNode[]>([]);
    const [optimisticAudioImageLinks, setOptimisticAudioImageLinks] = useState<Record<string, string | null>>({});
    const [optimisticRoleImages, setOptimisticRoleImages] = useState<OptimisticRoleImage[]>([]);
    const [optimisticVideoCandidates, setOptimisticVideoCandidates] = useState<KouboVideoCandidate[]>([]);
    const [measuredNodeHeights, setMeasuredNodeHeights] = useState<Record<string, number>>({});
    const deleteOperationRef = useRef(0);
    const hiddenAudioRequestIdsRef = useRef<Set<string>>(new Set());
    const optimisticWorkspace = useMemo(() => workspace.data
        ? applyKouboUiState(workspace.data, hiddenNodeIds, hiddenAudioRequestIds, optimisticSegments, optimisticAudioNodes, optimisticAudioImageLinks, optimisticRoleImages, optimisticVideoCandidates)
        : null, [hiddenAudioRequestIds, hiddenNodeIds, optimisticAudioImageLinks, optimisticAudioNodes, optimisticRoleImages, optimisticSegments, optimisticVideoCandidates, workspace.data]);
    const clearOptimisticAudioImageLink = useCallback((audioId: string, expectedImageId: string | null) => {
        setOptimisticAudioImageLinks((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, audioId) || current[audioId] !== expectedImageId) return current;
            const next = { ...current };
            delete next[audioId];
            return next;
        });
    }, []);
    const linkAudioToImage = useCallback(async (audioId: string, imageId: string) => {
        setOptimisticAudioImageLinks((current) => ({ ...current, [audioId]: imageId }));
        try {
            await linkKouboAudioImage(audioId, imageId);
            await workspace.refetch();
            clearOptimisticAudioImageLink(audioId, imageId);
            message.success("角色口播图已连接");
        } catch (error) {
            clearOptimisticAudioImageLink(audioId, imageId);
            message.error(error instanceof Error ? error.message : "角色口播图连接失败");
        }
    }, [clearOptimisticAudioImageLink, workspace.refetch]);
    const handleNodeHeightChange = useCallback((nodeId: string, height: number) => {
        setMeasuredNodeHeights((current) => current[nodeId] === height ? current : { ...current, [nodeId]: height });
    }, []);
    const voiceOptions = useMemo(() => (voices.data || []).filter((item) => item.state === "Active" && item.speakerId.startsWith("S_")).map((item) => ({ value: item.speakerId, label: item.alias || item.speakerId })), [voices.data]);
    const effectiveSpeechModel = speechModels.some((item) => item.value === speechModel) ? speechModel : speechModels[0]?.value || "";
    const effectiveVoice = voiceOptions.some((item) => item.value === voice) ? voice : voiceOptions[0]?.value || "";
    const effectiveRoleImageModel = roleImageModels.some((item) => item.value === roleImageModel) ? roleImageModel : roleImageModels[0]?.value || "";
    const effectiveVideoModel = videoModels[0]?.value || "";
    const roleImageSizePresets = useMemo(() => imageSizePresetsForModel(effectiveRoleImageModel), [effectiveRoleImageModel]);
    const roleImageResolutionOptions = useMemo(() => Object.keys(roleImageSizePresets).map((value) => ({ value, label: value })), [roleImageSizePresets]);
    const effectiveImageResolution = roleImageSizePresets[imageResolution] ? imageResolution : roleImageResolutionOptions[0]?.value || "";
    const roleImageRatioOptions = useMemo(() => Object.keys(roleImageSizePresets[effectiveImageResolution] || { auto: "自动" }).map((value) => ({ value, label: value === "auto" ? "自动" : value })), [effectiveImageResolution, roleImageSizePresets]);
    const effectiveImageAspectRatio = roleImageSizePresets[effectiveImageResolution]?.[imageAspectRatio] ? imageAspectRatio : roleImageRatioOptions[0]?.value || "auto";
    const personReferenceAsset = useQuery({
        queryKey: ["cloud-asset", personReferenceAssetId],
        queryFn: () => getCloudAsset(personReferenceAssetId),
        enabled: Boolean(personReferenceAssetId),
        staleTime: 300_000,
    });
    const backgroundReferenceAsset = useQuery({
        queryKey: ["cloud-asset", backgroundReferenceAssetId],
        queryFn: () => getCloudAsset(backgroundReferenceAssetId),
        enabled: Boolean(backgroundReferenceAssetId),
        staleTime: 300_000,
    });
    const roleImagePromptReferences = useMemo<CanvasResourceReference[]>(() => [
        ...(personReferenceAssetId ? [{
            id: "koubo-person-reference",
            nodeId: "koubo-person-reference",
            kind: "image" as const,
            label: "人物参考",
            title: personReferenceAsset.data?.title || "人物参考",
            previewUrl: personReferenceAsset.data?.url,
            active: true,
        }] : []),
        ...(backgroundReferenceAssetId ? [{
            id: "koubo-background-reference",
            nodeId: "koubo-background-reference",
            kind: "image" as const,
            label: "背景参考",
            title: backgroundReferenceAsset.data?.title || "背景参考",
            previewUrl: backgroundReferenceAsset.data?.url,
            active: true,
        }] : []),
    ], [backgroundReferenceAsset.data?.title, backgroundReferenceAsset.data?.url, backgroundReferenceAssetId, personReferenceAsset.data?.title, personReferenceAsset.data?.url, personReferenceAssetId]);
    const createAndLinkRoleImage = useCallback(async (audioId: string) => {
        const clientRequestId = crypto.randomUUID();
        const optimisticId = `optimistic-${clientRequestId}`;
        const optimistic: OptimisticRoleImage = {
            audioId,
            image: {
                id: optimisticId,
                projectId,
                sourceType: "empty",
                assetId: null,
                prompt: "",
                aspectRatio: "16:9",
                status: "draft",
                clientRequestId,
            },
        };
        setOptimisticRoleImages((current) => [...current, optimistic]);
        setSelectedNodeIds(new Set([`koubo-image-${optimisticId}`]));
        setSelectedGroup(`image-${optimisticId}`);
        setImagePrompt("");
        try {
            const image = await createKouboImageNode(projectId, audioId);
            await workspace.refetch();
            setSelectedNodeIds(new Set([`koubo-image-${image.id}`]));
            setSelectedGroup(`image-${image.id}`);
            message.success("角色口播图节点已创建并连接");
        } catch (error) {
            setSelectedNodeIds((current) => current.has(`koubo-image-${optimisticId}`) ? new Set([`koubo-audio-${audioId}`]) : current);
            setSelectedGroup((current) => current === `image-${optimisticId}` ? `audio-${audioId}` : current);
            message.error(error instanceof Error ? error.message : "角色口播图节点创建失败");
        } finally {
            setOptimisticRoleImages((current) => current.filter((item) => item.image.id !== optimisticId));
        }
    }, [projectId, workspace.refetch]);
    useEffect(() => {
        if (!initialization || !initializeProject.data) return;
        queryClient.setQueryData(contentQueryKeys.project(projectId), initializeProject.data);
        void queryClient.invalidateQueries({ queryKey: contentQueryKeys.projects });
        navigate(location.pathname, { replace: true });
    }, [initialization, initializeProject.data, location.pathname, navigate, projectId, queryClient]);
    useEffect(() => subscribeKouboWorkspace(projectId, () => void workspace.refetch()), [projectId, workspace.refetch]);
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!["Backspace", "Delete"].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
            const target = event.target instanceof Element ? event.target : null;
            if (
                shouldIgnoreCanvasKeyboardShortcut(event.target, event.key)
                || target?.closest("button,a,.ant-modal,.ant-drawer,.ant-popover,.ant-dropdown,.ant-select-dropdown")
                || !workspace.data
                || (!selectedNodeIds.size && !selectedConnectionId)
            ) return;
            const connections = kouboCanvasFlow(optimisticWorkspace || workspace.data, new Set()).edges.map((edge) => edge.connection);
            if (selectedConnectionId) {
                const connection = connections.find((item) => item.id === selectedConnectionId);
                const audioPrefix = "koubo-audio-";
                const imagePrefix = "koubo-image-";
                if (connection?.fromNodeId.startsWith(audioPrefix) && connection.toNodeId.startsWith(imagePrefix)) {
                    event.preventDefault();
                    const operationId = ++deleteOperationRef.current;
                    const audioId = connection.fromNodeId.slice(audioPrefix.length);
                    const imageId = connection.toNodeId.slice(imagePrefix.length);
                    setSelectedConnectionId(null);
                    setOptimisticAudioImageLinks((current) => ({ ...current, [audioId]: null }));
                    void unlinkKouboAudioImage(audioId, imageId)
                        .then(async () => {
                            await workspace.refetch();
                            clearOptimisticAudioImageLink(audioId, null);
                            message.success("首帧连接已解除");
                        })
                        .catch((error) => {
                            clearOptimisticAudioImageLink(audioId, null);
                            if (deleteOperationRef.current === operationId) setSelectedConnectionId(connection.id);
                            message.error(error instanceof Error ? error.message : "首帧连接解除失败");
                        });
                    return;
                }
                setSelectedConnectionId(null);
            }
            const deletableSelection = new Set([...selectedNodeIds].filter((id) => id !== "koubo-start"));
            const nodeIds = [...kouboCascadeSelectionIds(deletableSelection, connections)];
            if (!nodeIds.length) return;
            const persistedNodeIds = new Set([
                ...workspace.data.scriptGroups.map((group) => `koubo-script-group-${group.id}`),
                ...workspace.data.segments.map((segment) => `koubo-segment-${segment.id}`),
                ...workspace.data.audioNodes.map((audio) => `koubo-audio-${audio.id}`),
                ...workspace.data.imageResults.map((image) => `koubo-image-${image.id}`),
                ...workspace.data.videoCandidates.map((video) => `koubo-video-${video.id}`),
            ]);
            const databaseNodeIds = nodeIds.filter((id) => persistedNodeIds.has(id));
            const audioClientRequestIds = nodeIds.flatMap((id) => {
                if (!id.startsWith("koubo-audio-")) return [];
                const requestId = optimisticWorkspace?.audioNodes.find((audio) => `koubo-audio-${audio.id}` === id)?.clientRequestId;
                return requestId ? [requestId] : [];
            });
            const selectionSnapshot = new Set(selectedNodeIds);
            const groupSnapshot = selectedGroup;
            const connectionSnapshot = selectedConnectionId;
            const operationId = ++deleteOperationRef.current;
            event.preventDefault();
            setHiddenNodeIds((current) => new Set([...current, ...nodeIds]));
            if (audioClientRequestIds.length) {
                const next = new Set([...hiddenAudioRequestIdsRef.current, ...audioClientRequestIds]);
                hiddenAudioRequestIdsRef.current = next;
                setHiddenAudioRequestIds(next);
            }
            setOptimisticAudioNodes((current) => current.filter((node) => !nodeIds.includes(`koubo-audio-${node.id}`)));
            setOptimisticRoleImages((current) => current.filter((item) => !nodeIds.includes(`koubo-image-${item.image.id}`) && !nodeIds.includes(`koubo-audio-${item.audioId}`)));
            setOptimisticVideoCandidates((current) => current.filter((node) => !nodeIds.includes(`koubo-video-${node.id}`)));
            setSelectedNodeIds(new Set());
            setSelectedGroup("");
            setContextMenu(null);
            void (databaseNodeIds.length || audioClientRequestIds.length ? deleteKouboNodes(projectId, databaseNodeIds, audioClientRequestIds) : Promise.resolve())
                .then(async () => {
                    if (databaseNodeIds.length || audioClientRequestIds.length) await workspace.refetch();
                    message.success(nodeIds.length > 1 ? `已删除 ${nodeIds.length} 个节点` : "节点已删除");
                })
                .catch((error) => {
                    setHiddenNodeIds((current) => {
                        const next = new Set(current);
                        for (const id of nodeIds) if (!id.startsWith("koubo-audio-")) next.delete(id);
                        return next;
                    });
                    if (deleteOperationRef.current === operationId) {
                        setSelectedNodeIds(selectionSnapshot);
                        setSelectedGroup(groupSnapshot);
                        setSelectedConnectionId(connectionSnapshot);
                    }
                    message.error(error instanceof Error ? error.message : "节点删除失败");
                });
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [clearOptimisticAudioImageLink, optimisticWorkspace, projectId, selectedConnectionId, selectedGroup, selectedNodeIds, workspace.data, workspace.refetch]);
    useEffect(() => {
        if (!connectingAudioId) return;
        const screenToWorld = (clientX: number, clientY: number) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return null;
            return {
                x: (clientX - rect.left - viewport.x) / viewport.k,
                y: (clientY - rect.top - viewport.y) / viewport.k,
            };
        };
        const handleMouseMove = (event: globalThis.MouseEvent) => {
            const point = screenToWorld(event.clientX, event.clientY);
            if (point) setConnectionMouseWorld(point);
        };
        const handleMouseUp = (event: globalThis.MouseEvent) => {
            const audioId = connectingAudioId;
            setConnectingAudioId("");
            const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-node-id]") : null;
            const targetNodeId = target?.dataset.nodeId || "";
            const imageId = targetNodeId.startsWith("koubo-image-") ? targetNodeId.slice("koubo-image-".length) : "";
            if (imageId) {
                void linkAudioToImage(audioId, imageId);
                return;
            }
            if (targetNodeId) return;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
            void createAndLinkRoleImage(audioId);
        };
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [connectingAudioId, createAndLinkRoleImage, linkAudioToImage, viewport]);

    if (initialization && initializeProject.isError) {
        return (
            <SystemState
                icon={workflowType === "course-video" ? <GraduationCap className="size-6" /> : <Mic2 className="size-6" />}
                title={`${workflowDefinition.label}项目创建失败`}
                description={initializeProject.error instanceof Error ? initializeProject.error.message : "项目初始化失败，请重试。"}
                actions={<div className="flex gap-2"><Button onClick={() => navigate("/content")}>返回我的工作台</Button><Button type="primary" onClick={() => void initializeProject.refetch()}>重新创建</Button></div>}
            />
        );
    }
    if ((initialization && initializeProject.isPending) || project.isLoading || workspace.isLoading) {
        return <WorkspacePage><div className="flex flex-1 items-center justify-center"><Skeleton active className="max-w-xl" /></div></WorkspacePage>;
    }
    if (project.isError || workspace.isError || project.data?.workflowType !== workflowType || !workspace.data) {
        return <SystemState icon={workflowType === "course-video" ? <GraduationCap className="size-6" /> : <Mic2 className="size-6" />} title="项目不可用" description="项目不存在或你没有访问权限。" actions={<Button type="primary" onClick={() => navigate("/content")}>返回我的工作台</Button>} />;
    }
    const data = optimisticWorkspace!;
    const status = deriveKouboStatus(data);
    const selectedScriptGroup = data.scriptGroups.find((group) => selectedGroup === `script-group-${group.id}`)
        || (selectedGroup === "script" ? data.scriptGroups[0] : undefined);
    const selectedSegment = data.segments.find((segment) => selectedGroup === `segment-${segment.id}`);
    const audioTargetSegment = data.segments.find((segment) => segment.id === audioTargetSegmentId);
    const selectedAudio = data.audioNodes.find((audio) => selectedGroup === `audio-${audio.id}`);
    const selectedImage = data.imageResults.find((image) => selectedGroup === `image-${image.id}`);
    const selectedVideo = data.videoCandidates.find((video) => selectedGroup === `video-${video.id}`);
    const courseScriptModel = courseScriptModelOption(config, data.courseScriptModelId);
    const scriptTextModel = workflowType === "course-video" ? courseScriptModel : config.textModel;
    const generationNodeIds = scriptGenerationTasks.map((task) => `koubo-script-generation-${task.id}`);
    const segmentFlow = kouboCanvasFlow(data, collapsedScriptGroups, generationNodeIds, measuredNodeHeights, workflowCopy);
    const startCanvasNode = segmentFlow.startCanvas;
    const scriptGenerationNodes = scriptGenerationTasks.map((task, index) => ({
        task,
        canvas: segmentFlow.pendingScriptCanvases[index],
        content: kouboGenerationContentNode(`koubo-script-generation-${task.id}`, projectId, task.prompt, task.mode, task.job, workflowCopy),
    }));
    const flowConnections: Array<{ connection: CanvasConnection; from: CanvasNodeData; to: CanvasNodeData }> = [
        ...scriptGenerationNodes.map(({ task, canvas }) => ({
            connection: { id: `start-script-generation-${task.id}`, fromNodeId: startCanvasNode.id, toNodeId: canvas.id },
            from: startCanvasNode,
            to: canvas,
        })),
        ...segmentFlow.edges,
    ];
    const activeScriptPrompt = workflowType === "course-video"
        ? courseScriptPrompt({ topic: courseTopic, audience: courseAudience, extraPrompt: courseExtraPrompt })
        : scriptText;
    const refresh = () => workspace.refetch();
    const run = async (key: string, action: () => Promise<unknown>) => {
        setBusy(key);
        try { await action(); await refresh(); message.success("任务已提交"); }
        catch (error) { message.error(error instanceof Error ? error.message : "操作失败"); }
        finally { setBusy(""); }
    };
    const generateTts = async (segmentIds: string[], key: string, targetAudio?: KouboAudioNode) => {
        if (!segmentIds.length) return;
        if (targetAudio && (segmentIds.length !== 1 || targetAudio.segmentId !== segmentIds[0])) return;
        const requests = segmentIds.map((segmentId) => {
            const clientRequestId = crypto.randomUUID();
            const segment = data.segments.find((item) => item.id === segmentId);
            return {
                segmentId,
                clientRequestId,
                toneOptimizationRequestId: optimizeTone ? crypto.randomUUID() : undefined,
                node: targetAudio ? {
                    ...targetAudio,
                    assetId: null,
                    url: undefined,
                    durationMs: null,
                    sourceSegmentRevision: segment?.revision ?? null,
                    status: "queued" as const,
                    generationStage: "queued" as const,
                    generationId: null,
                    clientRequestId,
                    errorMessage: null,
                } : {
                    id: `optimistic-${clientRequestId}`,
                    projectId,
                    segmentId,
                    parentAudioNodeId: null,
                    segmentationRunId: null,
                    segmentIndex: null,
                    assetId: null,
                    durationMs: null,
                    sourceType: "generated" as const,
                    sourceStartMs: null,
                    sourceEndMs: null,
                    sourceSegmentRevision: segment?.revision ?? null,
                    status: "queued" as const,
                    generationStage: "queued" as const,
                    imageResultId: null,
                    generationId: null,
                    clientRequestId,
                    errorMessage: null,
                },
            };
        });
        let failedNodeIds = new Set<string>();
        setOptimisticAudioNodes((current) => [
            ...current.filter((node) => !requests.some((request) => request.node.id === node.id)),
            ...requests.map((request) => request.node),
        ]);
        setBusy(key);
        try {
            const results = await Promise.allSettled(requests.map(async (request) => {
                const actionRequest = {
                    action: "generate-tts",
                    projectId,
                    segmentId: request.segmentId,
                    modelId: modelId(effectiveSpeechModel),
                    voice: effectiveVoice,
                    speed: Number(normalizeAudioSpeedValue(speechSpeed)),
                    volume: Number(normalizeAudioVolumeValue(speechVolume)),
                    clientRequestId: request.clientRequestId,
                    optimizeTone,
                    ...(request.toneOptimizationRequestId ? { toneOptimizationRequestId: request.toneOptimizationRequestId } : {}),
                    ...(targetAudio ? { audioNodeId: targetAudio.id } : {}),
                };
                const setRequestStage = (generationStage: "tone_optimizing" | "speech_generating") => setOptimisticAudioNodes((current) => current.map((node) =>
                    node.clientRequestId === request.clientRequestId ? { ...node, generationStage } : node));
                const response = await runKouboAction<{ toneOptimizationJob?: GenerationJob; job?: GenerationJob }>(actionRequest);
                if (!response.toneOptimizationJob || ["succeeded", "failed", "canceled"].includes(response.toneOptimizationJob.status)) {
                    if (response.job && ["queued", "running"].includes(response.job.status)) setRequestStage("speech_generating");
                    return response;
                }
                setRequestStage("tone_optimizing");
                try {
                    await waitForGeneration(response.toneOptimizationJob.id);
                } catch (error) {
                    if (hiddenAudioRequestIdsRef.current.has(request.clientRequestId)) return response;
                    await runKouboAction(actionRequest).catch(() => undefined);
                    throw error;
                }
                if (hiddenAudioRequestIdsRef.current.has(request.clientRequestId)) return response;
                setRequestStage("speech_generating");
                return runKouboAction(actionRequest);
            }));
            failedNodeIds = new Set(results.flatMap((result, index) =>
                result.status === "rejected" ? [requests[index].node.id] : []));
            await refresh();
            const deletedRequestIds = requests.filter((request) => hiddenAudioRequestIdsRef.current.has(request.clientRequestId)).map((request) => request.clientRequestId);
            if (deletedRequestIds.length) await deleteKouboNodes(projectId, [], deletedRequestIds).catch(() => undefined);
            const failed = results.filter((result) => result.status === "rejected");
            if (failed.length) message.error(`已提交 ${requests.length} 段，${failed.length} 段失败，可在失败节点单独重试`);
            else message.success(requests.length > 1 ? `已提交 ${requests.length} 个音频任务` : "音频任务已提交");
        } catch (error) {
            await refresh().catch(() => undefined);
            message.error(error instanceof Error ? error.message : "音频生成失败");
        } finally {
            const optimisticIds = new Set(requests.map((request) => request.node.id));
            setOptimisticAudioNodes((current) => current.flatMap((node) => {
                if (!optimisticIds.has(node.id)) return [node];
                return failedNodeIds.has(node.id) ? [{ ...node, status: "failed" as const }] : [];
            }));
            setBusy("");
        }
    };
    const generateSegmentTts = (segmentId: string) => void generateTts([segmentId], `tts-${segmentId}`);
    const regenerateAudio = (audio: KouboAudioNode) => {
        if (audio.sourceType === "generated" && audio.segmentId) {
            void generateTts([audio.segmentId], `tts-audio-${audio.id}`, audio);
        }
    };
    const selectGroup = (group: string) => {
        setSelectedGroup(group);
        const segment = data.segments.find((item) => group === `segment-${item.id}`);
        if (segment) {
            setEditingText(segment.text);
            setEditingDirection(segment.voiceDirection);
        }
    };
    const selectFlowNode = (node: (typeof segmentFlow.nodes)[number], additive = false) => {
        const nodeIds = node.kind === "script-group"
            ? kouboGroupSelectionIds(data, node.sourceId!)
            : new Set([node.id]);
        setSelectedNodeIds((current) => {
            if (!additive) return nodeIds;
            const next = new Set(current);
            const remove = [...nodeIds].every((id) => next.has(id));
            for (const id of nodeIds) remove ? next.delete(id) : next.add(id);
            return next;
        });
        setSelectedConnectionId(null);
        selectGroup(node.kind === "script-group" ? `script-group-${node.sourceId}` : `${node.kind}-${node.sourceId}`);
        if (node.kind === "image") {
            const image = data.imageResults.find((item) => item.id === node.sourceId);
            setImagePrompt(String(image?.prompt || ""));
            setImageAspectRatio(String(image?.aspectRatio || "16:9"));
            setPersonReferenceAssetId(String(image?.personReferenceAssetId || ""));
            setBackgroundReferenceAssetId(String(image?.backgroundReferenceAssetId || ""));
        }
    };
    const downloadSelectedNodes = async () => {
        const selected = kouboDownloadSelection(data, selectedNodeIds);
        const audioAssets = await Promise.all(selected.audios.map(async (audio) => ({ audio, asset: await getCloudAsset(audio.assetId) })));
        const nodes: CanvasNodeData[] = [
            ...selected.texts.map((text) => ({
                ...kouboCanvasNode(`download-text-${text.id}`, text.title, 0, 0, 280),
                type: CanvasNodeType.Text,
                metadata: { content: text.text },
            })),
            ...audioAssets.flatMap(({ audio, asset }) => asset.url ? [{
                ...kouboCanvasNode(`download-audio-${audio.id}`, audio.title, 0, 0, 280),
                type: CanvasNodeType.Audio,
                metadata: { content: asset.url, mimeType: asset.mime_type || "audio/mpeg" },
            }] : []),
        ];
        if (!nodes.length) throw new Error("当前选区没有可下载的文本或语音");
        await exportCanvasResultNodes(nodes);
    };
    const openScript = (mode: "ai" | "pasted") => {
        setSelectedGroup("script");
        setScriptMode(mode);
        setScriptSegmented(true);
        setScriptText("");
        setScriptDirection("");
        setScriptOpen(true);
    };
    const openAudioEntry = (source: "upload" | "recording") => {
        setSelectedGroup("audio");
        setAudioTargetSegmentId("");
        setAudioSource(source);
        setAudioOpen(true);
    };
    const openSegmentAudio = (segmentId: string, source: "upload" | "recording" = "upload") => {
        setSelectedGroup(`segment-${segmentId}`);
        setAudioTargetSegmentId(segmentId);
        setAudioSource(source);
        setAudioOpen(true);
    };
    const processAudioInput = async (blob: Blob, source: "upload" | "recording") => {
        setAudioProcessing(true);
        let context: AudioContext | null = null;
        try {
            context = new AudioContext();
            const decoded = await context.decodeAudioData(await blob.arrayBuffer());
            const segment = data.segments.find((item) => item.id === audioTargetSegmentId);
            const uploaded = await uploadMediaFile(blob, "audio");
            await registerKouboAudioNode({
                projectId,
                segmentId: segment?.id || null,
                assetId: uploaded.storageKey,
                durationMs: Math.round(decoded.duration * 1000),
                sourceType: source === "upload" ? "uploaded" : "recorded",
                sourceSegmentRevision: segment?.revision || null,
                clientRequestId: crypto.randomUUID(),
            });
            await refresh();
            setAudioOpen(false);
            message.success(source === "upload" ? "音频节点已创建" : "录音节点已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : source === "upload" ? "音频上传失败" : "录音处理失败");
        } finally {
            await context?.close();
            setAudioProcessing(false);
        }
    };
    const toggleRecording = async () => {
        if (recorderRef.current && recording) {
            recorderRef.current.stop();
            setRecording(false);
            return;
        }
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            message.error("无法访问麦克风，请检查浏览器权限");
            return;
        }
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
            recorderRef.current = null;
            setRecording(false);
            setRecordingStream(null);
            try {
                await processAudioInput(new Blob(chunks, { type: recorder.mimeType }), "recording");
            } catch {
                message.error("录音处理失败");
            }
        };
        recorderRef.current = recorder;
        recorder.start();
        setRecordingStream(stream);
        setRecording(true);
    };
    const submitScript = async () => {
        if (scriptMode === "ai" && workflowType === "course-video" && !courseTopic.trim()) {
            message.warning("请填写课程主题");
            return;
        }
        if (scriptMode === "ai" && workflowType === "course-video" && !courseAudience.trim()) {
            message.warning("请填写目标受众");
            return;
        }
        if ((scriptMode === "pasted" || workflowType === "koubo-video") && !scriptText.trim()) {
            message.warning(scriptMode === "ai" ? "请先描述口播主题、受众和表达目标" : "请先粘贴文案");
            return;
        }
        if (scriptMode === "pasted" && !scriptDirection.trim()) {
            message.warning("请填写整篇语气指导");
            return;
        }
        if (scriptMode === "pasted") {
            const voiceDirection = scriptDirection.trim();
            const input = {
                sourceType: "pasted" as const,
                sourceInput: JSON.stringify({ originalText: scriptText, voiceDirection }),
                originalText: scriptText,
                segments: [{ text: scriptText, voiceDirection }],
            };
            setScriptOpen(false);
            setScriptImporting(true);
            try {
                await createKouboScriptGroup({ projectId, ...input });
                await refresh();
                message.success("文案已导入");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "文案导入失败");
            } finally {
                setScriptImporting(false);
            }
            return;
        }
        if (!scriptTextModel) {
            message.warning("当前课程项目没有可用的课程文案模型");
            return;
        }
        const clientRequestId = crypto.randomUUID();
        const generationPrompt = activeScriptPrompt;
        const request = {
            action: "generate-script",
            projectId,
            modelId: modelId(scriptTextModel),
            prompt: generationPrompt,
            outputMode: scriptSegmented ? "segments" : "full",
            clientRequestId,
        };
        setScriptOpen(false);
        setScriptGenerationTasks((current) => [...current, {
            id: clientRequestId,
            prompt: generationPrompt,
            mode: "ai",
            job: { id: clientRequestId, status: "queued" },
        }]);
        const updateTaskJob = (job: GenerationJob) => setScriptGenerationTasks((current) => current.map((task) =>
            task.id === clientRequestId ? { ...task, job } : task));
        try {
            const response = await completeScriptAction(request, updateTaskJob);
            if (!response.segments?.length) throw new Error("生成结果未形成有效文案分段");
            await refresh();
            setScriptGenerationTasks((current) => current.filter((task) => task.id !== clientRequestId));
            message.success(workflowCopy.generatedMessage);
        } catch (error) {
            updateTaskJob({ id: clientRequestId, status: "failed", error_message: error instanceof Error ? error.message : "文案生成失败" });
            message.error(error instanceof Error ? error.message : "文案生成失败");
        }
    };
    async function completeScriptAction(request: Record<string, unknown> & { action: string; projectId: string }, onJob?: (job: GenerationJob) => void) {
        let response = await runKouboAction<{ job: GenerationJob; segments?: unknown[]; segment?: unknown }>(request);
        onJob?.(response.job);
        while (!response.segments && !response.segment && (response.job.status === "queued" || response.job.status === "running")) {
            await waitForGeneration(response.job.id, undefined, undefined, undefined, onJob);
            response = await runKouboAction(request);
            onJob?.(response.job);
        }
        return response;
    }
    const regenerateScriptGroup = (groupId: string) => run(`regenerate-group-${groupId}`, async () => {
        const response = await completeScriptAction({
            action: "regenerate-script-group",
            projectId,
            scriptGroupId: groupId,
            modelId: modelId(scriptTextModel),
            clientRequestId: crypto.randomUUID(),
        });
        if (!response.segments?.length) throw new Error("文案组生成失败");
    });
    const optimizeScriptGroup = async (groupId: string, direction: string) => {
        const group = data.scriptGroups.find((item) => item.id === groupId);
        if (!group || group.sourceType !== "ai") return;
        const groupNodeId = `koubo-script-group-${groupId}`;
        const hiddenIds = [...kouboCascadeSelectionIds(
            new Set([groupNodeId]),
            segmentFlow.edges.map((edge) => edge.connection),
        )].filter((id) => id !== groupNodeId);
        setHiddenNodeIds((current) => new Set([...current, ...hiddenIds]));
        setSelectedNodeIds((current) => new Set([...current].filter((id) => !hiddenIds.includes(id))));
        setBusy(`optimize-group-${groupId}`);
        await nextCanvasPaint();
        try {
            const response = await completeScriptAction({
                action: "replace-script-group-input",
                projectId,
                scriptGroupId: groupId,
                sourceType: "ai",
                prompt: courseScriptGroupOptimizationPrompt(group.sourceInput, direction),
                outputMode: group.modelPromptBinding.purposeKey === "generate_full" ? "full" : "segments",
                modelId: modelId(scriptTextModel),
                clientRequestId: crypto.randomUUID(),
            });
            if (!response.segments?.length) throw new Error("课程文案组优化失败");
            await refresh();
            setOptimizingGroupId("");
            message.success("课程文案已优化");
        } catch (error) {
            try { await refresh(); } catch { /* Restore the local canvas even if refreshing also fails. */ }
            message.error(error instanceof Error ? error.message : "课程文案优化失败");
        } finally {
            setHiddenNodeIds((current) => {
                const next = new Set(current);
                for (const id of hiddenIds) next.delete(id);
                return next;
            });
            setBusy("");
        }
    };
    const regenerateSegment = (segmentId: string, direction?: string) => run(`regenerate-segment-${segmentId}`, async () => {
        const response = await completeScriptAction({
            action: "regenerate-segment",
            projectId,
            segmentId,
            modelId: modelId(scriptTextModel),
            clientRequestId: crypto.randomUUID(),
            ...(direction ? { direction } : {}),
        });
        if (!response.segment) throw new Error("本段文案生成失败");
    });
    const saveSelectedSegment = async () => {
        if (!selectedSegment || !editingText.trim()) return;
        if (editingText === selectedSegment.text && editingDirection === selectedSegment.voiceDirection) return;
        const previous = selectedSegment;
        const optimistic = { ...selectedSegment, text: editingText.trim(), voiceDirection: editingDirection.trim() };
        setOptimisticSegments((current) => ({ ...current, [optimistic.id]: optimistic }));
        setBusy("edit");
        try {
            await editKouboSegment({
                segmentId: optimistic.id,
                text: optimistic.text,
                voiceDirection: optimistic.voiceDirection,
                expectedRevision: previous.revision,
            });
            await refresh();
            message.success("任务已提交");
        } catch (error) {
            setEditingText(previous.text);
            setEditingDirection(previous.voiceDirection);
            message.error(error instanceof Error ? error.message : "口播文案保存失败");
        } finally {
            setOptimisticSegments((current) => {
                if (current[optimistic.id] !== optimistic) return current;
                const next = { ...current };
                delete next[optimistic.id];
                return next;
            });
            setBusy("");
        }
    };
    const selectedLabel = selectedSegment ? `文案 ${selectedSegment.position + 1}` : selectedAudio ? "音频节点" : selectedImage ? "角色口播图" : selectedVideo ? "口播视频" : selectedScriptGroup ? "文案组" : "项目";
    const selectedImageLinkedAudios = selectedImage ? data.audioNodes.filter((audio) => audio.imageResultId === selectedImage.id && audio.status === "ready" && audio.assetId) : [];
    const selectedDownloads = kouboDownloadSelection(data, selectedNodeIds);
    const selectedDownloadCount = selectedDownloads.texts.length + selectedDownloads.audios.length;
    const segmentsWithoutAudio = (groupId: string) => data.segments
        .filter((segment) => segment.scriptGroupId === groupId)
        .filter((segment) => !data.audioNodes.some((audio) =>
            audio.segmentId === segment.id
            && !audio.parentAudioNodeId
            && ["queued", "running", "ready"].includes(audio.status)))
        .map((segment) => segment.id);
    const segmentActions = selectedSegment ? (
        <>
            <Field label="文案"><Input.TextArea rows={7} value={editingText} onChange={(event) => setEditingText(event.target.value)} onBlur={() => void saveSelectedSegment()} aria-label="文案内容" /></Field>
            <Field label="语气"><Input.TextArea rows={3} value={editingDirection} onChange={(event) => setEditingDirection(event.target.value)} onBlur={() => void saveSelectedSegment()} aria-label="语气指导" /></Field>
            <Button className="w-full" type="primary" loading={busy === `tts-${selectedSegment.id}`} disabled={!effectiveSpeechModel || !effectiveVoice} onClick={() => generateSegmentTts(selectedSegment.id)}>生成本段音频</Button>
            <Button className="w-full" onClick={() => openSegmentAudio(selectedSegment.id)}>上传本段音频</Button>
            <Button className="w-full" onClick={() => openSegmentAudio(selectedSegment.id, "recording")}>录制本段音频</Button>
        </>
    ) : null;
    const scriptActions = selectedScriptGroup ? (
        <Button className="w-full" type="primary" loading={busy === "tts"} disabled={!effectiveSpeechModel || !effectiveVoice || !segmentsWithoutAudio(selectedScriptGroup.id).length} onClick={() => void generateTts(segmentsWithoutAudio(selectedScriptGroup.id), "tts")}>生成全部 TTS</Button>
    ) : null;
    const saveAudioSegments = async (input: AudioSegmentationSubmit) => {
        setBusy(`segment-audio-${input.parentNodeId}`);
        try {
            const uploaded = await Promise.all(input.segments.map(async (segment) => ({
                segment,
                asset: await uploadMediaFile(segment.blob, "audio"),
            })));
            await replaceKouboAudioSegments({
                parentAudioNodeId: input.parentNodeId,
                segmentationRunId: input.segmentationRunId,
                segments: uploaded.map(({ segment, asset }) => ({
                    assetId: asset.storageKey,
                    index: segment.index,
                    startMs: segment.startMs,
                    endMs: segment.endMs,
                    durationMs: segment.endMs - segment.startMs,
                })),
            });
            await refresh();
            message.success(`已生成 ${uploaded.length} 个独立音频节点`);
        } finally {
            setBusy("");
        }
    };
    const generateKouboImage = (imageResultId: string) => {
        const image = data.imageResults.find((item) => item.id === imageResultId);
        const isCurrent = selectedImage?.id === imageResultId;
        const prompt = isCurrent ? imagePrompt.trim() : image?.prompt || "";
        const personReference = isCurrent ? personReferenceAssetId : image?.personReferenceAssetId || "";
        const backgroundReference = isCurrent ? backgroundReferenceAssetId : image?.backgroundReferenceAssetId || "";
        const aspectRatio = isCurrent ? effectiveImageAspectRatio : image?.aspectRatio || "16:9";
        return run(`image-${imageResultId}`, () => runKouboAction({
            action: "generate-image",
            projectId,
            imageResultId,
            modelId: modelId(effectiveRoleImageModel),
            prompt,
            personReferenceAssetId: personReference || undefined,
            backgroundReferenceAssetId: backgroundReference || undefined,
            aspectRatio,
            size: imageSizeValue(roleImageSizePresets, effectiveImageResolution, aspectRatio),
            clientRequestId: crypto.randomUUID(),
        }));
    };
    const generateKouboVideos = async (imageResultId: string) => {
        const audioNodes = data.audioNodes.filter((audio) =>
            audio.imageResultId === imageResultId
            && audio.status === "ready"
            && Boolean(audio.assetId));
        if (!audioNodes.length) {
            message.warning("请先把至少一个已生成音频连接到当前角色口播图");
            return;
        }
        const requests = audioNodes.map((audio) => {
            const clientRequestId = crypto.randomUUID();
            return {
                audio,
                candidate: {
                    id: `optimistic-${clientRequestId}`,
                    projectId,
                    segmentId: audio.segmentId,
                    audioNodeId: audio.id,
                    imageResultId,
                    assetId: null,
                    sourceSegmentRevision: audio.sourceSegmentRevision,
                    status: "queued" as const,
                    selected: false,
                    generationId: null,
                    clientRequestId,
                    errorMessage: null,
                    progress: 0,
                },
            };
        });
        setOptimisticVideoCandidates((current) => [...current, ...requests.map((request) => request.candidate)]);
        setBusy(`videos-${imageResultId}`);
        const results = await Promise.allSettled(requests.map((request) => runKouboAction({
            action: "generate-video",
            projectId,
            audioNodeId: request.audio.id,
            imageResultId,
            modelId: modelId(effectiveVideoModel),
            aspectRatio: effectiveImageAspectRatio,
            clientRequestId: request.candidate.clientRequestId,
        })));
        await refresh().catch(() => undefined);
        const failedIds = new Set(results.flatMap((result, index) => result.status === "rejected" ? [requests[index].candidate.id] : []));
        const optimisticIds = new Set(requests.map((request) => request.candidate.id));
        setOptimisticVideoCandidates((current) => current.flatMap((candidate) => {
            if (!optimisticIds.has(candidate.id)) return [candidate];
            return failedIds.has(candidate.id) ? [{ ...candidate, status: "failed" as const }] : [];
        }));
        setBusy("");
        if (failedIds.size) message.error("视频生成任务提交失败");
        else message.success("视频生成任务已提交");
    };
    const regenerateKouboVideo = async (candidate: KouboVideoCandidate) => {
        if (!effectiveVideoModel) {
            message.warning("未配置 LTX 2.3 视频模型");
            return;
        }
        const clientRequestId = crypto.randomUUID();
        const optimisticCandidate: KouboVideoCandidate = {
            ...candidate,
            assetId: null,
            url: undefined,
            mimeType: undefined,
            status: "queued",
            selected: false,
            generationId: null,
            clientRequestId,
            errorMessage: null,
            progress: 0,
        };
        setOptimisticVideoCandidates((current) => [
            ...current.filter((item) => item.id !== candidate.id),
            optimisticCandidate,
        ]);
        setBusy(`video-${candidate.id}`);
        try {
            await runKouboAction({
                action: "generate-video",
                projectId,
                videoCandidateId: candidate.id,
                audioNodeId: candidate.audioNodeId,
                imageResultId: candidate.imageResultId,
                modelId: modelId(effectiveVideoModel),
                clientRequestId,
            });
            await refresh();
            message.success("口播视频已重新提交");
        } catch (error) {
            await refresh().catch(() => undefined);
            message.error(error instanceof Error ? error.message : "口播视频重新生成失败");
        } finally {
            setOptimisticVideoCandidates((current) => current.filter((item) => item.id !== candidate.id));
            setBusy("");
        }
    };
    const downloadKouboVideo = async (candidate: KouboVideoCandidate, title: string) => {
        if (candidate.status !== "ready" || !candidate.url) {
            message.warning("视频尚未生成完成");
            return;
        }
        setBusy(`download-video-${candidate.id}`);
        try {
            await exportCanvasResultNodes([{
                ...kouboCanvasNode(`download-video-${candidate.id}`, title, 0, 0, 280),
                type: CanvasNodeType.Video,
                metadata: {
                    content: candidate.url,
                    mimeType: candidate.mimeType || "video/mp4",
                },
            }]);
            message.success("视频已下载");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "视频下载失败");
        } finally {
            setBusy("");
        }
    };
    const downloadKouboAudio = async (audio: KouboAudioNode, title: string) => {
        if (audio.status !== "ready" || !audio.url) {
            message.warning("音频尚未生成完成");
            return;
        }
        setBusy(`download-audio-${audio.id}`);
        try {
            await exportCanvasResultNodes([{
                ...kouboCanvasNode(`download-audio-${audio.id}`, title, 0, 0, 280),
                type: CanvasNodeType.Audio,
                metadata: {
                    content: audio.url,
                    mimeType: audio.mimeType || "audio/mpeg",
                },
            }]);
            message.success("音频已下载");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "音频下载失败");
        } finally {
            setBusy("");
        }
    };
    const uploadKouboImage = async (imageResultId: string, file: File) => {
        await run(`image-upload-${imageResultId}`, async () => {
            const asset = await uploadImage(file, { compress: true });
            await registerKouboImageAsset(imageResultId, asset.storageKey);
        });
        return false;
    };
    const uploadKouboReference = async (target: "person" | "background", file: File) => {
        const label = target === "person" ? "人物参考" : "背景参考";
        setBusy(`image-upload-${target}`);
        try {
            const asset = await uploadImage(file, { compress: true });
            if (target === "person") setPersonReferenceAssetId(asset.storageKey);
            else setBackgroundReferenceAssetId(asset.storageKey);
            message.success(`${label}已上传`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : `${label}上传失败`);
        } finally {
            setBusy("");
        }
        return false;
    };
    const chooseKouboAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind !== "image" || !assetPickerTarget) return;
        if (!payload.storageKey) {
            message.error("该图片尚未同步到云端，请先上传后再选择");
            return;
        }
        const target = assetPickerTarget;
        setAssetPickerTarget(null);
        if (target === "person") {
            setPersonReferenceAssetId(payload.storageKey);
            return;
        }
        if (target === "background") {
            setBackgroundReferenceAssetId(payload.storageKey);
            return;
        }
        if (selectedImage) await run(`image-asset-${selectedImage.id}`, () => registerKouboImageAsset(selectedImage.id, payload.storageKey!));
    };
    const pickerTitle = assetPickerTarget === "person"
        ? "选择人物参考"
        : assetPickerTarget === "background"
            ? "选择背景参考"
            : "选择角色口播图";

    return (
        <WorkspacePage
            topBar={
                <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-[var(--surface-raised)] px-4">
                    <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/content")}>返回我的工作台</Button>
                    <Select aria-label={`切换${workflowDefinition.label}项目`} className="min-w-0 max-w-56 flex-1" value={projectId} onChange={(value) => navigate(`/content/${workflowDefinition.routeSegment}/${value}`)} options={(projects.data || []).filter((item) => item.workflowType === workflowType).map((item) => ({ value: item.id, label: item.title }))} />
                    <div className="ml-auto flex items-center gap-2">
                        <Tag>{statusLabels[status]}</Tag>
                        <Button type="text" aria-label="查看并标记项目通知已读" onClick={() => run("notice", () => markKouboNoticeSeen(projectId))}>通知{data.noticeUnread ? " · 未读" : ""}</Button>
                        <Button type="text">项目动作</Button>
                    </div>
                </header>
            }
        >
            <div className="relative flex min-w-0 flex-1">
                <CrocoCanvas
                    containerRef={canvasRef}
                    viewport={viewport}
                    onViewportChange={setViewport}
                    onCanvasDeselect={() => {
                        setSelectedNodeIds(new Set());
                        setSelectedConnectionId(null);
                        setContextMenu(null);
                        setConnectingAudioId("");
                    }}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        setContextMenu(null);
                    }}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", zIndex: 0 }}>
                        {flowConnections.map(({ connection, from, to }) => {
                            const selectable = connection.fromNodeId.startsWith("koubo-audio-") && connection.toNodeId.startsWith("koubo-image-");
                            return <ConnectionPath
                                key={connection.id}
                                connection={connection}
                                from={from}
                                to={to}
                                active={selectedConnectionId === connection.id}
                                onSelect={() => {
                                    if (!selectable) return;
                                    setSelectedConnectionId(connection.id);
                                    setSelectedNodeIds(new Set());
                                    setContextMenu(null);
                                }}
                            />;
                        })}
                        {connectingAudioId ? <ActiveConnectionPath
                            node={segmentFlow.nodes.find((node) => node.kind === "audio" && node.sourceId === connectingAudioId)?.canvas}
                            handle={{ nodeId: `koubo-audio-${connectingAudioId}`, handleType: "source" }}
                            mouseWorld={connectionMouseWorld}
                        /> : null}
                    </svg>
                            <div className="absolute" style={{ left: startCanvasNode.position.x, top: startCanvasNode.position.y }}><KouboStartNode copy={workflowCopy} onHeightChange={handleNodeHeightChange} onAi={() => openScript("ai")} onPaste={() => openScript("pasted")} onUpload={() => openAudioEntry("upload")} onRecord={() => openAudioEntry("recording")} /></div>
                            {scriptGenerationNodes.map(({ task, canvas, content }) => <ContentTreeNode key={task.id} node={content} x={canvas.position.x} y={canvas.position.y} selected={selectedGroup === `script-generation-${task.id}`} onSelect={() => selectGroup(`script-generation-${task.id}`)} onHeightChange={handleNodeHeightChange} jobs={[task.job]} />)}
                            {segmentFlow.nodes.map((node) => {
                                const audio = node.kind === "audio" ? data.audioNodes.find((item) => item.id === node.sourceId) : undefined;
                                const video = node.kind === "video" ? data.videoCandidates.find((item) => item.id === node.sourceId) : undefined;
                                const optimizableCourseGroup = node.kind === "script-group"
                                    && workflowType === "course-video"
                                    && data.scriptGroups.some((group) => group.id === node.sourceId && group.sourceType === "ai");
                                return <ContentTreeNode
                                    key={node.id}
                                    node={node.content}
                                    x={node.canvas.position.x}
                                    y={node.canvas.position.y}
                                    selected={selectedNodeIds.has(node.id)}
                                    onHeightChange={handleNodeHeightChange}
                                    onSelect={(event) => selectFlowNode(node, Boolean(event && (event.shiftKey || event.metaKey || event.ctrlKey)))}
                                    onContextMenu={(event) => {
                                        if (!selectedNodeIds.has(node.id)) selectFlowNode(node);
                                        setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
                                    }}
                                    onConnectStart={node.kind === "audio" ? (event) => {
                                        const rect = canvasRef.current?.getBoundingClientRect();
                                        if (rect) setConnectionMouseWorld({
                                            x: (event.clientX - rect.left - viewport.x) / viewport.k,
                                            y: (event.clientY - rect.top - viewport.y) / viewport.k,
                                        });
                                        setConnectingAudioId(node.sourceId!);
                                    } : undefined}
                                    connectTitle={node.kind === "audio" ? `从${node.content.title}连接角色口播图` : undefined}
                                    connecting={node.kind === "audio" && connectingAudioId === node.sourceId}
                                    regenerateTitle={node.kind === "script-group"
                                        ? "生成整组文案"
                                        : node.kind === "segment"
                                            ? "生成本段文案"
                                            : audio?.sourceType === "generated"
                                                ? "生成本段音频"
                                                : node.kind === "image"
                                                    ? "生成角色口播图"
                                                : node.kind === "video"
                                                    ? "重新生成口播视频"
                                                : undefined}
                                    regenerating={busy === (node.kind === "script-group" ? `regenerate-group-${node.sourceId}` : node.kind === "segment" ? `regenerate-segment-${node.sourceId}` : node.kind === "audio" ? `tts-audio-${node.sourceId}` : node.kind === "image" ? `image-${node.sourceId}` : node.kind === "video" ? `video-${node.sourceId}` : "")}
                                    regenerateDisabled={node.kind === "video" && (!effectiveVideoModel || ["queued", "running"].includes(video?.status || ""))}
                                    onRegenerate={node.kind === "script-group"
                                        ? () => void regenerateScriptGroup(node.sourceId!)
                                        : node.kind === "segment"
                                            ? () => void regenerateSegment(node.sourceId!)
                                            : audio
                                                ? () => regenerateAudio(audio)
                                        : node.kind === "image"
                                            ? () => void generateKouboImage(node.sourceId!)
                                        : video
                                            ? () => void regenerateKouboVideo(video)
                                        : undefined}
                                    downloadTitle={audio ? "下载音频" : node.kind === "video" ? "下载口播视频" : undefined}
                                    downloading={busy === `${audio ? "download-audio" : "download-video"}-${node.sourceId}`}
                                    downloadDisabled={audio ? audio.status !== "ready" || !audio.url : !video || video.status !== "ready" || !video.url}
                                    downloadAfterRegenerate={Boolean(audio)}
                                    onDownload={audio ? () => void downloadKouboAudio(audio, node.content.title) : video ? () => void downloadKouboVideo(video, node.content.title) : undefined}
                                    optimizeTitle={optimizableCourseGroup ? workflowCopy.optimizeGroupTitle : node.kind === "segment" ? "按要求优化本段文案" : undefined}
                                    optimizeOpen={optimizableCourseGroup ? optimizingGroupId === node.sourceId : node.kind === "segment" && optimizingSegmentId === node.sourceId}
                                    optimizing={optimizableCourseGroup ? busy === `optimize-group-${node.sourceId}` : node.kind === "segment" && busy === `regenerate-segment-${node.sourceId}`}
                                    onToggleOptimize={optimizableCourseGroup
                                        ? () => setOptimizingGroupId((current) => current === node.sourceId ? "" : node.sourceId!)
                                        : node.kind === "segment" ? () => setOptimizingSegmentId((current) => current === node.sourceId ? "" : node.sourceId!) : undefined}
                                    onOptimize={optimizableCourseGroup ? (direction) => optimizeScriptGroup(node.sourceId!, direction) : node.kind === "segment" ? async (direction) => {
                                        await regenerateSegment(node.sourceId!, direction);
                                        setOptimizingSegmentId("");
                                    } : undefined}
                                    stackCount={node.kind === "script-group" ? data.segments.filter((segment) => segment.scriptGroupId === node.sourceId).length : 0}
                                    collapsed={node.kind === "script-group" && collapsedScriptGroups.has(node.sourceId!)}
                                    collapsibleLabel={node.kind === "script-group" ? workflowCopy.segmentGroupLabel : undefined}
                                    showCollapseAction={node.kind !== "script-group"}
                                    quickActionTitle={node.kind === "script-group" ? "生成缺失音频" : node.kind === "segment" ? "生成本段音频" : undefined}
                                    quickActionLoading={busy === (node.kind === "script-group" ? `tts-missing-${node.sourceId}` : `tts-${node.sourceId}`)}
                                    quickActionDisabled={!effectiveSpeechModel || !effectiveVoice || (node.kind === "script-group" && !segmentsWithoutAudio(node.sourceId!).length)}
                                    onQuickAction={node.kind === "script-group"
                                        ? () => void generateTts(segmentsWithoutAudio(node.sourceId!), `tts-missing-${node.sourceId}`)
                                        : node.kind === "segment" ? () => generateSegmentTts(node.sourceId!) : undefined}
                                    onToggleCollapse={node.kind === "script-group" ? () => setCollapsedScriptGroups((current) => {
                                        const next = new Set(current);
                                        if (next.has(node.sourceId!)) next.delete(node.sourceId!);
                                        else next.add(node.sourceId!);
                                        return next;
                                    }) : undefined}
                                    onImageFile={node.kind === "image" ? (file) => void uploadKouboImage(node.sourceId!, file) : undefined}
                                    onImagePick={node.kind === "image" ? () => {
                                        selectFlowNode(node);
                                        setAssetPickerTarget("image");
                                    } : undefined}
                                />;
                            })}
                </CrocoCanvas>
                <ContentNodePanelTabs
                    activeKey={panelTab}
                    tuningEnabled={profile?.role === "superuser" && (workflowType === "course-video" || Boolean(selectedScriptGroup || selectedSegment))}
                    onChange={(next) => {
                        if (promptDirty) {
                            message.warning("请先保存或放弃当前 Prompt 修改");
                            return;
                        }
                        setPanelTab(next);
                    }}
                    contentWidthClass="w-80"
                    content={selectedAudio?.status === "ready" && selectedAudio.url ? <div className="h-full" aria-label="口播节点设置面板">
                        <AudioSegmentationPanel
                            key={selectedAudio.id}
                            nodeId={selectedAudio.id}
                            title={selectedLabel}
                            url={selectedAudio.url}
                            durationMs={selectedAudio.durationMs}
                            submitting={busy === `segment-audio-${selectedAudio.id}`}
                            onSubmit={saveAudioSegments}
                            actions={<Dropdown
                                trigger={["click"]}
                                menu={{
                                    items: [
                                        ...data.imageResults.filter((image) => !image.id.startsWith("optimistic-")).map((image, index) => ({ key: image.id, label: `角色口播图 ${index + 1}` })),
                                        ...(data.imageResults.some((image) => !image.id.startsWith("optimistic-")) ? [{ type: "divider" as const }] : []),
                                        { key: "create", label: "创建新的角色图片" },
                                    ],
                                    onClick: ({ key }) => {
                                        if (key === "create") {
                                            void createAndLinkRoleImage(selectedAudio.id);
                                            return;
                                        }
                                        void linkAudioToImage(selectedAudio.id, key);
                                    },
                                }}
                            >
                                <Button block icon={<Image className="size-4" />}>连接角色图片</Button>
                            </Dropdown>}
                        />
                    </div> : selectedImage ? <div className="h-full overflow-y-auto p-4" aria-label="口播节点设置面板">
                        <div className="space-y-5">
                            <div className="flex items-center gap-2 font-semibold"><Image className="size-4" />角色口播图</div>
                            <ImageAssetInput
                                title="角色口播图"
                                url={selectedImage.url}
                                selected={Boolean(selectedImage.assetId)}
                                loading={busy === `image-upload-${selectedImage.id}`}
                                onUpload={(file) => uploadKouboImage(selectedImage.id, file)}
                                onChoose={() => setAssetPickerTarget("image")}
                            />
                            <Divider plain className="!my-0 !text-xs !text-muted-foreground">
                                上传首帧或生成图片
                            </Divider>
                            <section className="space-y-5" aria-label="角色口播图生成设置">
                                <ImageAssetInput
                                    title="人物参考"
                                    url={personReferenceAsset.data?.url}
                                    selected={Boolean(personReferenceAssetId)}
                                    loading={busy === "image-upload-person"}
                                    onUpload={(file) => uploadKouboReference("person", file)}
                                    onChoose={() => setAssetPickerTarget("person")}
                                />
                                <ImageAssetInput
                                    title="背景参考"
                                    url={backgroundReferenceAsset.data?.url}
                                    selected={Boolean(backgroundReferenceAssetId)}
                                    loading={busy === "image-upload-background"}
                                    onUpload={(file) => uploadKouboReference("background", file)}
                                    onChoose={() => setAssetPickerTarget("background")}
                                />
                                <Field label="图像提示词">
                                    <CanvasResourceMentionTextarea
                                        value={imagePrompt}
                                        references={roleImagePromptReferences}
                                        onChange={setImagePrompt}
                                        placeholder="描述人物、服装、构图、镜头和背景，输入 @ 引用参考图"
                                        aria-label="角色口播图提示词"
                                        className="h-36 w-full rounded-xl border border-border bg-[var(--surface-sunken)] px-3 py-2 text-sm leading-7 text-foreground"
                                    />
                                </Field>
                                <Field label="图片模型">
                                    <Select
                                        className="w-full"
                                        aria-label="角色口播图模型"
                                        value={effectiveRoleImageModel || undefined}
                                        options={roleImageModels}
                                        placeholder="未配置口播图片模型"
                                        status={!effectiveRoleImageModel ? "error" : undefined}
                                        onChange={(model) => {
                                            setRoleImageModel(model);
                                            const presets = imageSizePresetsForModel(model);
                                            const resolution = Object.keys(presets)[0] || "";
                                            const ratios = Object.keys(presets[resolution] || {});
                                            setImageResolution(resolution);
                                            setImageAspectRatio(ratios.includes(imageAspectRatio) ? imageAspectRatio : ratios[0] || "auto");
                                        }}
                                    />
                                </Field>
                                <div className="grid grid-cols-2 gap-2">
                                    <Field label="清晰度"><Select className="w-full" value={effectiveImageResolution} options={roleImageResolutionOptions} onChange={(value) => {
                                        setImageResolution(value);
                                        if (!roleImageSizePresets[value]?.[imageAspectRatio]) setImageAspectRatio("auto");
                                    }} /></Field>
                                    <Field label="画面比例"><Select className="w-full" value={effectiveImageAspectRatio} options={roleImageRatioOptions} onChange={setImageAspectRatio} /></Field>
                                </div>
                                {selectedImage.status === "failed" && selectedImage.errorMessage ? <Alert type="error" showIcon message={selectedImage.errorMessage} /> : null}
                                <div className="flex flex-col gap-2" role="group" aria-label="角色口播图生成操作">
                                    <Button
                                        block
                                        type="primary"
                                        loading={busy === `image-${selectedImage.id}`}
                                        disabled={!effectiveRoleImageModel || (!imagePrompt.trim() && !personReferenceAssetId && !backgroundReferenceAssetId)}
                                        onClick={() => void generateKouboImage(selectedImage.id)}
                                    >
                                        生成角色口播图
                                    </Button>
                                    {selectedImage.status === "ready" ? <Button
                                        block
                                        loading={busy === `videos-${selectedImage.id}`}
                                        disabled={!effectiveVideoModel || !selectedImageLinkedAudios.length}
                                        onClick={() => void generateKouboVideos(selectedImage.id)}
                                    >
                                        生成口播视频{selectedImageLinkedAudios.length ? `（${selectedImageLinkedAudios.length} 段）` : ""}
                                    </Button> : null}
                                </div>
                            </section>
                        </div>
                    </div> : <div className="h-full overflow-y-auto p-4" aria-label="口播节点设置面板">
                        <div className="flex items-center gap-2 font-semibold"><Image className="size-4" />节点设置 · {selectedLabel}</div>
                        <div className="mt-4 space-y-5">
                            {selectedScriptGroup?.sourceType === "ai" ? <section className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-medium text-muted-foreground">生成要求</span>
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<Copy className="size-3.5" />}
                                        aria-label="复制生成要求"
                                        onClick={() => copyText(selectedScriptGroup.sourceInput, "生成要求已复制")}
                                    >
                                        复制
                                    </Button>
                                </div>
                                <Input.TextArea
                                    aria-label="原始生成要求"
                                    value={selectedScriptGroup.sourceInput}
                                    readOnly
                                    autoSize={{ minRows: 3, maxRows: 7 }}
                                />
                            </section> : null}
                            {(selectedScriptGroup || selectedSegment) ? <>
                                <Field label="Expressive 2.0 模型" help={!effectiveSpeechModel ? "尚未配置可用模型" : "用于逐段生成口播音频"}><Select className="w-full" aria-label="选择 Expressive 2.0 模型" value={effectiveSpeechModel || undefined} onChange={setSpeechModel} options={speechModels} placeholder="未配置 Expressive 2.0" status={!effectiveSpeechModel ? "error" : undefined} /></Field>
                                <Field label="Voice" help={!effectiveVoice ? "尚未配置可用 Voice" : "使用现有 Voice 列表"}><Select className="w-full" aria-label="选择口播 Voice" value={effectiveVoice || undefined} onChange={setVoice} options={voiceOptions} loading={voices.isLoading} placeholder="未配置可用 Voice" status={!effectiveVoice ? "error" : undefined} /></Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="语速" help="0.5x–1.5x">
                                        <input
                                            type="number"
                                            aria-label="口播语速"
                                            min={0.5}
                                            max={1.5}
                                            step={0.05}
                                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
                                            value={speechSpeed}
                                            onChange={(event) => setSpeechSpeed(event.target.value)}
                                            onBlur={(event) => setSpeechSpeed(normalizeAudioSpeedValue(event.target.value))}
                                        />
                                    </Field>
                                    <Field label="音量" help="0.5x–2x">
                                        <input
                                            type="number"
                                            aria-label="口播音量"
                                            min={0.5}
                                            max={2}
                                            step={0.05}
                                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
                                            value={speechVolume}
                                            onChange={(event) => setSpeechVolume(event.target.value)}
                                            onBlur={(event) => setSpeechVolume(normalizeAudioVolumeValue(event.target.value))}
                                        />
                                    </Field>
                                </div>
                                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3">
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-foreground">优化语气</span>
                                        <span className="mt-0.5 block text-xs text-muted-foreground">生成前添加适合上下文的语气标记</span>
                                    </span>
                                    <Switch aria-label="优化语气" checked={optimizeTone} onChange={setOptimizeTone} />
                                </label>
                            </> : null}
                            <div className="flex flex-col gap-2 border-t border-border pt-4">
                                {scriptActions}
                                {segmentActions}
                            </div>
                        </div>
                    </div>}
                    tuning={<ContentModelPromptTuning
                        run={kouboPromptRun(projectId, profile?.id || "", selectedSegment || selectedScriptGroup)}
                        fallbackStage={workflowType === "course-video" ? "course_script" : "koubo_script"}
                        includeActivePurposes={workflowType === "course-video" ? [] : ["optimize_tts_tone"]}
                        promptPurposeKey={workflowType === "course-video"
                            ? selectedSegment?.modelPromptBinding.purposeKey || selectedScriptGroup?.modelPromptBinding.purposeKey || "generate"
                            : undefined}
                        modelSelection={workflowType === "course-video" ? {
                            stage: "course_script",
                            label: "课程文案模型",
                            value: courseScriptModel,
                            options: availableCourseScriptModels.map((value) => ({
                                value,
                                modelId: modelId(value),
                                label: modelOptionLabel(config, value),
                            })),
                            requiredPurposeKeys: ["generate", "generate_full", "regenerate_segment", "optimize_tts_tone"],
                            loading: saveCourseScriptModel.isPending,
                            onChange: (value) => {
                                void saveCourseScriptModel.mutateAsync(modelId(value))
                                    .then(() => message.success("课程文案模型已保存"))
                                    .catch((error) => message.error(error instanceof Error ? error.message : "课程文案模型保存失败"));
                            },
                        } : undefined}
                        onDirtyChange={setPromptDirty}
                    />}
                />
                {contextMenu ? <KouboNodeContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    downloadCount={selectedDownloadCount}
                    downloading={busy === "download"}
                    onClose={() => setContextMenu(null)}
                    onDownload={() => {
                        setContextMenu(null);
                        setBusy("download");
                        void downloadSelectedNodes()
                            .then(() => message.success(selectedDownloadCount > 1 ? `已下载 ${selectedDownloadCount} 项内容` : "内容已下载"))
                            .catch((error) => message.error(error instanceof Error ? error.message : "下载失败"))
                            .finally(() => setBusy(""));
                    }}
                /> : null}
            </div>
            <Modal
                title={scriptMode === "ai" ? workflowCopy.generateScriptLabel : "粘贴自己的文案"}
                open={scriptOpen}
                confirmLoading={scriptMode === "ai" ? scriptGenerating : scriptImporting}
                onCancel={() => setScriptOpen(false)}
                onOk={() => void submitScript()}
                footer={scriptMode === "ai" ? <div className="flex flex-wrap items-center justify-end gap-3">
                    <label className="mr-1 inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                        <Switch aria-label={workflowCopy.segmentToggleLabel} checked={scriptSegmented} onChange={setScriptSegmented} />
                        {workflowCopy.segmentToggleLabel}
                    </label>
                    <Button aria-label="取消" onClick={() => setScriptOpen(false)}>取消</Button>
                    <Button aria-label="生成" type="primary" loading={scriptGenerating} onClick={() => void submitScript()}>生成</Button>
                </div> : undefined}
            >
                <div className="grid gap-3">
                    {scriptMode === "ai"
                        ? workflowType === "course-video" ? <>
                            <Field label="主题"><Input value={courseTopic} onChange={(event) => setCourseTopic(event.target.value)} placeholder="填写课程主题" aria-label="课程主题" /></Field>
                            <Field label="受众"><Input value={courseAudience} onChange={(event) => setCourseAudience(event.target.value)} placeholder="填写目标受众" aria-label="目标受众" /></Field>
                            <Field label="额外提示词"><Input.TextArea rows={4} value={courseExtraPrompt} onChange={(event) => setCourseExtraPrompt(event.target.value)} placeholder="选填，例如课程结构、语气或案例要求" aria-label="课程额外提示词" /></Field>
                        </> : <Field label="生成要求"><Input.TextArea rows={8} value={scriptText} onChange={(event) => setScriptText(event.target.value)} placeholder="描述口播主题、受众和表达目标" aria-label="口播文案生成要求" /></Field>
                        : <>
                            <Field label="原文"><Input.TextArea rows={8} value={scriptText} onChange={(event) => setScriptText(event.target.value)} placeholder="粘贴需要保持原字原句的完整文案" aria-label="导入原文" /></Field>
                            <Field label="语气"><Input.TextArea rows={3} value={scriptDirection} onChange={(event) => setScriptDirection(event.target.value)} placeholder="例如：亲切自然、节奏轻快、重点处停顿" aria-label="整篇语气指导" /></Field>
                        </>}
                </div>
            </Modal>
            <Modal
                width={audioSource === "upload" ? 520 : 480}
                title={audioSource === "upload" ? "上传已有音频" : "录制自己的音频"}
                open={audioOpen}
                footer={null}
                closable={!recording && !audioProcessing}
                maskClosable={!recording && !audioProcessing}
                keyboard={!recording && !audioProcessing}
                onCancel={() => setAudioOpen(false)}
            >
                {audioSource === "upload"
                    ? <Upload.Dragger
                        accept="audio/*"
                        maxCount={1}
                        disabled={audioProcessing}
                        beforeUpload={async (file) => {
                            await processAudioInput(file, "upload");
                            return false;
                        }}
                        showUploadList={false}
                    >
                        <UploadCloud className="mx-auto mb-3 size-6 text-muted-foreground" />
                        <p>拖拽音频到这里，或点击选择文件</p>
                    </Upload.Dragger>
                    : <div className="space-y-4 py-2">
                        {audioTargetSegment ? (
                            <section aria-label="录制对应文案" className="rounded-xl border border-border bg-[var(--surface-sunken)] p-3">
                                <div className="text-xs font-medium text-muted-foreground">当前文案</div>
                                <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-6">{audioTargetSegment.text}</p>
                            </section>
                        ) : null}
                        <LiveRecordingWaveform stream={recordingStream} />
                        <div className="flex justify-center">
                            <Button
                                size="large"
                                type={recording ? "default" : "primary"}
                                danger={recording}
                                loading={audioProcessing}
                                icon={<Mic2 className="size-4" />}
                                onClick={() => void toggleRecording()}
                            >
                                {recording ? "停止录制" : "开始录制"}
                            </Button>
                        </div>
                    </div>}
            </Modal>
            <AssetPickerModal
                open={Boolean(assetPickerTarget)}
                title={pickerTitle}
                allowedKinds={["image"]}
                onInsert={(payload) => void chooseKouboAsset(payload)}
                onClose={() => setAssetPickerTarget(null)}
            />
        </WorkspacePage>
    );
}

function applyKouboUiState(
    workspace: KouboWorkspace,
    hiddenNodeIds: ReadonlySet<string>,
    hiddenAudioRequestIds: ReadonlySet<string>,
    optimisticSegments: Readonly<Record<string, KouboSegment>>,
    optimisticAudioNodes: KouboAudioNode[],
    optimisticAudioImageLinks: Readonly<Record<string, string | null>>,
    optimisticRoleImages: OptimisticRoleImage[],
    optimisticVideoCandidates: KouboVideoCandidate[],
): KouboWorkspace {
    const persistedAudioIds = new Set(workspace.audioNodes.map((node) => node.id));
    const persistedAudioRequestIds = new Set(workspace.audioNodes.map((node) => node.clientRequestId).filter(Boolean));
    const optimisticAudioById = new Map(optimisticAudioNodes.map((node) => [node.id, node]));
    const persistedVideoRequestIds = new Set(workspace.videoCandidates.map((candidate) => candidate.clientRequestId).filter(Boolean));
    const optimisticVideoById = new Map(optimisticVideoCandidates.map((candidate) => [candidate.id, candidate]));
    const optimisticImageByAudioId = new Map(optimisticRoleImages.map((item) => [item.audioId, item.image.id]));
    return {
        ...workspace,
        scriptGroups: workspace.scriptGroups.filter((group) => !hiddenNodeIds.has(`koubo-script-group-${group.id}`)),
        segments: workspace.segments
            .filter((segment) => !hiddenNodeIds.has(`koubo-segment-${segment.id}`))
            .map((segment) => optimisticSegments[segment.id] || segment),
        audioNodes: [
            ...workspace.audioNodes
                .filter((audio) => !hiddenNodeIds.has(`koubo-audio-${audio.id}`) && !hiddenAudioRequestIds.has(audio.clientRequestId || ""))
                .map((audio) => optimisticAudioById.get(audio.id) || audio),
            ...optimisticAudioNodes.filter((audio) =>
                !hiddenNodeIds.has(`koubo-audio-${audio.id}`)
                && !hiddenAudioRequestIds.has(audio.clientRequestId || "")
                && !persistedAudioIds.has(audio.id)
                && !persistedAudioRequestIds.has(audio.clientRequestId)),
        ].map((audio) => Object.prototype.hasOwnProperty.call(optimisticAudioImageLinks, audio.id)
            ? { ...audio, imageResultId: optimisticAudioImageLinks[audio.id] }
            : optimisticImageByAudioId.has(audio.id)
                ? { ...audio, imageResultId: optimisticImageByAudioId.get(audio.id)! }
                : audio),
        imageResults: [
            ...workspace.imageResults.filter((image) => !hiddenNodeIds.has(`koubo-image-${image.id}`)),
            ...optimisticRoleImages
                .filter((item) => !hiddenNodeIds.has(`koubo-image-${item.image.id}`) && !hiddenNodeIds.has(`koubo-audio-${item.audioId}`))
                .map((item) => item.image),
        ],
        videoCandidates: [
            ...workspace.videoCandidates
                .filter((video) => !hiddenNodeIds.has(`koubo-video-${video.id}`))
                .map((video) => optimisticVideoById.get(video.id) || video),
            ...optimisticVideoCandidates.filter((video) =>
                !hiddenNodeIds.has(`koubo-video-${video.id}`)
                && !workspace.videoCandidates.some((persisted) => persisted.id === video.id)
                && !persistedVideoRequestIds.has(video.clientRequestId)),
        ],
    };
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
    return <div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{label}</label>{children}{help ? <p className="text-xs leading-5 text-muted-foreground">{help}</p> : null}</div>;
}

function ImageAssetInput({
    title,
    url,
    selected,
    loading,
    onUpload,
    onChoose,
}: {
    title: string;
    url?: string;
    selected: boolean;
    loading: boolean;
    onUpload: (file: File) => Promise<boolean>;
    onChoose: () => void;
}) {
    const [previewOpen, setPreviewOpen] = useState(false);
    return (
        <section className="grid gap-2" aria-label={`${title}素材`}>
            <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">{title}</div>
            </div>
            <div className="relative">
                <div
                    className="absolute right-2 top-2 z-10 flex gap-1 rounded-lg bg-[var(--surface-overlay)]/90 p-1 text-muted-foreground"
                    style={{ ["--node-action-hover" as string]: "var(--surface-sunken)" }}
                >
                    <Upload accept="image/*" maxCount={1} disabled={loading} showUploadList={false} beforeUpload={onUpload}>
                        <CanvasNodeIconButton
                            title={`${selected ? "重新上传" : "上传"}${title}`}
                            disabled={loading}
                            icon={<UploadCloud className="size-4" />}
                        />
                    </Upload>
                    <CanvasNodeIconButton
                        title={`从素材库${selected ? "替换" : "选择"}${title}`}
                        icon={<Image className="size-4" />}
                        onClick={onChoose}
                    />
                </div>
                <Upload.Dragger
                    className="block w-full"
                    aria-label={`${selected ? "拖拽替换" : "上传"}${title}`}
                    accept="image/*"
                    maxCount={1}
                    disabled={loading}
                    openFileDialogOnClick={!selected}
                    showUploadList={false}
                    beforeUpload={onUpload}
                >
                    {url ? (
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label={`查看${title}大图`}
                            onClick={(event) => {
                                event.stopPropagation();
                                setPreviewOpen(true);
                            }}
                            onKeyDown={(event) => {
                                if (!["Enter", " "].includes(event.key)) return;
                                event.preventDefault();
                                event.stopPropagation();
                                setPreviewOpen(true);
                            }}
                        >
                            <img src={url} alt={title} className="aspect-video w-full rounded-lg object-cover" />
                        </div>
                    ) : selected ? (
                        <div className="grid aspect-video place-items-center text-sm text-muted-foreground">正在加载素材</div>
                    ) : (
                        <div className="py-3">
                            <UploadCloud className="mx-auto size-5 text-muted-foreground" />
                            <p className="mt-2 text-sm">拖拽图片到这里，或点击上传</p>
                        </div>
                    )}
                </Upload.Dragger>
            </div>
            <Modal title={title} open={previewOpen} footer={null} centered onCancel={() => setPreviewOpen(false)}>
                {url ? <img src={url} alt={`${title}大图预览`} className="max-h-[70vh] w-full rounded-xl object-contain" /> : null}
            </Modal>
        </section>
    );
}

function nextCanvasPaint() {
    return new Promise<void>((resolve) => {
        if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => resolve());
        else window.setTimeout(resolve, 0);
    });
}

function KouboStartNode({
    copy,
    onAi,
    onPaste,
    onUpload,
    onRecord,
    onHeightChange,
}: {
    copy: VideoWorkflowCopy;
    onAi: () => void;
    onPaste: () => void;
    onUpload: () => void;
    onRecord: () => void;
    onHeightChange: (nodeId: string, height: number) => void;
}) {
    const nodeRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const element = nodeRef.current;
        if (!element) return;
        const reportHeight = () => onHeightChange("koubo-start", element.offsetHeight);
        reportHeight();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(reportHeight);
        observer.observe(element);
        return () => observer.disconnect();
    }, [onHeightChange]);
    return (
        <section ref={nodeRef} data-node-id="koubo-start" data-canvas-no-zoom className="w-72 rounded-2xl border border-border bg-[var(--surface-raised)] p-4 shadow-[var(--elevation-card)]">
            <h2 className="text-base font-semibold">{copy.startTitle}</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">选择已有内容的起点，只创建本次需要的工作链路。</p>
            <div className="mt-4 grid gap-2">
                <Button type="primary" onClick={onAi}>{copy.generateScriptLabel}</Button>
                <Button onClick={onPaste}>粘贴自己的文案</Button>
                <Button onClick={onUpload}>上传已有音频</Button>
                <Button onClick={onRecord}>录制自己的音频</Button>
            </div>
        </section>
    );
}

function kouboCanvasNode(id: string, title: string, x: number, y: number, width: number, height = 224): CanvasNodeData {
    return { id, title, type: CanvasNodeType.Text, position: { x, y }, width, height };
}

function kouboGenerationContentNode(id: string, projectId: string, prompt: string, mode: "ai" | "pasted", job: GenerationJob, copy: VideoWorkflowCopy): ContentNode {
    const now = new Date().toISOString();
    return {
        id,
        topicId: projectId,
        attemptId: projectId,
        parentId: null,
        nodeType: "text",
        title: mode === "ai" ? copy.generationNodeTitle : "文案导入处理",
        summary: job.output_text || prompt || copy.generationSummary,
        sortOrder: 0,
        data: {},
        status: job.status === "failed" || job.status === "canceled" ? "failed" : job.status === "succeeded" ? "succeeded" : "running",
        revision: 1,
        createdBy: "",
        hiddenAt: null,
        createdAt: now,
        updatedAt: now,
    };
}

function kouboPromptRun(
    projectId: string,
    ownerId: string,
    source?: { id: string; generationId: string | null; modelPromptBinding: KouboModelPromptBinding },
): ContentGenerationRun | null {
    const binding = source?.modelPromptBinding;
    if (!source?.generationId || !binding?.promptId || !binding.stage || !binding.purposeKey
        || !binding.purposeLabel || !binding.modelId || !binding.version) return null;
    const now = new Date(0).toISOString();
    return {
        id: source.generationId,
        topicId: projectId,
        attemptId: projectId,
        ownerId,
        rootNodeId: source.id,
        resultNodeId: source.id,
        stage: binding.stage,
        mode: "manual",
        status: "accepted",
        round: 1,
        maxRounds: 1,
        producerModelId: String(binding.modelId),
        reviewerModelId: null,
        fallbackModelId: null,
        currentJobId: source.generationId,
        generationJobIds: [source.generationId],
        outputAssetIds: [],
        policySnapshot: {},
        promptVersion: String(binding.version),
        schemaVersion: null,
        modelPromptBindings: [binding as ContentModelPromptBinding],
        inputSnapshot: {},
        output: {},
        reviews: [],
        hardFail: false,
        mediaRetryCount: 0,
        mediaRetryLimit: 0,
        errorMessage: null,
        createdAt: now,
        startedAt: now,
        completedAt: now,
        updatedAt: now,
    };
}
