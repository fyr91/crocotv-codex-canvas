import { supabase } from "@/lib/supabase/client";
import { getCloudAsset } from "@/services/api/cloud-assets";
import { functionErrorMessage } from "@/services/api/generation-client";
import type {
    CourseFlowAudioVersion,
    CourseFlowMaterialShot,
    CourseFlowRole,
    CourseFlowScene,
    CourseFlowSegment,
    CourseFlowSnapshot,
    CourseFlowVideoOutput,
} from "@/types/course-flow";
import { mapCourseFlowMaterialShot } from "@/pages/content/course-flow/video-planning";
import { courseSegmentConfirmationFields } from "@/pages/content/course-flow/segment-actions";

type Row = Record<string, any>;

export async function initializeCourseFlowProject(projectId: string, clientRequestId: string) {
    const { data, error } = await supabase.rpc("initialize_course_flow_project", { p_project_id: projectId, p_client_request_id: clientRequestId });
    if (error || !data) throw new Error(error?.message || "Course Flow 项目初始化失败");
    return data;
}

export async function getCourseFlowSnapshot(projectId: string): Promise<CourseFlowSnapshot> {
    const [projectResult, rolesResult, segmentsResult, audioResult, listensResult, sceneResult, shotsResult, videosResult] = await Promise.all([
        supabase.from("course_flow_projects").select("*,workflow:content_workflow_projects!inner(title)").eq("project_id", projectId).single(),
        supabase.from("course_flow_roles").select("*").is("archived_at", null).order("created_at", { ascending: false }),
        supabase.from("course_flow_segments").select("*").eq("project_id", projectId).order("position"),
        supabase.from("course_flow_audio_versions").select("*").eq("project_id", projectId).order("version"),
        supabase.from("course_flow_audio_listens").select("audio_version_id"),
        supabase.from("course_flow_scenes").select("*").eq("project_id", projectId).maybeSingle(),
        supabase.from("course_flow_material_shots").select("*").eq("project_id", projectId).order("position"),
        supabase.from("course_flow_video_outputs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    ]);
    const failure = [projectResult, rolesResult, segmentsResult, audioResult, listensResult, sceneResult, shotsResult, videosResult].find((result) => result.error);
    if (failure?.error || !projectResult.data) throw new Error(failure?.error?.message || "Course Flow 项目不可用");
    const rows = {
        roles: rolesResult.data || [], segments: segmentsResult.data || [], audio: audioResult.data || [],
        listens: new Set((listensResult.data || []).map((item) => item.audio_version_id)),
        scene: sceneResult.data, shots: shotsResult.data || [], videos: videosResult.data || [],
    };
    const assetIds = new Set<string>();
    rows.roles.forEach((row) => [row.design_sheet_asset_id, row.front_asset_id, row.preview_asset_id].filter(Boolean).forEach((id) => assetIds.add(id)));
    rows.audio.forEach((row) => row.asset_id && assetIds.add(row.asset_id));
    rows.shots.forEach((row) => row.storyboard_asset_id && assetIds.add(row.storyboard_asset_id));
    if (rows.scene?.asset_id) assetIds.add(rows.scene.asset_id);
    rows.videos.forEach((row) => [row.asset_id, row.enhanced_asset_id].filter(Boolean).forEach((id) => assetIds.add(id)));
    const assets = new Map(await Promise.all([...assetIds].map(async (id) => [id, await getCloudAsset(id)] as const)));
    const roles = rows.roles.map((row) => mapRole(row, assets));
    const videos = rows.videos.map((row) => mapVideo(row, assets));
    const segments = rows.segments.map((row) => mapSegment(row, rows.audio, rows.shots, videos, rows.listens, assets));
    const project = projectResult.data;
    return {
        project: {
            id: project.project_id, title: project.workflow?.title || "课程视频", currentStep: project.current_step,
            roleId: project.role_id || null, sourceType: project.source_type || null, topic: project.topic || "",
            audience: project.audience || "", extraPrompt: project.extra_prompt || "",
            sceneMode: project.scene_mode === "green_screen" || project.scene_mode === "general" ? project.scene_mode : null,
            sceneAspectRatio: project.scene_aspect_ratio || "16:9", materialStylePrompt: project.material_style_prompt, resolution: "720p",
        },
        roles,
        role: roles.find((role) => role.id === project.role_id) || null,
        segments,
        scene: rows.scene ? mapScene(rows.scene, assets) : null,
    };
}

export async function createCourseFlowRole(input: {
    name: string; description: string; designSheetAssetId: string; frontAssetId: string;
    voiceId: string; voiceName: string; previewAssetId: string;
}) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("登录状态已失效");
    const { data, error } = await supabase.from("course_flow_roles").insert({
        creator_id: user.user.id, name: input.name.trim(), description: input.description.trim(),
        design_sheet_asset_id: input.designSheetAssetId, front_asset_id: input.frontAssetId,
        voice_id: input.voiceId, voice_name: input.voiceName, preview_asset_id: input.previewAssetId,
    }).select("*").single();
    if (error || !data) throw new Error(error?.message || "角色创建失败");
    return data;
}

export async function selectCourseFlowRole(projectId: string, roleId: string) {
    const { error } = await supabase.from("course_flow_projects").update({ role_id: roleId, updated_at: new Date().toISOString() }).eq("project_id", projectId);
    if (error) throw error;
}

export async function updateCourseFlowProject(projectId: string, patch: Row) {
    const { error } = await supabase.from("course_flow_projects").update({ ...patch, updated_at: new Date().toISOString() }).eq("project_id", projectId);
    if (error) throw error;
}

export async function updateCourseFlowSegment(segmentId: string, patch: { text?: string; voiceDirection?: string; revision?: number }) {
    const values: Row = { updated_at: new Date().toISOString() };
    if (patch.text != null) values.text = patch.text;
    if (patch.voiceDirection != null) values.voice_direction = patch.voiceDirection;
    if (patch.revision != null) values.revision = patch.revision;
    let request = supabase.from("course_flow_segments").update(values).eq("id", segmentId);
    if (patch.revision != null) request = request.lt("revision", patch.revision);
    const { error } = await request;
    if (error) throw error;
}

export async function confirmCourseFlowScript(segmentId: string, revision: number) {
    const { error } = await supabase.from("course_flow_segments").update({ confirmed_script_revision: revision, updated_at: new Date().toISOString() }).eq("id", segmentId);
    if (error) throw error;
}

export async function confirmCourseFlowPlan(segmentId: string, audioId: string) {
    const { error } = await supabase.from("course_flow_segments").update({ confirmed_plan_audio_id: audioId, updated_at: new Date().toISOString() }).eq("id", segmentId);
    if (error) throw error;
}

export async function deleteCourseFlowSegment(projectId: string, segmentId: string) {
    const { error } = await supabase.rpc("delete_course_flow_segment", { p_project_id: projectId, p_segment_id: segmentId });
    if (error) throw error;
}

export async function runCourseFlowAction<T>(body: Row): Promise<T> {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", { body });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "Course Flow 操作失败");
    return data as T;
}

export function getCourseFlowStoryboardPrompt(projectId: string) {
    return runCourseFlowAction<{ promptId: string; version: number; systemPrompt: string }>({
        action: "course-flow-get-storyboard-prompt",
        projectId,
    });
}

export async function registerCourseFlowScene(projectId: string, input: { assetId: string; generationId?: string; prompt: string }) {
    const { error } = await supabase.from("course_flow_scenes").update({ prompt: input.prompt, asset_id: input.assetId, generation_id: input.generationId || null, status: "ready", error_message: null, updated_at: new Date().toISOString() }).eq("project_id", projectId);
    if (error) throw error;
}

export async function markCourseFlowSceneRunning(projectId: string, generationId: string) {
    const { error } = await supabase.from("course_flow_scenes").update({ generation_id: generationId, status: "running", error_message: null, updated_at: new Date().toISOString() }).eq("project_id", projectId);
    if (error) throw error;
}

export async function failCourseFlowScene(projectId: string, errorMessage: string) {
    const { error } = await supabase.from("course_flow_scenes").update({ status: "failed", error_message: errorMessage, updated_at: new Date().toISOString() }).eq("project_id", projectId);
    if (error) throw error;
}

export async function beginCourseFlowAudio(projectId: string, segmentId: string, version: number, sourceSegmentRevision: number, clientRequestId: string) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("登录状态已失效");
    const values = { asset_id: null, generation_id: null, duration_ms: null, status: "running", error_message: null, client_request_id: clientRequestId, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("course_flow_audio_versions").insert({ project_id: projectId, segment_id: segmentId, owner_id: user.user.id, version, source_segment_revision: sourceSegmentRevision, ...values }).select("*").single();
    if (error || !data) throw new Error(error?.message || "音频任务登记失败");
    await supabase.from("course_flow_segments").update({ selected_audio_id: data.id }).eq("id", segmentId);
    return data;
}

export async function deleteCourseFlowSegmentAudio(projectId: string, segmentId: string, keepAudioId: string) {
    const { error } = await supabase.from("course_flow_audio_versions").delete().eq("project_id", projectId).eq("segment_id", segmentId).neq("id", keepAudioId);
    if (error) throw error;
}

export async function finishCourseFlowAudio(audioId: string, clientRequestId: string, input: { assetId?: string; generationId?: string; durationMs?: number; error?: string }) {
    const { error } = await supabase.from("course_flow_audio_versions").update({ asset_id: input.assetId || null, generation_id: input.generationId || null, duration_ms: input.durationMs || null, status: input.error ? "failed" : "ready", error_message: input.error || null, updated_at: new Date().toISOString() }).eq("id", audioId).eq("client_request_id", clientRequestId);
    if (error) throw error;
}

export async function updateCourseFlowAudioDuration(audioId: string, durationMs: number) {
    const { error } = await supabase.from("course_flow_audio_versions").update({ duration_ms: Math.round(durationMs), updated_at: new Date().toISOString() }).eq("id", audioId);
    if (error) throw error;
}

export async function selectCourseFlowAudio(segmentId: string, audioId: string) {
    const { error } = await supabase.from("course_flow_segments").update({ selected_audio_id: audioId, updated_at: new Date().toISOString() }).eq("id", segmentId);
    if (error) throw error;
}

export async function markCourseFlowAudioPlayed(audioId: string) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { error } = await supabase.from("course_flow_audio_listens").upsert({ audio_version_id: audioId, user_id: user.user.id, played_at: new Date().toISOString() });
    if (error) throw error;
}

export async function beginCourseFlowVideo(input: { projectId: string; segmentId: string; shotId?: string; track: "ltx" | "material"; prompt: string; clientRequestId: string }) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("登录状态已失效");
    const { data, error } = await supabase.from("course_flow_video_outputs").insert({
        project_id: input.projectId, segment_id: input.segmentId, shot_id: input.shotId || null, owner_id: user.user.id,
        track: input.track, prompt: input.prompt, client_request_id: input.clientRequestId, status: "running",
    }).select("*").single();
    if (error || !data) throw new Error(error?.message || "视频任务登记失败");
    return data;
}

