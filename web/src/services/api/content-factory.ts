import { supabase } from "@/lib/supabase/client";
import { withAssetUrl } from "./cloud-assets";
import { functionErrorMessage } from "./generation-client";
import type { FactoryArtifactVersion, FactoryLayer, FactorySection, FactorySnapshot, FactoryTask } from "@/types/content-factory";

type Row = Record<string, any>;
const layers: FactoryLayer[] = ["script", "audio", "visual_prompt", "image", "video"];

export async function listContentFactoryTasks(): Promise<FactoryTask[]> {
    const { data: workflows, error } = await supabase.from("content_workflow_projects").select("id,title,updated_at").eq("workflow_type", "content-factory").order("updated_at", { ascending: false });
    if (error) throw error;
    const ids = (workflows || []).map((item) => item.id);
    if (!ids.length) return [];
    const [{ data: courses, error: courseError }, { data: factories, error: factoryError }, { data: segments, error: segmentError }, { data: artifacts, error: artifactError }] = await Promise.all([
        supabase.from("course_flow_projects").select("project_id,role_id,course_flow_roles(name)").in("project_id", ids),
        supabase.from("content_factory_projects").select("*").in("project_id", ids),
        supabase.from("course_flow_segments").select("id,project_id").in("project_id", ids),
        supabase.from("content_factory_artifact_versions").select("project_id,segment_id,layer,status,stale,selected").in("project_id", ids).eq("selected", true),
    ]);
    if (courseError || factoryError || segmentError || artifactError) throw courseError || factoryError || segmentError || artifactError;
    return (workflows || []).map((workflow) => {
        const course = courses?.find((item) => item.project_id === workflow.id) as Row | undefined;
        const factory = factories?.find((item) => item.project_id === workflow.id) as Row | undefined;
        const projectSegments = (segments || []).filter((item) => item.project_id === workflow.id);
        const readyCount = projectSegments.filter((segment) => artifacts?.some((artifact) => artifact.segment_id === segment.id && artifact.layer === "video" && artifact.status === "ready" && !artifact.stale)).length;
        return { id: workflow.id, title: workflow.title, updatedAt: workflow.updated_at, status: factory?.status || "draft", currentStage: factory?.current_stage || "script", roleName: relationOne(course?.course_flow_roles)?.name || "未选择", sectionCount: projectSegments.length, readyCount } as FactoryTask;
    });
}

export async function initializeContentFactoryProject(projectId: string, clientRequestId: string) {
    const { data, error } = await supabase.rpc("initialize_content_factory_project", { p_project_id: projectId, p_client_request_id: clientRequestId });
    if (error) throw error;
    return data;
}

export async function configureContentFactoryProject(projectId: string, input: { title: string; roleId: string; durationText: string }) {
    const [{ error: workflowError }, { error: courseError }] = await Promise.all([
        supabase.from("content_workflow_projects").update({ title: input.title.trim(), updated_at: new Date().toISOString() }).eq("id", projectId),
        supabase.from("course_flow_projects").update({ role_id: input.roleId, duration_text: input.durationText.trim(), updated_at: new Date().toISOString() }).eq("project_id", projectId),
    ]);
    if (workflowError || courseError) throw workflowError || courseError;
}

export async function generateContentFactoryScript(projectId: string, input: { topic: string; audience: string; extraPrompt: string; aspectRatio: string }) {
    const { data: course } = await supabase.from("course_flow_projects").select("duration_text").eq("project_id", projectId).single();
    const extraPrompt = [`期望总时长：${course?.duration_text || "未指定"}`, input.extraPrompt.trim()].filter(Boolean).join("\n");
    const { data, error } = await supabase.functions.invoke("content-orchestrate", { body: { action: "course-flow-generate-segments", projectId, topic: input.topic, audience: input.audience, extraPrompt, sceneMode: "general", sceneAspectRatio: input.aspectRatio } });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "文案生成失败");
    return data;
}

