import { supabase } from "@/lib/supabase/client";
import { functionErrorMessage } from "./generation-client";
import { getCloudAsset } from "./cloud-assets";
import { cancelGeneration } from "./usage";
import type { KouboAudioNode, KouboImageResult, KouboScriptGroup, KouboSegment, KouboVideoCandidate, KouboWorkspace } from "@/types/koubo-video";
import type { VideoWorkflowType } from "@/types/content-production";

type Row = Record<string, any>;

export function mapKouboSegment(row: Row): KouboSegment {
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        scriptGroupId: String(row.script_group_id),
        position: Number(row.position),
        text: String(row.text),
        voiceDirection: String(row.voice_direction || ""),
        revision: Number(row.revision),
        generationId: row.generation_id ? String(row.generation_id) : null,
        modelPromptBinding: row.model_prompt_binding || {},
    };
}

export function mapKouboScriptGroup(row: Row): KouboScriptGroup {
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        sourceType: row.source_type,
        sourceInput: String(row.source_input || row.original_text || ""),
        promptVersion: row.prompt_version == null ? null : String(row.prompt_version),
        revision: Number(row.revision),
        generationId: row.generation_id ? String(row.generation_id) : null,
        modelPromptBinding: row.model_prompt_binding || {},
    };
}

export function mapKouboAudioNode(row: Row): KouboAudioNode {
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        segmentId: row.segment_id ? String(row.segment_id) : null,
        parentAudioNodeId: row.parent_audio_node_id ? String(row.parent_audio_node_id) : null,
        segmentationRunId: row.segmentation_run_id ? String(row.segmentation_run_id) : null,
        segmentIndex: row.segment_index == null ? null : Number(row.segment_index),
        assetId: row.asset_id || null,
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
        sourceType: row.source_type,
        sourceStartMs: row.source_start_ms == null ? null : Number(row.source_start_ms),
        sourceEndMs: row.source_end_ms == null ? null : Number(row.source_end_ms),
        sourceSegmentRevision: row.source_segment_revision == null ? null : Number(row.source_segment_revision),
        status: row.status,
        imageResultId: row.image_result_id ? String(row.image_result_id) : null,
        generationId: row.generation_id ? String(row.generation_id) : null,
        clientRequestId: row.client_request_id ? String(row.client_request_id) : null,
        errorMessage: row.error_message ? String(row.error_message) : null,
        generationStage: row.generation_stage || null,
    };
}

function mapImage(row: Row): KouboImageResult {
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        sourceType: row.source_type,
        assetId: row.asset_id || null,
        prompt: String(row.prompt || ""),
        aspectRatio: String(row.aspect_ratio || "16:9"),
        status: row.status,
        personReferenceAssetId: row.person_reference_asset_id ? String(row.person_reference_asset_id) : null,
        backgroundReferenceAssetId: row.background_reference_asset_id ? String(row.background_reference_asset_id) : null,
        generationId: row.generation_id ? String(row.generation_id) : null,
        clientRequestId: row.client_request_id ? String(row.client_request_id) : null,
        errorMessage: row.error_message ? String(row.error_message) : null,
    };
}

function mapVideo(row: Row): KouboVideoCandidate {
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        segmentId: row.segment_id ? String(row.segment_id) : null,
        audioNodeId: String(row.audio_node_id),
        imageResultId: String(row.image_result_id),
        assetId: row.asset_id || null,
        sourceSegmentRevision: row.source_segment_revision == null ? null : Number(row.source_segment_revision),
        status: row.status,
        selected: row.selected === true,
        generationId: row.generation_id ? String(row.generation_id) : null,
        clientRequestId: row.client_request_id ? String(row.client_request_id) : null,
        errorMessage: row.error_message ? String(row.error_message) : null,
        progress: row.progress == null ? null : Number(row.progress),
        generationStage: row.generation_stage ? String(row.generation_stage) : null,
    };
}

function rows<T>(result: { data: T[] | null; error: { message?: string } | null }, message: string) {
    if (result.error) throw new Error(result.error.message || message);
    return result.data || [];
}