export async function updateCourseFlowShot(shotId: string, prompt: string) {
    const { error } = await supabase.from("course_flow_material_shots").update({ prompt, updated_at: new Date().toISOString() }).eq("id", shotId);
    if (error) throw error;
}

export async function beginCourseFlowStoryboard(shotId: string, prompt: string, clientRequestId: string) {
    const { error } = await supabase.from("course_flow_material_shots").update({
        storyboard_prompt: prompt,
        storyboard_generation_id: null,
        storyboard_status: "running",
        storyboard_error_message: null,
        storyboard_client_request_id: clientRequestId,
        updated_at: new Date().toISOString(),
    }).eq("id", shotId);
    if (error) throw error;
}

export async function markCourseFlowStoryboardRunning(shotId: string, clientRequestId: string, generationId: string) {
    const { error } = await supabase.from("course_flow_material_shots").update({
        storyboard_generation_id: generationId,
        updated_at: new Date().toISOString(),
    }).eq("id", shotId).eq("storyboard_client_request_id", clientRequestId);
    if (error) throw error;
}

export async function finishCourseFlowStoryboard(shotId: string, clientRequestId: string, input: { assetId?: string; generationId?: string; prompt?: string; sourcePrompt?: string; error?: string }) {
    if (input.error) {
        const { data, error: readError } = await supabase.from("course_flow_material_shots").select("storyboard_asset_id").eq("id", shotId).eq("storyboard_client_request_id", clientRequestId).maybeSingle();
        if (readError) throw readError;
        if (!data) return;
        const { error } = await supabase.from("course_flow_material_shots").update({
            storyboard_status: data.storyboard_asset_id ? "ready" : "failed",
            storyboard_error_message: input.error,
            updated_at: new Date().toISOString(),
        }).eq("id", shotId).eq("storyboard_client_request_id", clientRequestId);
        if (error) throw error;
        return;
    }
    if (!input.assetId || !input.prompt || !input.sourcePrompt) throw new Error("分镜图归档信息不完整");
    const { error } = await supabase.from("course_flow_material_shots").update({
        storyboard_prompt: input.prompt,
        storyboard_source_prompt: input.sourcePrompt,
        storyboard_asset_id: input.assetId,
        storyboard_generation_id: input.generationId || null,
        storyboard_status: "ready",
        storyboard_error_message: null,
        updated_at: new Date().toISOString(),
    }).eq("id", shotId).eq("storyboard_client_request_id", clientRequestId);
    if (error) throw error;
}