export async function getContentFactoryRoles() {
    const { data, error } = await supabase.from("course_flow_roles").select("id,name,description,voice_name").is("archived_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getContentFactorySnapshot(projectId: string): Promise<FactorySnapshot> {
    const [{ data: workflow, error: workflowError }, { data: course, error: courseError }, { data: factory, error: factoryError }, { data: segments, error: segmentError }, { data: artifacts, error: artifactError }, { data: composition, error: compositionError }] = await Promise.all([
        supabase.from("content_workflow_projects").select("id,title,updated_at").eq("id", projectId).eq("workflow_type", "content-factory").single(),
        supabase.from("course_flow_projects").select("*,course_flow_roles(name)").eq("project_id", projectId).single(),
        supabase.from("content_factory_projects").select("*").eq("project_id", projectId).single(),
        supabase.from("course_flow_segments").select("*").eq("project_id", projectId).order("position"),
        supabase.from("content_factory_artifact_versions").select("*").eq("project_id", projectId).order("version"),
        supabase.from("content_factory_compositions").select("*").eq("project_id", projectId).order("revision", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const failure = [workflowError, courseError, factoryError, segmentError, artifactError, compositionError].find(Boolean);
    if (failure || !workflow || !course || !factory) throw failure || new Error("内容工厂项目不存在");
    const assetIds = Array.from(new Set([...(artifacts || []).map((item) => item.asset_id), composition?.asset_id].filter(Boolean))) as string[];
    const { data: assetRows, error: assetError } = assetIds.length ? await supabase.from("assets").select("*").in("id", assetIds) : { data: [], error: null };
    if (assetError) throw assetError;
    const assets = new Map((await Promise.all((assetRows || []).map(withAssetUrl))).map((asset) => [asset.id, asset]));
    const sections: FactorySection[] = (segments || []).map((segment) => {
        const grouped = Object.fromEntries(layers.map((layer) => [layer, (artifacts || []).filter((item) => item.segment_id === segment.id && item.layer === layer).map((item) => mapArtifact(item, assets))])) as Record<FactoryLayer, FactoryArtifactVersion[]>;
        if (!grouped.script.length) grouped.script = [{ id: `draft:${segment.id}`, layer: "script", version: Number(segment.revision), selected: true, stale: false, status: "ready", text: segment.text, assetId: null, url: "", durationMs: 0, errorMessage: null }];
        return { id: segment.id, position: Number(segment.position), artifacts: grouped };
    });
    return { project: { id: workflow.id, title: workflow.title, status: factory.status, currentStage: factory.current_stage, roleId: course.role_id || null, roleName: relationOne(course.course_flow_roles)?.name || "未选择", topic: course.topic || "", audience: course.audience || "", extraPrompt: course.extra_prompt || "", durationText: course.duration_text || "", aspectRatio: course.scene_aspect_ratio || "16:9", updatedAt: workflow.updated_at, finalAssetId: composition?.asset_id || null, finalUrl: assets.get(composition?.asset_id)?.url || "" }, sections };
}

export async function startContentFactoryAutomation(projectId: string) {
    const { data, error } = await supabase.rpc("start_content_factory_automation", { p_project_id: projectId });
    if (error) throw error;
    return data;
}

export async function saveFactoryTextVersion(projectId: string, segmentId: string, layer: "script" | "visual_prompt", text: string, sourceArtifactId?: string | null) {
    const { data, error } = await supabase.rpc("create_content_factory_artifact_version", { p_project_id: projectId, p_segment_id: segmentId, p_layer: layer, p_text_content: text.trim(), p_source_artifact_id: sourceArtifactId || null });
    if (error) throw error;
    return data;
}

export async function regenerateFactoryArtifact(projectId: string, segmentId: string, layer: Exclude<FactoryLayer, "script">, sourceArtifactId: string) {
    const { data, error } = await supabase.rpc("create_content_factory_artifact_version", { p_project_id: projectId, p_segment_id: segmentId, p_layer: layer, p_text_content: "", p_source_artifact_id: sourceArtifactId });
    if (error) throw error;
    return data;
}

export async function regenerateFactoryScript(projectId: string, segmentId: string) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", { body: { action: "course-flow-regenerate-segment", projectId, segmentId, direction: "保持原意，重新组织为自然、清晰、适合视频口播的一段文案" } });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "文案重新生成失败");
    const segment = data?.segment;
    if (!segment?.text) throw new Error("文案重新生成没有返回内容");
    return saveFactoryTextVersion(projectId, segmentId, "script", segment.text);
}

export async function selectFactoryArtifactVersion(artifactId: string) {
    const { data, error } = await supabase.rpc("select_content_factory_artifact_version", { p_artifact_id: artifactId });
    if (error) throw error;
    return data;
}

export async function deleteFactorySection(projectId: string, segmentId: string) {
    const { error } = await supabase.rpc("delete_content_factory_section", { p_project_id: projectId, p_segment_id: segmentId });
    if (error) throw error;
}

export async function insertFactorySection(projectId: string, position: number, text: string) {
    const { data, error } = await supabase.rpc("insert_content_factory_section", { p_project_id: projectId, p_position: position, p_text: text.trim() });
    if (error || !data) throw error || new Error("Section 创建失败");
    return data.id;
}

export async function requestContentFactoryExport(projectId: string) {
    const { data, error } = await supabase.rpc("request_content_factory_export", { p_project_id: projectId });
    if (error) throw error;
    return data;
}

function mapArtifact(row: Row, assets: Map<string, Row>): FactoryArtifactVersion {
    return { id: row.id, layer: row.layer, version: Number(row.version), selected: Boolean(row.selected), stale: Boolean(row.stale), status: row.status, text: row.text_content || "", assetId: row.asset_id || null, url: assets.get(row.asset_id)?.url || "", durationMs: Number(row.duration_ms || 0), errorMessage: row.error_message || null };
}

function relationOne(value: any) { return Array.isArray(value) ? value[0] : value; }