export async function getKouboWorkspace(projectId: string, workflowType: VideoWorkflowType = "koubo-video"): Promise<KouboWorkspace | null> {
    const projectResult = await supabase.from("content_workflow_projects").select("id,title,workflow_type").eq("id", projectId).maybeSingle();
    if (projectResult.error) throw new Error(projectResult.error.message || "口播项目读取失败");
    if (!projectResult.data || projectResult.data.workflow_type !== workflowType) return null;
    const ensured = await supabase.rpc("ensure_koubo_project", { p_project_id: projectId });
    if (ensured.error) throw new Error(ensured.error.message || "口播项目初始化失败");
    const [groups, segments, audios, images, videos, compositions] = await Promise.all([
        supabase.from("koubo_script_groups").select("*").eq("project_id", projectId).is("archived_at", null).order("created_at"),
        supabase.from("koubo_segments").select("*").eq("project_id", projectId).is("archived_at", null).order("position"),
        supabase.from("koubo_audio_nodes").select("*").eq("project_id", projectId).order("created_at"),
        supabase.from("koubo_image_results").select("*").eq("project_id", projectId).order("created_at"),
        supabase.from("koubo_video_candidates").select("*").eq("project_id", projectId).order("created_at"),
        supabase.from("koubo_compositions").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    ]);
    const state = Array.isArray(ensured.data) ? ensured.data[0] : ensured.data;
    const audioNodes = rows(audios, "口播音频读取失败").map(mapKouboAudioNode);
    const audioNodesWithUrls = await Promise.all(audioNodes.map(async (audio) => {
        if (!audio.assetId || audio.status !== "ready") return audio;
        const asset = await getCloudAsset(audio.assetId).catch(() => null);
        return asset?.url ? { ...audio, url: asset.url, mimeType: asset.mime_type || "audio/mpeg" } : audio;
    }));
    const imageResults = await Promise.all(rows(images, "口播图片读取失败").map(mapImage).map(async (image) => {
        if (!image.assetId || image.status !== "ready") return image;
        const asset = await getCloudAsset(image.assetId).catch(() => null);
        return asset?.url ? { ...image, url: asset.url, mimeType: asset.mime_type || "image/png" } : image;
    }));
    const videoRows = rows(videos, "口播视频读取失败");
    const videoGenerationIds = videoRows.map((row) => row.generation_id).filter(Boolean);
    const videoJobs = videoGenerationIds.length
        ? await supabase.from("generation_jobs").select("id,metadata").in("id", videoGenerationIds)
        : { data: [], error: null };
    const videoGeneration = new Map((videoJobs.data || []).map((job) => {
        const output = job.metadata?.videoProgress?.["0"];
        return [String(job.id), {
            progress: job.metadata?.progress == null ? output?.progress ?? null : Number(job.metadata.progress),
            stage: output?.stage ? String(output.stage) : null,
        }];
    }));
    const videoCandidates = await Promise.all(videoRows.map((row) => mapVideo({
        ...row,
        progress: row.generation_id ? videoGeneration.get(String(row.generation_id))?.progress : null,
        generation_stage: row.generation_id ? videoGeneration.get(String(row.generation_id))?.stage : null,
    })).map(async (video) => {
        if (!video.assetId || video.status !== "ready") return video;
        const asset = await getCloudAsset(video.assetId).catch(() => null);
        return asset?.url ? { ...video, url: asset.url, mimeType: asset.mime_type || "video/mp4" } : video;
    }));
    return {
        projectId,
        title: projectResult.data.title,
        courseScriptModelId: state.course_script_model_id ? String(state.course_script_model_id) : null,
        status: state.status,
        selectedImageResultId: state.selected_image_result_id || null,
        exportedAt: state.exported_at || null,
        noticeUnread: state.notice_unread === true,
        latestMessage: state.latest_message || null,
        scriptGroups: rows(groups, "口播文案组读取失败").map(mapKouboScriptGroup),
        segments: rows(segments, "口播文案读取失败").map(mapKouboSegment),
        audioNodes: audioNodesWithUrls,
        imageResults,
        videoCandidates,
        compositions: rows(compositions, "合并结果读取失败").map((row) => ({ id: String(row.id), orderedCandidateIds: row.ordered_candidate_ids || [], status: row.status, assetId: row.asset_id || null })),
    };
}

export async function saveCourseScriptModel(projectId: string, modelId: string) {
    const { error } = await supabase.rpc("set_course_script_model", {
        p_project_id: projectId,
        p_model_id: modelId,
    });
    if (error) throw new Error(error.message || "课程文案模型保存失败");
}

export async function markKouboNoticeSeen(projectId: string) {
    const { error } = await supabase.rpc("mark_koubo_notice_seen", { p_project_id: projectId });
    if (error) throw new Error(error.message || "通知状态更新失败");
}

