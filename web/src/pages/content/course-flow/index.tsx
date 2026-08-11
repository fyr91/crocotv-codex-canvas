import { useQuery } from "@tanstack/react-query";
import { App, Button, Result, Skeleton } from "antd";
import { ArrowLeft, Download, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { saveAs } from "file-saver";

import { WorkspacePage } from "@/components/layout/page-shell";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { createCourseFlowExport } from "@/lib/course-flow/export";
import { cacheCourseFlowAsset, resolveCourseFlowAsset } from "@/lib/course-flow/cache";
import { composeH3MaterialVideoPrompt, courseMaterialH3Selection, courseMaterialStoryboardModel, courseMaterialStoryboardPrompt, courseMaterialStoryboardSize } from "@/lib/course-flow/material-storyboard";
import { courseSceneImageModel, courseSceneImageSize, courseSceneLtxSize, courseSceneRatioOptions, courseSceneReferences } from "@/lib/course-flow/scene-generation";
import { expressiveSpeechModels } from "@/lib/koubo-video/runtime";
import { normalizeAudioFormatValue, normalizeAudioPitchValue, normalizeAudioSpeedValue, normalizeAudioVolumeValue } from "@/lib/audio-generation";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { getCloudAsset } from "@/services/api/cloud-assets";
import {
    beginCourseFlowAudio, beginCourseFlowStoryboard, beginCourseFlowVideo, deleteCourseFlowSegmentAudio, failCourseFlowScene, finishCourseFlowAudio, finishCourseFlowStoryboard, finishCourseFlowVideo,
    confirmCourseFlowPlan, confirmCourseFlowScript, deleteCourseFlowSegment, getCourseFlowSnapshot, getCourseFlowStoryboardPrompt, initializeCourseFlowProject, markCourseFlowAudioPlayed, registerCourseFlowScene,
    markCourseFlowSceneRunning, markCourseFlowStoryboardRunning, runCourseFlowAction, selectCourseFlowAudio, selectCourseFlowRole, updateCourseFlowProject,
    updateCourseFlowAudioDuration, updateCourseFlowSegment, updateCourseFlowShot,
} from "@/services/api/course-flow";
import { requestEdit, requestGeneration as requestImageGeneration } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";
import { getSpeechVoices } from "@/services/api/speech-voices";
import { requestVideoGeneration, storeGeneratedVideo, type VideoGenerationResult } from "@/services/api/video";
import { providerIdForModel, useConfigStore } from "@/stores/use-config-store";
import { useCourseFlowStore } from "@/stores/course-flow";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CourseFlowMaterialShot, CourseFlowRole, CourseFlowScene, CourseFlowStep } from "@/types/course-flow";
import { AudioRegenerationModal, BatchAudioRegenerationModal, courseAudioConfigForRegeneration, type CourseAudioRegenerationInput, type CourseAudioSettingsInput } from "./components/audio-regeneration-modal";
import { AudioStep } from "./components/audio-step";
import { CourseFlowStepCache, CourseFlowSteps } from "./components/course-flow-steps";
import { CreateRoleModal } from "./components/create-role-modal";
import { EnhanceScriptModal } from "./components/enhance-script-modal";
import { PromptTuningDrawer } from "./components/prompt-tuning-drawer";
import { RoleStep } from "./components/role-step";
import { SceneRegenerationModal, type CourseSceneRegenerationInput } from "./components/scene-regeneration-modal";
import { buildCourseScriptInitialInput, ScriptInputModal, type CourseScriptInput } from "./components/script-input-modal";
import { ScriptSceneStep } from "./components/script-scene-step";
import { VideoPlanningStep } from "./components/video-planning-step";
import { VideoStep } from "./components/video-step";
import { runSegmentRegeneration } from "./segment-regeneration";
import { runCourseSceneReplacement } from "./scene-replacement";
import { buildCourseEnhancementUserPrompt, runCourseEnhancement } from "./course-enhancement";
import { getCourseFlowAudioRefreshMode, type CourseFlowAudioRefreshMode } from "./audio-refresh";
import { runCourseBatchAudioRegeneration } from "./batch-audio-regeneration";
import { courseSegmentDividerKey, removeCourseSegment, restoreCourseSegment } from "./segment-actions";
import { courseFlowExportDescription, courseVideoGenerationPhase, furthestCourseFlowStep, runOptimisticShotPromptSave, segmentsNeedingMaterialPlan, selectedCourseAudio } from "./video-planning";