export async function finishCourseFlowVideo(videoId: string, input: { assetId?: string; generationId?: string; error?: string }) {
    const { error } = await supabase.from("course_flow_video_outputs").update({ asset_id: input.assetId || null, generation_id: input.generationId || null, status: input.error ? "failed" : "ready", error_message: input.error || null, updated_at: new Date().toISOString() }).eq("id", videoId);
    if (error) throw error;
}

function mapRole(row: Row, assets: Map<string, Row>): CourseFlowRole {
    return { id: row.id, creatorId: row.creator_id, name: row.name, description: row.description || "", designSheetAssetId: row.design_sheet_asset_id, designSheetUrl: assets.get(row.design_sheet_asset_id)?.url || "", frontAssetId: row.front_asset_id, frontUrl: assets.get(row.front_asset_id)?.url || "", voiceId: row.voice_id, voiceName: row.voice_name, previewAssetId: row.preview_asset_id || null, previewUrl: assets.get(row.preview_asset_id)?.url || "" };
}
function mapAudio(row: Row, listens: Set<string>, assets: Map<string, Row>): CourseFlowAudioVersion {
    return { id: row.id, version: Number(row.version), sourceSegmentRevision: Number(row.source_segment_revision), assetId: row.asset_id || null, url: assets.get(row.asset_id)?.url || "", durationMs: Number(row.duration_ms || 0), status: row.status, errorMessage: row.error_message || null, played: listens.has(row.id) };
}
function mapVideo(row: Row, assets: Map<string, Row>): CourseFlowVideoOutput {
    const preferredAssetId = row.enhanced_asset_id || row.asset_id || null;
    return { id: row.id, segmentId: row.segment_id, shotId: row.shot_id || null, track: row.track, prompt: row.prompt || "", assetId: preferredAssetId, sourceAssetId: row.asset_id || null, enhancedAssetId: row.enhanced_asset_id || null, url: assets.get(preferredAssetId)?.url || "", status: row.status, errorMessage: row.error_message || null, clientRequestId: row.client_request_id };
}
function mapSegment(row: Row, audioRows: Row[], shotRows: Row[], videos: CourseFlowVideoOutput[], listens: Set<string>, assets: Map<string, Row>): CourseFlowSegment {
    const segmentVideos = videos.filter((video) => video.segmentId === row.id);
    const ltxRow = segmentVideos.find((item) => item.track === "ltx") || null;
    const shots: CourseFlowMaterialShot[] = shotRows.filter((shot) => shot.segment_id === row.id).map((shot) => mapCourseFlowMaterialShot({ ...shot, storyboard_url: assets.get(shot.storyboard_asset_id)?.url || "" }, segmentVideos.find((item) => item.shotId === shot.id && item.track === "material") || null));
    return { id: row.id, position: Number(row.position), text: row.text, voiceDirection: row.voice_direction || "", revision: Number(row.revision), ...courseSegmentConfirmationFields(row), selectedAudioId: row.selected_audio_id || null, audioVersions: audioRows.filter((audio) => audio.segment_id === row.id).map((audio) => mapAudio(audio, listens, assets)), ltxVideo: ltxRow || null, materialShots: shots };
}
function mapScene(row: Row, assets: Map<string, Row>): CourseFlowScene {
    return { prompt: row.prompt || "", assetId: row.asset_id || null, url: assets.get(row.asset_id)?.url || "", status: row.status, errorMessage: row.error_message || null };
}