export async function listKouboNotices(ownerId: string) {
    const { data, error } = await supabase.from("koubo_projects")
        .select("project_id,notice_kind,notice_unread,notice_at,latest_message")
        .eq("owner_id", ownerId)
        .eq("notice_unread", true)
        .order("notice_at", { ascending: false });
    if (error) throw new Error(error.message || "口播提醒读取失败");
    return (data || []).map((row) => ({
        id: `koubo:${row.project_id}`,
        projectId: String(row.project_id),
        noticeKind: row.notice_kind as "success" | "attention" | "failure" | null,
        noticeUnread: row.notice_unread === true,
        noticeAt: row.notice_at as string | null,
        latestMessage: row.latest_message as string | null,
    }));
}

export function subscribeKouboWorkspace(projectId: string, onChange: () => void) {
    const channel = ["koubo_projects", "koubo_script_groups", "koubo_segments", "koubo_audio_nodes", "koubo_image_results", "koubo_video_candidates", "koubo_compositions"].reduce(
        (current, table) => current.on("postgres_changes", { event: "*", schema: "public", table, filter: `project_id=eq.${projectId}` }, onChange),
        supabase.channel(`koubo-workspace-${projectId}-${crypto.randomUUID()}`),
    );
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
}

export async function editKouboSegment(input: { segmentId: string; text: string; voiceDirection: string; expectedRevision: number }) {
    const { data, error } = await supabase.rpc("edit_koubo_segment", {
        p_segment_id: input.segmentId, p_text: input.text, p_voice_direction: input.voiceDirection, p_expected_revision: input.expectedRevision,
    });
    if (error) throw new Error(error.message || "口播文案保存失败");
    return mapKouboSegment(data);
}

export async function deleteKouboNodes(projectId: string, nodeIds: string[], audioClientRequestIds: string[] = []) {
    const ids = kouboNodeDatabaseIds(nodeIds);
    const requestIds = Array.from(new Set(audioClientRequestIds.filter(Boolean)));
    const active = await Promise.all([
        ids.audio.length ? supabase.from("koubo_audio_nodes").select("generation_id,client_request_id,status").eq("project_id", projectId).in("id", ids.audio) : Promise.resolve({ data: [], error: null }),
        requestIds.length ? supabase.from("koubo_audio_nodes").select("id,generation_id,client_request_id,status").eq("project_id", projectId).in("client_request_id", requestIds) : Promise.resolve({ data: [], error: null }),
        ids.image.length ? supabase.from("koubo_image_results").select("generation_id,client_request_id,status").eq("project_id", projectId).in("id", ids.image) : Promise.resolve({ data: [], error: null }),
        ids.video.length ? supabase.from("koubo_video_candidates").select("generation_id,client_request_id,status").eq("project_id", projectId).in("id", ids.video) : Promise.resolve({ data: [], error: null }),
    ]);
    const activeRows = active.flatMap((result) => result.data || [])
        .filter((row: any) => ["queued", "running"].includes(row.status));
    const unboundRequestIds = activeRows.filter((row: any) => !row.generation_id && row.client_request_id).map((row: any) => String(row.client_request_id));
    const unboundJobs = unboundRequestIds.length
        ? await supabase.from("generation_jobs").select("id").in("client_request_id", unboundRequestIds).in("status", ["queued", "running"])
        : { data: [], error: null };
    const generationIds = Array.from(new Set([
        ...activeRows
        .filter((row: any) => row.generation_id && ["queued", "running"].includes(row.status))
        .map((row: any) => String(row.generation_id)),
        ...(unboundJobs.data || []).map((row) => String(row.id)),
    ]));
    await Promise.allSettled(generationIds.map(cancelGeneration));
    const persistedRequestNodeIds = (active[1].data || []).map((row: any) => `koubo-audio-${row.id}`);
    const persistedNodeIds = Array.from(new Set([...nodeIds.filter((id) => !id.startsWith("koubo-audio-optimistic-")), ...persistedRequestNodeIds]));
    if (!persistedNodeIds.length) return;
    const { error } = await supabase.rpc("delete_koubo_nodes", { p_project_id: projectId, p_node_ids: persistedNodeIds });
    if (error) throw new Error(error.message || "节点删除失败");
}

export function kouboNodeDatabaseIds(nodeIds: string[]) {
    const collect = (prefix: string) => nodeIds.filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
    return {
        audio: collect("koubo-audio-"),
        image: collect("koubo-image-"),
        video: collect("koubo-video-"),
    };
}