export default function CourseFlowPage() {
    const { projectId = "" } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const isSuperuser = useUserStore((state) => state.profile?.role === "superuser");
    const hydrate = useCourseFlowStore((state) => state.hydrate);
    const patchProject = useCourseFlowStore((state) => state.patchProject);
    const setSegments = useCourseFlowStore((state) => state.setSegments);
    const patchSegment = useCourseFlowStore((state) => state.patchSegment);
    const setScene = useCourseFlowStore((state) => state.setScene);
    const snapshot = useCourseFlowStore((state) => state.project ? state : null);
    const scriptInitialInput = useMemo(() => snapshot ? buildCourseScriptInitialInput(snapshot.project, snapshot.segments) : null, [
        snapshot?.project.sourceType,
        snapshot?.project.topic,
        snapshot?.project.audience,
        snapshot?.project.extraPrompt,
        snapshot?.project.sceneMode,
        snapshot?.project.sceneAspectRatio,
        snapshot?.segments,
    ]);
    const [visibleStep, setVisibleStep] = useState<CourseFlowStep>("role");
    const [roleModal, setRoleModal] = useState(false);
    const [scriptModal, setScriptModal] = useState(false);
    const [enhanceModal, setEnhanceModal] = useState(false);
    const [sceneRegenerationModal, setSceneRegenerationModal] = useState(false);
    const [sceneAssetPickerOpen, setSceneAssetPickerOpen] = useState(false);
    const [audioRegenerationTarget, setAudioRegenerationTarget] = useState<{ segmentId: string; audioId: string } | null>(null);
    const [batchAudioRegenerationOpen, setBatchAudioRegenerationOpen] = useState(false);
    const [batchAudioRegenerating, setBatchAudioRegenerating] = useState(false);
    const [promptDrawer, setPromptDrawer] = useState(false);
    const [scriptGenerating, setScriptGenerating] = useState(false);
    const [scriptEnhancing, setScriptEnhancing] = useState(false);
    const [sceneGenerating, setSceneGenerating] = useState(false);
    const [sceneReplacing, setSceneReplacing] = useState(false);
    const [regeneratingSegmentIds, setRegeneratingSegmentIds] = useState<Set<string>>(() => new Set());
    const [insertingDividerKeys, setInsertingDividerKeys] = useState<Set<string>>(() => new Set());
    const [planningSegmentIds, setPlanningSegmentIds] = useState<Set<string>>(() => new Set());
    const [planningErrors, setPlanningErrors] = useState<Record<string, string>>({});
    const [savingStyle, setSavingStyle] = useState(false);
    const [exporting, setExporting] = useState(false);
    const segmentRegenerations = useRef(new Map<string, string>());
    const segmentSaveOperations = useRef(new Map<string, Promise<boolean>>());
    const scriptConfirmations = useRef(new Map<string, string>());
    const planConfirmations = useRef(new Map<string, string>());
    const segmentDeletions = useRef(new Map<string, string>());
    const segmentInsertions = useRef(new Map<string, string>());
    const enhancementOperation = useRef<string | null>(null);
    const audioLaunching = useRef(new Set<string>());
    const videoLaunching = useRef(new Set<string>());
    const planningOperations = useRef(new Map<string, string>());
    const storyboardOperations = useRef(new Map<string, string>());
    const styleOperation = useRef<string | null>(null);
    const sceneReplacement = useRef<string | null>(null);
    const shotEditSnapshots = useRef(new Map<string, string>());
    const shotSaveOperations = useRef(new Map<string, string>());
    const initialization = new URLSearchParams(location.search).get("initialize");
    const query = useQuery({
        queryKey: ["course-flow", projectId, initialization],
        queryFn: async () => {
            if (initialization) await initializeCourseFlowProject(projectId, initialization);
            return getCourseFlowSnapshot(projectId);
        },
        enabled: Boolean(projectId),
        refetchInterval: (current) => hasRunning(current.state.data) ? 3000 : false,
    });
    const voices = useQuery({ queryKey: ["speech-voices"], queryFn: getSpeechVoices, staleTime: 300_000 });
    useEffect(() => { if (query.data && !enhancementOperation.current) hydrate(query.data); }, [hydrate, query.data]);
    useEffect(() => { if (query.data?.project.currentStep) setVisibleStep(query.data.project.currentStep); }, [query.data?.project.currentStep]);
    const voiceOptions = useMemo(() => (voices.data || []).filter((voice) => voice.state === "Active" && voice.speakerId.startsWith("S_")).map((voice) => ({ value: voice.speakerId, label: voice.alias || voice.speakerId })), [voices.data]);
    const speechModel = expressiveSpeechModels(config)[0]?.value || "";
    const ltxModel = config.videoModels.find((model) => providerIdForModel(model) === "ltx") || "";
    const h3Model = config.videoModels.find((model) => providerIdForModel(model) === "minimax_h3") || "";
    const sceneImageModel = useMemo(() => courseSceneImageModel(config), [config]);
    const storyboardImageModel = useMemo(() => courseMaterialStoryboardModel(config), [config]);
    const sceneRatioOptions = useMemo(() => sceneImageModel ? courseSceneRatioOptions(sceneImageModel) : [], [sceneImageModel]);

    const refresh = useCallback(async () => { const result = await query.refetch(); if (result.data) hydrate(result.data); return result.data; }, [hydrate, query]);
    const chooseRole = async (role: CourseFlowRole) => {
        if (!snapshot) return;
        hydrate({ ...snapshot, project: { ...snapshot.project, roleId: role.id }, role });
        try { await selectCourseFlowRole(projectId, role.id); } catch (error) { message.error(error instanceof Error ? error.message : "角色选择失败"); await refresh(); }
    };
    const goTo = async (step: CourseFlowStep) => {
        const previous = useCourseFlowStore.getState().project.currentStep;
        const furthest = furthestCourseFlowStep(previous, step);
        setVisibleStep(step);
        if (furthest === previous) return;
        patchProject({ currentStep: furthest });
        try { await updateCourseFlowProject(projectId, { current_step: furthest }); }
        catch (error) {
            patchProject({ currentStep: previous }); setVisibleStep(previous);
            message.error(error instanceof Error ? error.message : "步骤保存失败");
        }
    };

    const generateScene = useCallback(async (input?: CourseSceneRegenerationInput) => {
        if (sceneReplacement.current) throw new Error("课程场景正在保存");
        const state = useCourseFlowStore.getState();
        if (state.project.sceneMode !== "green_screen") throw new Error("通用课程视频不生成课程场景");
        if (!state.role) throw new Error("请先选择角色");
        if (!sceneImageModel) throw new Error("课程场景固定使用 GPT Image 2，但当前模型目录中没有可用通道");
        const ratio = state.project.sceneAspectRatio;
        const role = state.role;
        const previousScene = state.scene;
        const references = courseSceneReferences(role, previousScene, Boolean(input?.referenceCurrentScene));
        let prompt = "";
        let generationId = "";
        let runningUpdate: Promise<void> | null = null;
        setScene(previousScene
            ? { ...previousScene, status: "queued", errorMessage: null }
            : { prompt: "", assetId: null, url: "", status: "queued", errorMessage: null });
        setSceneGenerating(true);
        try {
            const result = await runCourseFlowAction<{ scene: { prompt: string } }>({
                action: "course-flow-generate-scene",
                projectId,
                ...(input ? { instruction: input.instruction, referenceCurrentScene: input.referenceCurrentScene } : {}),
            });
            prompt = result.scene.prompt;
            setScene({ prompt, assetId: previousScene?.assetId || null, url: previousScene?.url || "", status: "running", errorMessage: null });
            const images = await requestEdit({
                ...config,
                model: sceneImageModel,
                imageModel: sceneImageModel,
                size: courseSceneImageSize(sceneImageModel, ratio),
                count: "1",
                imagePromptOptimize: "false",
                imageWebSearch: "false",
                imageSearch: "false",
            }, prompt, references, undefined, {
                onJobCreated: (id) => { generationId = id; runningUpdate = markCourseFlowSceneRunning(projectId, id); },
            });
            const image = images[0];
            if (!image?.storageKey) throw new Error("课程场景没有返回图片");
            await runningUpdate;
            await registerCourseFlowScene(projectId, { assetId: image.storageKey, generationId, prompt });
            setScene({ prompt, assetId: image.storageKey, url: image.dataUrl, status: "ready", errorMessage: null });
            if (image.dataUrl) await cacheCourseFlowAsset(image.storageKey, await (await fetch(image.dataUrl)).blob());
            await refresh();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "场景生成失败";
            if (prompt) {
                await runningUpdate?.catch(() => undefined);
                await failCourseFlowScene(projectId, errorMessage).catch(() => undefined);
            }
            setScene(previousScene
                ? { ...previousScene, status: "failed", errorMessage }
                : { prompt, assetId: null, url: "", status: "failed", errorMessage });
            throw error;
        } finally { setSceneGenerating(false); }
    }, [config, projectId, refresh, sceneImageModel, setScene]);

    const replaceScene = useCallback(async (optimistic: CourseFlowScene, request: () => Promise<CourseFlowScene>) => {
        if (sceneGenerating || sceneReplacement.current) return;
        const previous = useCourseFlowStore.getState().scene;
        const operationId = crypto.randomUUID();
        sceneReplacement.current = operationId;
        setSceneReplacing(true);
        try {
            await runCourseSceneReplacement({
                previous,
                optimistic,
                request,
                isCurrent: () => sceneReplacement.current === operationId,
                apply: setScene,
            });
            if (sceneReplacement.current === operationId) message.success("课程场景已替换");
        } catch (error) {
            if (sceneReplacement.current === operationId) message.error(`${error instanceof Error ? error.message : "课程场景保存失败"}，已恢复原场景`);
        } finally {
            if (sceneReplacement.current === operationId) {
                sceneReplacement.current = null;
                setSceneReplacing(false);
            }
        }
    }, [message, sceneGenerating, setScene]);

    const chooseSceneAsset = useCallback((payload: InsertAssetPayload) => {
        if (payload.kind !== "image") return;
        if (!payload.storageKey) {
            message.error("该图片尚未同步到云端，请先上传后再选择");
            return;
        }
        setSceneAssetPickerOpen(false);
        const prompt = `课程场景素材：${payload.title}`;
        const optimistic: CourseFlowScene = { prompt, assetId: payload.storageKey, url: payload.dataUrl, status: "running", errorMessage: null };
        void replaceScene(optimistic, async () => {
            await registerCourseFlowScene(projectId, { assetId: payload.storageKey!, prompt });
            return { ...optimistic, status: "ready" };
        });
    }, [message, projectId, replaceScene]);

    const uploadScene = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/")) {
            message.warning("请选择图片文件");
            return false;
        }
        const previewUrl = URL.createObjectURL(file);
        const prompt = `用户上传的课程场景：${file.name}`;
        const optimistic: CourseFlowScene = { prompt, assetId: null, url: previewUrl, status: "running", errorMessage: null };
        try {
            await replaceScene(optimistic, async () => {
                const uploaded = await uploadImage(file, { compress: true });
                await registerCourseFlowScene(projectId, { assetId: uploaded.storageKey, prompt });
                await useAssetStore.getState().initialize();
                return { prompt, assetId: uploaded.storageKey, url: uploaded.url, status: "ready", errorMessage: null };
            });
        } finally { URL.revokeObjectURL(previewUrl); }
        return false;
    }, [message, projectId, replaceScene]);

    const submitScript = async (values: CourseScriptInput) => {
        const current = useCourseFlowStore.getState();
        const previous = { project: current.project, role: current.role, roles: current.roles, segments: current.segments, scene: current.scene };
        setScriptModal(false);
        patchProject({ sceneMode: values.sceneMode, sceneAspectRatio: values.sceneAspectRatio });
        setSegments([]);
        setScene(null);
        setScriptGenerating(true);
        try {
            if (values.mode === "generated") await runCourseFlowAction({ action: "course-flow-generate-segments", projectId, topic: values.topic, audience: values.audience, extraPrompt: values.extraPrompt, sceneMode: values.sceneMode, sceneAspectRatio: values.sceneAspectRatio });
            else await runCourseFlowAction({ action: "course-flow-segment-pasted-text", projectId, text: values.text, sceneMode: values.sceneMode, sceneAspectRatio: values.sceneAspectRatio });
            await refresh();
            if (values.sceneMode === "green_screen") {
                await generateScene();
                message.success("课程文案与场景已生成");
            } else message.success("课程文案已生成");
        } catch (error) {
            hydrate(previous);
            await refresh().catch(() => undefined);
            message.error(error instanceof Error ? error.message : "课程内容生成失败");
        } finally { setScriptGenerating(false); }
    };

    const saveSegment = (segmentId: string, patch: { text?: string; voiceDirection?: string }) => {
        const operation = (async () => {
            const current = useCourseFlowStore.getState().segments.find((segment) => segment.id === segmentId);
            if (!current) return false;
            const next = { text: patch.text ?? current.text, voiceDirection: patch.voiceDirection ?? current.voiceDirection };
            if (next.text === current.text && next.voiceDirection === current.voiceDirection) return true;
            const revision = current.revision + 1;
            patchSegment(segmentId, { ...next, revision });
            try { await updateCourseFlowSegment(segmentId, { ...next, revision }); } catch (error) {
                if (useCourseFlowStore.getState().segments.find((segment) => segment.id === segmentId)?.revision === revision) patchSegment(segmentId, current);
                message.error(error instanceof Error ? error.message : "片段保存失败");
                return false;
            }
            return true;
        })();
        segmentSaveOperations.current.set(segmentId, operation);
        void operation.finally(() => { if (segmentSaveOperations.current.get(segmentId) === operation) segmentSaveOperations.current.delete(segmentId); });
        return operation;
    };
    const enhanceScript = async (instruction: string) => {
        const current = useCourseFlowStore.getState();
        if (!current.segments.length || enhancementOperation.current) return;
        const previous = current.segments;
        const operationId = crypto.randomUUID();
        const userPrompt = buildCourseEnhancementUserPrompt(current.project, current.segments, instruction);
        setEnhanceModal(false);
        enhancementOperation.current = operationId;
        setScriptEnhancing(true);
        try {
            await runCourseEnhancement({
                previous,
                request: async () => { await runCourseFlowAction({ action: "course-flow-enhance-segments", projectId, userPrompt }); },
                load: async () => (await getCourseFlowSnapshot(projectId)).segments,
                isCurrent: () => enhancementOperation.current === operationId,
                apply: setSegments,
                restore: (segments) => segments.forEach((segment) => patchSegment(segment.id, {
                    text: segment.text,
                    voiceDirection: segment.voiceDirection,
                    revision: segment.revision,
                })),
            });
            if (enhancementOperation.current === operationId) message.success("课程文案已优化");
        } catch (error) {
            if (enhancementOperation.current !== operationId) return;
            const reason = error instanceof Error ? error.message : "课程文案优化失败";
            message.error(`${reason}，已恢复原文案`);
        } finally {
            if (enhancementOperation.current === operationId) {
                enhancementOperation.current = null;
                setScriptEnhancing(false);
            }
        }
    };
    const regenerateSegment = async (segmentId: string, direction: string) => {
        const previous = useCourseFlowStore.getState().segments.find((segment) => segment.id === segmentId);
        if (!previous || segmentRegenerations.current.has(segmentId)) return;
        const operationId = crypto.randomUUID();
        segmentRegenerations.current.set(segmentId, operationId);
        setRegeneratingSegmentIds((current) => new Set(current).add(segmentId));
        try {
            await runSegmentRegeneration({
                previous,
                request: async () => {
                    const result = await runCourseFlowAction<{ segment: { text: string; voice_direction?: string; revision: number; selected_audio_id?: string | null } }>({ action: "course-flow-regenerate-segment", projectId, segmentId, direction });
                    return { text: result.segment.text, voiceDirection: result.segment.voice_direction || "", revision: Number(result.segment.revision), selectedAudioId: result.segment.selected_audio_id || null };
                },
                isCurrent: () => segmentRegenerations.current.get(segmentId) === operationId,
                apply: (patch) => patchSegment(segmentId, patch),
            });
            if (segmentRegenerations.current.get(segmentId) === operationId) message.success("片段已重新生成");
        } catch (error) {
            if (segmentRegenerations.current.get(segmentId) === operationId) message.error(error instanceof Error ? error.message : "片段生成失败");
        } finally {
            if (segmentRegenerations.current.get(segmentId) === operationId) {
                segmentRegenerations.current.delete(segmentId);
                setRegeneratingSegmentIds((current) => { const next = new Set(current); next.delete(segmentId); return next; });
            }
        }
    };

    const deleteSegment = async (segmentId: string) => {
        const previous = useCourseFlowStore.getState().segments;
        const deletedIndex = previous.findIndex((segment) => segment.id === segmentId);
        const deleted = previous[deletedIndex];
        if (!deleted) return;
        const previousId = previous[deletedIndex - 1]?.id || null;
        const nextId = previous[deletedIndex + 1]?.id || null;
        const operationId = crypto.randomUUID();
        segmentDeletions.current.set(segmentId, operationId);
        setSegments(removeCourseSegment(previous, segmentId));
        try {
            await deleteCourseFlowSegment(projectId, segmentId);
        } catch (error) {
            if (segmentDeletions.current.get(segmentId) === operationId) setSegments(restoreCourseSegment(useCourseFlowStore.getState().segments, deleted, previousId, nextId));
            message.error(error instanceof Error ? error.message : "片段删除失败");
        } finally {
            if (segmentDeletions.current.get(segmentId) === operationId) segmentDeletions.current.delete(segmentId);
        }
    };

    const insertSegment = async (previousSegmentId: string, nextSegmentId: string, instruction: string) => {
        const dividerKey = courseSegmentDividerKey(previousSegmentId, nextSegmentId);
        if (segmentInsertions.current.has(dividerKey)) return;
        const operationId = crypto.randomUUID();
        segmentInsertions.current.set(dividerKey, operationId);
        setInsertingDividerKeys((current) => new Set(current).add(dividerKey));
        try {
            await runCourseFlowAction({
                action: "course-flow-insert-segment",
                projectId,
                previousSegmentId,
                nextSegmentId,
                instruction,
            });
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "新增片段生成失败");
        } finally {
            if (segmentInsertions.current.get(dividerKey) === operationId) {
                segmentInsertions.current.delete(dividerKey);
                setInsertingDividerKeys((current) => { const next = new Set(current); next.delete(dividerKey); return next; });
            }
        }
    };

    const generateAudio = useCallback(async (segmentId: string, refreshMode?: CourseFlowAudioRefreshMode, settings?: CourseAudioRegenerationInput) => {
        const current = useCourseFlowStore.getState();
        const segment = current.segments.find((item) => item.id === segmentId);
        const role = current.role;
        if (!segment || !role || audioLaunching.current.has(segmentId)) return;
        if (!speechModel) return message.error("尚未配置 Expressive 语音模型");
        audioLaunching.current.add(segmentId);
        const previousVersions = segment.audioVersions;
        const previousSelectedAudioId = segment.selectedAudioId;
        const clientRequestId = crypto.randomUUID();
        const version = Math.max(0, ...segment.audioVersions.map((audio) => audio.version)) + 1;
        const optimisticAudioId = `pending:${clientRequestId}`;
        const optimisticAudio = { id: optimisticAudioId, version, sourceSegmentRevision: segment.revision, assetId: null, url: "", durationMs: 0, status: "running" as const, errorMessage: null, played: false };
        patchSegment(segmentId, {
            selectedAudioId: optimisticAudioId,
            audioVersions: refreshMode === "stale" ? [optimisticAudio] : [...segment.audioVersions, optimisticAudio],
        });
        let audioId = ""; let generationId = ""; let registered = false;
        try {
            const row = await beginCourseFlowAudio(projectId, segmentId, version, segment.revision, clientRequestId);
            audioId = row.id; registered = true;
            if (refreshMode === "stale") await deleteCourseFlowSegmentAudio(projectId, segmentId, audioId);
            const registeredSegment = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
            if (registeredSegment) patchSegment(segmentId, {
                selectedAudioId: audioId,
                audioVersions: registeredSegment.audioVersions.map((audio) => audio.id === optimisticAudioId ? { ...audio, id: audioId } : audio),
            });
            let voiceDirection = settings?.voiceDirection.trim() || segment.voiceDirection;
            if (!settings) {
                const optimized = await runCourseFlowAction<{ voiceDirection: string }>({ action: "course-flow-optimize-voice-direction", projectId, segmentId });
                voiceDirection = optimized.voiceDirection.trim() || voiceDirection;
                patchSegment(segmentId, { voiceDirection });
                await updateCourseFlowSegment(segmentId, { voiceDirection });
            }
            const audioConfig = settings ? courseAudioConfigForRegeneration(config, settings) : config;
            const blob = await requestAudioGeneration({ ...audioConfig, model: speechModel, speechModel, audioVoice: role.voiceId, audioInstructions: voiceDirection }, segment.text, { onJobCreated: (id) => { generationId = id; } });
            const file = await storeGeneratedAudio(blob, settings?.format);
            await cacheCourseFlowAsset(file.storageKey, blob);
            await finishCourseFlowAudio(audioId, clientRequestId, { assetId: file.storageKey, generationId, durationMs: file.durationMs || 0 });
        } catch (error) {
            if (registered && audioId) await finishCourseFlowAudio(audioId, clientRequestId, { error: error instanceof Error ? error.message : "音频生成失败" });
            else patchSegment(segmentId, { audioVersions: previousVersions, selectedAudioId: previousSelectedAudioId });
            message.error(error instanceof Error ? error.message : "音频生成失败");
        } finally { audioLaunching.current.delete(segmentId); await refresh(); }
    }, [config, message, projectId, refresh, speechModel]);

    const confirmScriptSegment = async (segmentId: string) => {
        const segment = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
        if (!segment || segment.confirmedScriptRevision === segment.revision) return;
        const previousConfirmedRevision = segment.confirmedScriptRevision;
        const revision = segment.revision;
        const operationId = crypto.randomUUID();
        scriptConfirmations.current.set(segmentId, operationId);
        patchSegment(segmentId, { confirmedScriptRevision: revision });
        try {
            const saved = await segmentSaveOperations.current.get(segmentId);
            if (saved === false) return;
            await confirmCourseFlowScript(segmentId, revision);
        } catch (error) {
            const current = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
            if (scriptConfirmations.current.get(segmentId) === operationId && current?.revision === revision) patchSegment(segmentId, { confirmedScriptRevision: previousConfirmedRevision });
            message.error(error instanceof Error ? error.message : "文案确认失败");
            return;
        } finally {
            if (scriptConfirmations.current.get(segmentId) === operationId) scriptConfirmations.current.delete(segmentId);
        }
        const current = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
        if (current?.revision === revision && current.confirmedScriptRevision === revision) void generateAudio(segmentId);
    };

    const regenerateAllAudio = async (settings: CourseAudioSettingsInput) => {
        setBatchAudioRegenerationOpen(false);
        setBatchAudioRegenerating(true);
        try {
            await runCourseBatchAudioRegeneration(useCourseFlowStore.getState().segments, settings, (segmentId, segmentSettings) => generateAudio(segmentId, undefined, segmentSettings));
        } finally { setBatchAudioRegenerating(false); }
    };

    useEffect(() => {
        if (visibleStep !== "audio" || !snapshot) return;
        snapshot.segments.forEach((segment) => {
            const refreshMode = getCourseFlowAudioRefreshMode(segment);
            if (refreshMode) void generateAudio(segment.id, refreshMode);
        });
    }, [generateAudio, snapshot, visibleStep]);

    const markPlayed = (segmentId: string, audioId: string) => {
        const current = useCourseFlowStore.getState().segments.find((segment) => segment.id === segmentId);
        if (current) patchSegment(segmentId, { audioVersions: current.audioVersions.map((audio) => audio.id === audioId ? { ...audio, played: true } : audio) });
        void markCourseFlowAudioPlayed(audioId).catch(() => undefined);
    };
    const selectAudio = async (segmentId: string, audioId: string) => {
        patchSegment(segmentId, { selectedAudioId: audioId });
        try { await selectCourseFlowAudio(segmentId, audioId); } catch (error) { message.error(error instanceof Error ? error.message : "音频选择失败"); await refresh(); }
    };
    const downloadAudio = async (segmentId: string, audioId: string) => {
        const segment = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
        const audio = segment?.audioVersions.find((item) => item.id === audioId);
        if (!segment || !audio?.url || audio.status !== "ready") return message.warning("音频尚未生成完成");
        try {
            const blob = audio.assetId
                ? await resolveCourseFlowAsset(audio.assetId, async () => { const response = await fetch(audio.url); if (!response.ok) throw new Error("音频下载失败"); return response.blob(); })
                : await (await fetch(audio.url)).blob();
            const extension = blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") || blob.type.includes("m4a") ? "m4a" : "mp3";
            saveAs(blob, `课程音频-片段${segment.position + 1}-版本${audio.version}.${extension}`);
            message.success("音频已下载");
        } catch (error) { message.error(error instanceof Error ? error.message : "音频下载失败"); }
    };
    const optimizeRegenerationVoiceDirection = async (currentVoiceDirection: string) => {
        if (!audioRegenerationTarget) return currentVoiceDirection;
        try {
            const result = await runCourseFlowAction<{ voiceDirection: string }>({
                action: "course-flow-optimize-voice-direction",
                projectId,
                segmentId: audioRegenerationTarget.segmentId,
                currentVoiceDirection,
            });
            return result.voiceDirection.trim() || currentVoiceDirection;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "语气指导优化失败");
            throw error;
        }
    };
    const resolveAudioDuration = useCallback((segmentId: string, audioId: string, durationMs: number) => {
        const segment = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
        const audio = segment?.audioVersions.find((item) => item.id === audioId);
        if (!segment || !audio || audio.durationMs === durationMs) return;
        patchSegment(segmentId, { audioVersions: segment.audioVersions.map((item) => item.id === audioId ? { ...item, durationMs } : item) });
        void updateCourseFlowAudioDuration(audioId, durationMs).catch(async (error) => {
            message.error(error instanceof Error ? error.message : "音频时长保存失败");
            await refresh();
        });
    }, [message, patchSegment, refresh]);

    const planSegment = useCallback(async (segmentId: string) => {
        const state = useCourseFlowStore.getState();
        const segment = state.segments.find((item) => item.id === segmentId);
        const audio = segment ? selectedCourseAudio(segment) : null;
        if (!segment || !audio || planningOperations.current.has(segmentId)) return;
        const operationId = `${segment.revision}:${audio.id}:${crypto.randomUUID()}`;
        planningOperations.current.set(segmentId, operationId);
        setPlanningSegmentIds((current) => new Set(current).add(segmentId));
        setPlanningErrors((current) => { const next = { ...current }; delete next[segmentId]; return next; });
        try {
            await runCourseFlowAction({
                action: "course-flow-plan-segment-material-shots",
                projectId,
                segmentId,
                sourceSegmentRevision: segment.revision,
                sourceAudioVersionId: audio.id,
            });
            const updated = (await getCourseFlowSnapshot(projectId)).segments.find((item) => item.id === segmentId);
            const current = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
            if (updated && current?.revision === segment.revision && current.selectedAudioId === audio.id && planningOperations.current.get(segmentId) === operationId) {
                patchSegment(segmentId, { materialShots: updated.materialShots });
            }
        } catch (error) {
            if (planningOperations.current.get(segmentId) === operationId) setPlanningErrors((current) => ({ ...current, [segmentId]: error instanceof Error ? error.message : "本片段画面规划失败" }));
        } finally {
            if (planningOperations.current.get(segmentId) === operationId) {
                planningOperations.current.delete(segmentId);
                setPlanningSegmentIds((current) => { const next = new Set(current); next.delete(segmentId); return next; });
            }
        }
    }, [patchSegment, projectId]);

    const confirmPlanSegment = async (segmentId: string) => {
        const segment = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
        const audio = segment ? selectedCourseAudio(segment) : null;
        if (!segment || !audio || segment.confirmedPlanAudioId === audio.id) return;
        const previousConfirmedAudioId = segment.confirmedPlanAudioId;
        const operationId = crypto.randomUUID();
        planConfirmations.current.set(segmentId, operationId);
        patchSegment(segmentId, { confirmedPlanAudioId: audio.id });
        try {
            await confirmCourseFlowPlan(segmentId, audio.id);
        } catch (error) {
            const current = useCourseFlowStore.getState().segments.find((item) => item.id === segmentId);
            if (planConfirmations.current.get(segmentId) === operationId && current?.selectedAudioId === audio.id) patchSegment(segmentId, { confirmedPlanAudioId: previousConfirmedAudioId });
            message.error(error instanceof Error ? error.message : "音频确认失败");
            return;
        } finally {
            if (planConfirmations.current.get(segmentId) === operationId) planConfirmations.current.delete(segmentId);
        }
        if (useCourseFlowStore.getState().segments.find((item) => item.id === segmentId)?.selectedAudioId === audio.id) void planSegment(segmentId);
    };

    useEffect(() => {
        if (visibleStep !== "video_plan" || !snapshot) return;
        segmentsNeedingMaterialPlan(snapshot.segments, new Set(planningOperations.current.keys())).forEach((segment) => void planSegment(segment.id));
    }, [planSegment, snapshot, visibleStep]);

    const saveMaterialStyle = async (value: string) => {
        const previous = useCourseFlowStore.getState().project.materialStylePrompt;
        if (value === previous) return;
        const operationId = crypto.randomUUID();
        styleOperation.current = operationId;
        patchProject({ materialStylePrompt: value }); setSavingStyle(true);
        try { await updateCourseFlowProject(projectId, { material_style_prompt: value }); }
        catch (error) {
            if (styleOperation.current === operationId) patchProject({ materialStylePrompt: previous });
            message.error(error instanceof Error ? error.message : "内容素材统一风格保存失败");
        } finally {
            if (styleOperation.current === operationId) { styleOperation.current = null; setSavingStyle(false); }
        }
    };

    const patchMaterialShot = useCallback((shotId: string, patch: Partial<CourseFlowMaterialShot>) => {
        const segment = useCourseFlowStore.getState().segments.find((item) => item.materialShots.some((shot) => shot.id === shotId));
        if (segment) patchSegment(segment.id, { materialShots: segment.materialShots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot) });
    }, [patchSegment]);
    const applyShotPrompt = (shotId: string, prompt: string) => patchMaterialShot(shotId, { prompt });
    const editShotPrompt = (shotId: string, prompt: string) => {
        const shot = useCourseFlowStore.getState().segments.flatMap((segment) => segment.materialShots).find((item) => item.id === shotId);
        if (!shot) return;
        if (!shotEditSnapshots.current.has(shotId)) shotEditSnapshots.current.set(shotId, shot.prompt);
        applyShotPrompt(shotId, prompt);
    };
    const saveShotPrompt = async (shotId: string, prompt: string) => {
        const previousPrompt = shotEditSnapshots.current.get(shotId);
        shotEditSnapshots.current.delete(shotId);
        if (previousPrompt == null || previousPrompt === prompt) return;
        const operationId = crypto.randomUUID();
        shotSaveOperations.current.set(shotId, operationId);
        try {
            await runOptimisticShotPromptSave({
                previousPrompt,
                nextPrompt: prompt,
                save: () => updateCourseFlowShot(shotId, prompt),
                isCurrent: () => shotSaveOperations.current.get(shotId) === operationId,
                apply: (value) => applyShotPrompt(shotId, value),
            });
        } catch (error) { message.error(error instanceof Error ? error.message : "画面素材提示词保存失败"); }
        finally { if (shotSaveOperations.current.get(shotId) === operationId) shotSaveOperations.current.delete(shotId); }
    };

    const generateStoryboard = useCallback(async (segmentId: string, shotId: string, force = false) => {
        const state = useCourseFlowStore.getState();
        const shot = state.segments.find((item) => item.id === segmentId)?.materialShots.find((item) => item.id === shotId);
        if (!shot || storyboardOperations.current.has(shotId)) return;
        if (!storyboardImageModel) return message.error("分镜图生成通道尚未配置");
        const resume = !force && shot.storyboardStatus === "running" && Boolean(shot.storyboardClientRequestId);
        const clientRequestId = resume ? shot.storyboardClientRequestId! : crypto.randomUUID();
        const sourcePrompt = shot.prompt;
        const previous = shot;
        storyboardOperations.current.set(shotId, clientRequestId);
        patchMaterialShot(shotId, {
            storyboardStatus: "running",
            storyboardErrorMessage: null,
            storyboardClientRequestId: clientRequestId,
        });
        let generationId = shot.storyboardGenerationId || "";
        let runningUpdate: Promise<void> | null = null;
        try {
            const managedPrompt = await getCourseFlowStoryboardPrompt(projectId);
            const prompt = courseMaterialStoryboardPrompt(managedPrompt.systemPrompt, sourcePrompt);
            patchMaterialShot(shotId, { storyboardPrompt: prompt });
            if (!resume) await beginCourseFlowStoryboard(shotId, prompt, clientRequestId);
            const images = await requestImageGeneration({
                ...config,
                model: storyboardImageModel,
                imageModel: storyboardImageModel,
                size: courseMaterialStoryboardSize(storyboardImageModel, state.project.sceneAspectRatio),
                count: "1",
                imagePromptOptimize: "false",
                imageWebSearch: "false",
                imageSearch: "false",
            }, prompt, {
                clientRequestId,
                onJobCreated: (id) => {
                    generationId = id;
                    patchMaterialShot(shotId, { storyboardGenerationId: id });
                    runningUpdate = markCourseFlowStoryboardRunning(shotId, clientRequestId, id);
                },
            });
            const image = images[0];
            if (!image?.storageKey || !image.dataUrl) throw new Error("分镜图没有返回图片");
            await runningUpdate;
            await finishCourseFlowStoryboard(shotId, clientRequestId, { assetId: image.storageKey, generationId, prompt, sourcePrompt });
            if (storyboardOperations.current.get(shotId) === clientRequestId) patchMaterialShot(shotId, {
                storyboardPrompt: prompt,
                storyboardSourcePrompt: sourcePrompt,
                storyboardAssetId: image.storageKey,
                storyboardUrl: image.dataUrl,
                storyboardGenerationId: generationId || null,
                storyboardStatus: "ready",
                storyboardErrorMessage: null,
                storyboardClientRequestId: clientRequestId,
            });
            await cacheCourseFlowAsset(image.storageKey, await (await fetch(image.dataUrl)).blob());
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "分镜图生成失败";
            await runningUpdate?.catch(() => undefined);
            await finishCourseFlowStoryboard(shotId, clientRequestId, { error: errorMessage }).catch(() => undefined);
            if (storyboardOperations.current.get(shotId) === clientRequestId) patchMaterialShot(shotId, {
                ...previous,
                storyboardStatus: previous.storyboardAssetId ? "ready" : "failed",
                storyboardErrorMessage: errorMessage,
                storyboardClientRequestId: clientRequestId,
            });
            message.error(errorMessage);
        } finally {
            if (storyboardOperations.current.get(shotId) === clientRequestId) storyboardOperations.current.delete(shotId);
        }
    }, [config, message, patchMaterialShot, storyboardImageModel]);

    useEffect(() => {
        if (visibleStep !== "video_plan" || !snapshot) return;
        snapshot.segments.forEach((segment) => segment.materialShots.forEach((shot) => {
            if (!shot.storyboardAssetId && (shot.storyboardStatus === "queued" || shot.storyboardStatus === "running")) void generateStoryboard(segment.id, shot.id);
        }));
    }, [generateStoryboard, snapshot, visibleStep]);

    const generateLtx = useCallback(async (segmentId: string) => {
        const state = useCourseFlowStore.getState();
        if (state.project.sceneMode !== "green_screen") return;
        const segment = state.segments.find((item) => item.id === segmentId);
        const audio = segment?.audioVersions.find((item) => item.id === segment.selectedAudioId);
        if (!segment || !audio?.assetId || !state.scene?.assetId || videoLaunching.current.has(`ltx:${segmentId}`)) return;
        if (!ltxModel) return message.error("尚未配置 LTX 视频模型");
        const key = `ltx:${segmentId}`; videoLaunching.current.add(key);
        let outputId = ""; let generationId = "";
        try {
            const promptResult = await runCourseFlowAction<{ prompt: string }>({ action: "course-flow-get-ltx-prompt", projectId });
            const clientRequestId = crypto.randomUUID();
            const row = await beginCourseFlowVideo({ projectId, segmentId, track: "ltx", prompt: promptResult.prompt, clientRequestId });
            outputId = row.id; await refresh();
            const scene = { id: "course-scene", name: "课程绿幕场景", type: "image", dataUrl: state.scene.url, url: state.scene.url, storageKey: state.scene.assetId };
            const audioReference = { id: audio.id, name: `片段 ${segment.position + 1} 音频`, type: "audio", url: audio.url, storageKey: audio.assetId, durationMs: audio.durationMs };
            const result = await new Promise<VideoGenerationResult>((resolve, reject) => {
                void requestVideoGeneration({ ...config, model: ltxModel, videoModel: ltxModel, videoInputMode: "multimodal", videoSeconds: String(Math.ceil(audio.durationMs / 1000)), videoStage1Review: "false", size: courseSceneLtxSize(ltxModel, state.project.sceneAspectRatio) }, promptResult.prompt, [], [], [audioReference], { clientRequestId, ltxFrames: { firstFrame: scene, lastFrame: scene }, onJobCreated: (id) => { generationId = id; }, onArchived: resolve }).catch(reject);
            });
            const file = await storeGeneratedVideo(result);
            if (!file.storageKey) throw new Error("LTX 视频尚未完成归档");
            if (result.url) await cacheCourseFlowAsset(file.storageKey, await (await fetch(result.url)).blob());
            await finishCourseFlowVideo(outputId, { assetId: file.storageKey, generationId });
        } catch (error) { if (outputId) await finishCourseFlowVideo(outputId, { error: error instanceof Error ? error.message : "LTX 视频生成失败" }); message.error(error instanceof Error ? error.message : "LTX 视频生成失败"); }
        finally { videoLaunching.current.delete(key); await refresh(); }
    }, [config, ltxModel, message, projectId, refresh]);

    const generateShot = useCallback(async (segmentId: string, shotId: string) => {
        const state = useCourseFlowStore.getState();
        const segment = state.segments.find((item) => item.id === segmentId);
        const shot = segment?.materialShots.find((item) => item.id === shotId);
        const key = `material:${shotId}`;
        if (!segment || !shot || videoLaunching.current.has(key)) return;
        if (state.project.sceneMode === "green_screen" && state.segments.some((item) => item.ltxVideo?.status !== "ready")) return message.info("角色视频全部完成后再生成素材视频");
        if (!shot.storyboardAssetId) return message.error("请先生成并确认该画面的分镜图");
        if (!h3Model) return message.error("素材视频生成通道尚未配置");
        videoLaunching.current.add(key); let outputId = ""; let generationId = "";
        try {
            const generationPrompt = composeH3MaterialVideoPrompt(state.project.materialStylePrompt, shot.prompt);
            const selection = courseMaterialH3Selection(state.project.sceneAspectRatio);
            const clientRequestId = crypto.randomUUID();
            const row = await beginCourseFlowVideo({ projectId, segmentId, shotId, track: "material", prompt: generationPrompt, clientRequestId });
            outputId = row.id; await refresh();
            const storyboard = { id: shot.storyboardAssetId, name: "分镜参考", type: "image", dataUrl: shot.storyboardUrl, url: shot.storyboardUrl, storageKey: shot.storyboardAssetId };
            const results = await requestVideoGeneration({ ...config, model: h3Model, videoModel: h3Model, videoInputMode: "multimodal", videoSeconds: String(Math.ceil(shot.durationSeconds)), vquality: selection.quality, size: selection.size, videoGenerateAudio: "false", videoReferenceSizePolicy: "match" }, generationPrompt, [storyboard], [], [], { clientRequestId, onJobCreated: (id) => { generationId = id; } });
            const result = results[0]; if (!result) throw new Error("素材视频没有返回结果");
            const file = await storeGeneratedVideo(result); if (!file.storageKey) throw new Error("素材视频尚未归档");
            if (result.url) await cacheCourseFlowAsset(file.storageKey, await (await fetch(result.url)).blob());
            await finishCourseFlowVideo(outputId, { assetId: file.storageKey, generationId });
        } catch (error) { if (outputId) await finishCourseFlowVideo(outputId, { error: error instanceof Error ? error.message : "素材视频生成失败" }); message.error(error instanceof Error ? error.message : "素材视频生成失败"); }
        finally { videoLaunching.current.delete(key); await refresh(); }
    }, [config, h3Model, message, projectId, refresh]);

    useEffect(() => {
        if (visibleStep !== "video" || !snapshot) return;
        const phase = courseVideoGenerationPhase(snapshot.project.sceneMode || "general", snapshot.segments);
        if (phase === "ltx") snapshot.segments.filter((segment) => !segment.ltxVideo).forEach((segment) => void generateLtx(segment.id));
        if (phase === "material") snapshot.segments.forEach((segment) => segment.materialShots.filter((shot) => !shot.video).forEach((shot) => void generateShot(segment.id, shot.id)));
    }, [generateLtx, generateShot, snapshot, visibleStep]);
    const exportZip = async () => {
        const state = useCourseFlowStore.getState(); setExporting(true);
        try {
            const zip = await createCourseFlowExport({
                title: state.project.title,
                scene: state.scene?.assetId ? { assetId: state.scene.assetId, prompt: state.scene.prompt } : null,
                segments: state.segments.map((segment) => {
                    const audio = segment.audioVersions.find((item) => item.id === segment.selectedAudioId);
                    return { id: segment.id, position: segment.position, text: segment.text, voiceDirection: segment.voiceDirection, selectedAudio: audio?.assetId ? { assetId: audio.assetId, durationMs: audio.durationMs } : null, ltx: segment.ltxVideo?.assetId ? { assetId: segment.ltxVideo.assetId, prompt: segment.ltxVideo.prompt } : null, shots: segment.materialShots.map((shot) => ({ position: shot.position, prompt: shot.prompt, assetId: shot.video?.assetId || null })) };
                }),
            }, (assetId) => resolveCourseFlowAsset(assetId, async (id) => { const asset = await getCloudAsset(id); if (!asset.url) throw new Error("导出素材不可用"); return (await fetch(asset.url)).blob(); }));
            saveAs(zip, `${state.project.title || "Course-Flow"}.zip`);
            await updateCourseFlowProject(projectId, { current_step: "export" }); setVisibleStep("export"); await refresh();
            message.success("Course Flow ZIP 已导出");
        } catch (error) { message.error(error instanceof Error ? error.message : "导出失败"); }
        finally { setExporting(false); }
    };

    if (query.isError) return <Result status="error" title="Course Flow 无法打开" subTitle={query.error instanceof Error ? query.error.message : "项目读取失败"} extra={<Button onClick={() => void query.refetch()}>重新加载</Button>} />;
    if (query.isLoading || !snapshot) return <WorkspacePage><div className="m-auto w-full max-w-5xl p-8"><Skeleton active paragraph={{ rows: 12 }} /></div></WorkspacePage>;
    const audioRegenerationSegment = snapshot.segments.find((segment) => segment.id === audioRegenerationTarget?.segmentId);
    const topBar = <><header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-[var(--surface-raised)] px-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><Button type="text" icon={<ArrowLeft className="size-5" />} aria-label="返回内容生产中心" onClick={() => navigate("/content")} /><strong className="truncate">课程视频 · {snapshot.project.title}</strong><span className="hidden text-xs text-muted-foreground sm:inline">已自动保存</span></div>{isSuperuser ? <Button type="text" icon={<Settings2 className="size-4" />} onClick={() => setPromptDrawer(true)}>提示词调优</Button> : null}</header><CourseFlowSteps current={visibleStep} availableThrough={snapshot.project.currentStep} sceneMode={snapshot.project.sceneMode} onSelect={setVisibleStep} /></>;
    return (
        <WorkspacePage topBar={topBar}>
            <CourseFlowStepCache key={`${projectId}:role`} active={visibleStep === "role"}><RoleStep roles={snapshot.roles} selectedRoleId={snapshot.project.roleId} onSelect={(role) => void chooseRole(role)} onCreate={() => setRoleModal(true)} onNext={() => void goTo("script_scene")} /></CourseFlowStepCache>
            <CourseFlowStepCache key={`${projectId}:script_scene`} active={visibleStep === "script_scene"}><ScriptSceneStep sceneMode={snapshot.project.sceneMode} segments={snapshot.segments} scene={snapshot.scene} scriptGenerating={scriptGenerating} scriptEnhancing={scriptEnhancing} sceneGenerating={sceneGenerating} aspectRatio={snapshot.project.sceneAspectRatio} regeneratingSegmentIds={regeneratingSegmentIds} insertingDividerKeys={insertingDividerKeys} scriptInput={{ ratioOptions: sceneRatioOptions, onSubmit: (values) => void submitScript(values) }} sceneMediaActions={{ replacing: sceneReplacing, onChoose: () => setSceneAssetPickerOpen(true), onUpload: uploadScene }} onOpenInput={() => setScriptModal(true)} onEnhance={() => setEnhanceModal(true)} onSaveSegment={(id, patch) => void saveSegment(id, patch)} onConfirmSegment={(id) => void confirmScriptSegment(id)} onDeleteSegment={(id) => void deleteSegment(id)} onInsertSegment={(previousId, nextId, instruction) => void insertSegment(previousId, nextId, instruction)} onRegenerateSegment={(id, direction) => void regenerateSegment(id, direction)} onRegenerateScene={() => setSceneRegenerationModal(true)} onNext={() => void goTo("audio")} /></CourseFlowStepCache>
            <CourseFlowStepCache key={`${projectId}:audio`} active={visibleStep === "audio"}><AudioStep segments={snapshot.segments} batchRegenerating={batchAudioRegenerating} onSelect={(segmentId, audioId) => void selectAudio(segmentId, audioId)} onPlayed={markPlayed} onRegenerate={(segmentId, audioId) => setAudioRegenerationTarget({ segmentId, audioId })} onDownload={downloadAudio} onRegenerateAll={() => setBatchAudioRegenerationOpen(true)} onConfirmPlan={(segmentId) => void confirmPlanSegment(segmentId)} onDurationResolved={resolveAudioDuration} onNext={() => void goTo("video_plan")} /></CourseFlowStepCache>
            <CourseFlowStepCache key={`${projectId}:video_plan`} active={visibleStep === "video_plan"}><VideoPlanningStep segments={snapshot.segments} materialStylePrompt={snapshot.project.materialStylePrompt} planningSegmentIds={planningSegmentIds} planningErrors={planningErrors} savingStyle={savingStyle} aspectRatio={snapshot.project.sceneAspectRatio} onStyleChange={(value) => void saveMaterialStyle(value)} onRegenerateSegment={(segmentId) => void planSegment(segmentId)} onShotPromptChange={editShotPrompt} onShotPromptSave={(shotId, value) => void saveShotPrompt(shotId, value)} onRegenerateStoryboard={(segmentId, shotId) => void generateStoryboard(segmentId, shotId, true)} onNext={() => void goTo("video")} /></CourseFlowStepCache>
            <CourseFlowStepCache key={`${projectId}:video`} active={visibleStep === "video"}><VideoStep sceneMode={snapshot.project.sceneMode || "general"} segments={snapshot.segments} exporting={exporting} onRegenerateLtx={(id) => void generateLtx(id)} onRegenerateShot={(segmentId, shotId) => void generateShot(segmentId, shotId)} onEnhanced={() => void refresh()} onExport={() => void exportZip()} /></CourseFlowStepCache>
            <CourseFlowStepCache key={`${projectId}:export`} active={visibleStep === "export"}><div className="m-auto max-w-lg px-6 text-center"><div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-border bg-[var(--surface-raised)]"><Download className="size-6" /></div><h1 className="mt-6 text-2xl font-semibold">课程素材已准备好</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{courseFlowExportDescription(snapshot.project.sceneMode || "general")}</p><Button className="mt-6" type="primary" loading={exporting} onClick={() => void exportZip()}>再次导出 ZIP</Button></div></CourseFlowStepCache>
            <CreateRoleModal open={roleModal} config={config} speechModel={speechModel} voices={voiceOptions} onClose={() => setRoleModal(false)} onCreated={() => { setRoleModal(false); void refresh(); }} />
            <ScriptInputModal open={scriptModal} initialAspectRatio={snapshot.project.sceneAspectRatio} initialInput={scriptInitialInput} projectSceneMode={snapshot.project.sceneMode} ratioOptions={sceneRatioOptions} onClose={() => setScriptModal(false)} onSubmit={(values) => void submitScript(values)} />
            <EnhanceScriptModal open={enhanceModal} onClose={() => setEnhanceModal(false)} onSubmit={(instruction) => void enhanceScript(instruction)} />
            <SceneRegenerationModal open={sceneRegenerationModal} onClose={() => setSceneRegenerationModal(false)} onSubmit={(input) => {
                setSceneRegenerationModal(false);
                void generateScene(input).catch((error) => message.error(error instanceof Error ? error.message : "场景生成失败"));
            }} />
            <AssetPickerModal open={sceneAssetPickerOpen} title="选择课程场景" allowedKinds={["image"]} onInsert={chooseSceneAsset} onClose={() => setSceneAssetPickerOpen(false)} />
            <AudioRegenerationModal
                open={Boolean(audioRegenerationTarget && audioRegenerationSegment)}
                segmentText={audioRegenerationSegment?.text || ""}
                initialValues={{
                    voiceDirection: audioRegenerationSegment?.voiceDirection || "",
                    speed: normalizeAudioSpeedValue(config.audioSpeed),
                    volume: normalizeAudioVolumeValue(config.audioVolume),
                    pitch: normalizeAudioPitchValue(config.audioPitch),
                    format: normalizeAudioFormatValue(config.audioFormat),
                }}
                onClose={() => setAudioRegenerationTarget(null)}
                onOptimize={optimizeRegenerationVoiceDirection}
                onSubmit={(values) => {
                    const target = audioRegenerationTarget;
                    setAudioRegenerationTarget(null);
                    if (target) void generateAudio(target.segmentId, undefined, values);
                }}
            />
            <BatchAudioRegenerationModal
                open={batchAudioRegenerationOpen}
                initialValues={{
                    speed: normalizeAudioSpeedValue(config.audioSpeed),
                    volume: normalizeAudioVolumeValue(config.audioVolume),
                    pitch: normalizeAudioPitchValue(config.audioPitch),
                    format: normalizeAudioFormatValue(config.audioFormat),
                }}
                onClose={() => setBatchAudioRegenerationOpen(false)}
                onSubmit={(values) => void regenerateAllAudio(values)}
            />
            <PromptTuningDrawer open={promptDrawer} onClose={() => setPromptDrawer(false)} />
        </WorkspacePage>
    );
}

function hasRunning(snapshot?: Awaited<ReturnType<typeof getCourseFlowSnapshot>>) {
    return Boolean(snapshot?.segments.some((segment) => segment.audioVersions.some((audio) => audio.status === "queued" || audio.status === "running") || segment.ltxVideo?.status === "queued" || segment.ltxVideo?.status === "running" || segment.materialShots.some((shot) => shot.storyboardStatus === "queued" || shot.storyboardStatus === "running" || shot.video?.status === "queued" || shot.video?.status === "running")) || snapshot?.scene?.status === "queued" || snapshot?.scene?.status === "running");
}