export async function createKouboScriptGroup(input: {
    projectId: string;
    sourceType: "ai" | "pasted";
    sourceInput: string;
    originalText?: string;
    segments: Array<{ text: string; voiceDirection: string }>;
}) {
    const { data, error } = await supabase.rpc("create_koubo_script_group", {
        p_project_id: input.projectId,
        p_source_type: input.sourceType,
        p_source_input: input.sourceInput,
        p_original_text: input.originalText || null,
        p_prompt_version: null,
        p_generation_id: null,
        p_model_prompt_binding: {},
        p_segments: input.segments,
    });
    if (error) throw new Error(error.message || "口播文案组保存失败");
    const segments = await supabase.from("koubo_segments").select("*").eq("script_group_id", String(data)).is("archived_at", null).order("position");
    return rows(segments, "口播文案段读取失败").map(mapKouboSegment);
}

export async function selectKouboImage(projectId: string, imageResultId: string) {
    const { error } = await supabase.rpc("select_koubo_image", { p_project_id: projectId, p_image_result_id: imageResultId });
    if (error) throw new Error(error.message || "选择图片失败");
}

export async function createKouboImageNode(projectId: string, audioNodeId: string) {
    const { data, error } = await supabase.rpc("create_koubo_image_node", {
        p_project_id: projectId,
        p_audio_node_id: audioNodeId,
    });
    if (error) throw new Error(error.message || "首帧图片节点创建失败");
    return mapImage(data);
}

export async function linkKouboAudioImage(audioNodeId: string, imageResultId: string) {
    const { error } = await supabase.rpc("link_koubo_audio_image", {
        p_audio_node_id: audioNodeId,
        p_image_result_id: imageResultId,
    });
    if (error) throw new Error(error.message || "首帧链接失败");
}

export async function unlinkKouboAudioImage(audioNodeId: string, imageResultId: string) {
    const { error } = await supabase.rpc("unlink_koubo_audio_image", {
        p_audio_node_id: audioNodeId,
        p_image_result_id: imageResultId,
    });
    if (error) throw new Error(error.message || "首帧连接解除失败");
}

export async function registerKouboImageAsset(imageResultId: string, assetId: string) {
    const { data, error } = await supabase.rpc("register_koubo_image_asset", {
        p_image_result_id: imageResultId,
        p_asset_id: assetId,
    });
    if (error) throw new Error(error.message || "首帧图片保存失败");
    return mapImage(data);
}

export async function selectKouboVideoCandidate(candidateId: string) {
    const { error } = await supabase.rpc("select_koubo_video_candidate", { p_candidate_id: candidateId });
    if (error) throw new Error(error.message || "采用视频候选失败");
}

export async function registerKouboAudioNode(input: {
    projectId: string;
    segmentId?: string | null;
    assetId: string;
    durationMs: number;
    sourceType: "uploaded" | "recorded";
    sourceSegmentRevision?: number | null;
    clientRequestId: string;
}) {
    const { data, error } = await supabase.rpc("register_koubo_audio_node", {
        p_project_id: input.projectId,
        p_segment_id: input.segmentId || null,
        p_asset_id: input.assetId,
        p_duration_ms: input.durationMs,
        p_source_type: input.sourceType,
        p_source_segment_revision: input.sourceSegmentRevision || null,
        p_client_request_id: input.clientRequestId,
    });
    if (error) throw new Error(error.message || "音频节点保存失败");
    return mapKouboAudioNode(data);
}

export async function replaceKouboAudioSegments(input: {
    parentAudioNodeId: string;
    segmentationRunId: string;
    segments: Array<{ assetId: string; index: number; startMs: number; endMs: number; durationMs: number }>;
}) {
    const { data, error } = await supabase.rpc("replace_koubo_audio_segments", {
        p_parent_audio_node_id: input.parentAudioNodeId,
        p_segmentation_run_id: input.segmentationRunId,
        p_segments: input.segments.map((segment) => ({
            assetId: segment.assetId,
            index: segment.index,
            startMs: segment.startMs,
            endMs: segment.endMs,
            durationMs: segment.durationMs,
        })),
    });
    if (error) throw new Error(error.message || "音频分段保存失败");
    return (data || []).map(mapKouboAudioNode);
}

export async function runKouboAction<T = Record<string, unknown>>(input: Record<string, unknown> & { action: string; projectId: string }) {
    const { data, error } = await supabase.functions.invoke("koubo-orchestrate", { body: input });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "口播任务创建失败");
    return data as T;
}
