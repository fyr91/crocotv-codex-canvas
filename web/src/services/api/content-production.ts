import { supabase } from "@/lib/supabase/client";
import { functionErrorMessage, type GenerationJob } from "./generation-client";
import type {
    ContentAttempt,
    ContentActivityEvent,
    ContentClipSelection,
    ContentCompletionVersion,
    ContentDeliveryManifest,
    ContentDeliverySnapshot,
    ContentGenerationRun,
    ContentGlobalSettings,
    ContentInspiration,
    ContentMediaArtifact,
    ContentMember,
    ContentModelPromptBinding,
    ContentModelPromptVersion,
    ContentNode,
    ContentNodeReference,
    ContentProductionStats,
    ContentSourceType,
    ContentStage,
    ContentStagePolicy,
    ContentTopic,
    ContentWorkflowProject,
    ContentVideoWorkflowType,
} from "@/types/content-production";

type Row = Record<string, any>;
type QueryResult<T> = { data: T | null; error: { message?: string; code?: string } | null };

function required<T>(result: QueryResult<T>, fallback: string): T {
    if (result.error) throw new Error(result.error.message || fallback);
    if (result.data == null) throw new Error(fallback);
    return result.data;
}

function list<T>(result: QueryResult<T[]>, fallback: string) {
    if (result.error) throw new Error(result.error.message || fallback);
    return result.data || [];
}

export function mapContentTopicRow(row: Row): ContentTopic {
    return {
        id: row.id,
        workflowType: row.workflow_type,
        title: row.title,
        originalTopic: row.original_topic,
        creationNotes: row.creation_notes || "",
        tags: Array.isArray(row.tags) ? row.tags : [],
        sourceType: row.source_type,
        sourceAssetId: row.source_asset_id || null,
        sourceInspirationId: row.source_inspiration_id || null,
        parentTopicId: row.parent_topic_id || null,
        createdBy: row.created_by,
        ownerId: row.owner_id || null,
        currentAttemptId: row.current_attempt_id || null,
        status: row.status,
        backgroundSnapshot: row.background_snapshot || {},
        latestCompletionVersion: Number(row.latest_completion_version || 0),
        hasPostCompletionChanges: row.has_post_completion_changes === true,
        completedAt: row.completed_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapContentWorkflowProjectRow(row: Row): ContentWorkflowProject {
    const base = {
        id: String(row.id),
        title: String(row.title),
        ownerId: String(row.owner_id),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
    if (row.workflow_type === "topic_content_v1") {
        if (!row.topic_id || !row.topic) throw new Error("Topic 项目数据不完整");
        return { ...base, workflowType: "topic_content_v1", topicId: String(row.topic_id), topic: mapContentTopicRow(row.topic) };
    }
    if (row.workflow_type === "koubo-video" || row.workflow_type === "course-video" || row.workflow_type === "course-flow") {
        return { ...base, workflowType: row.workflow_type, topicId: null };
    }
    throw new Error(`未知工作流类型: ${String(row.workflow_type)}`);
}

export function mapContentAttemptRow(row: Row): ContentAttempt {
    return {
        id: row.id,
        topicId: row.topic_id,
        ownerId: row.owner_id,
        status: row.status,
        abandonReason: row.abandon_reason || null,
        startedAt: row.started_at,
        endedAt: row.ended_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapContentNodeRow(row: Row): ContentNode {
    return {
        id: row.id,
        topicId: row.topic_id,
        attemptId: row.attempt_id,
        parentId: row.parent_id || null,
        nodeType: row.node_type,
        title: row.title || "",
        summary: row.summary || "",
        sortOrder: Number(row.sort_order || 0),
        data: row.data || {},
        status: row.status,
        noticeKind: row.notice_kind || null,
        noticeUnread: row.notice_unread === true,
        noticeAt: row.notice_at || null,
        revision: Number(row.revision || 1),
        createdBy: row.created_by,
        hiddenAt: row.hidden_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapContentReferenceRow(row: Row): ContentNodeReference {
    return {
        id: row.id,
        topicId: row.topic_id,
        attemptId: row.attempt_id,
        nodeId: row.node_id,
        assetId: row.asset_id || null,
        referencedNodeId: row.referenced_node_id || null,
        referenceKind: row.reference_kind,
        purpose: row.purpose || "",
        createdBy: row.created_by,
        createdAt: row.created_at,
    };
}

export function mapContentRunRow(row: Row): ContentGenerationRun {
    return {
        id: row.id,
        topicId: row.topic_id,
        attemptId: row.attempt_id,
        ownerId: row.owner_id,
        rootNodeId: row.root_node_id,
        resultNodeId: row.result_node_id || null,
        stage: row.stage,
        mode: row.mode,
        status: row.status,
        round: Number(row.round || 1),
        maxRounds: Number(row.max_rounds || 1),
        producerModelId: row.producer_model_id || null,
        reviewerModelId: row.reviewer_model_id || null,
        fallbackModelId: row.fallback_model_id || null,
        currentJobId: row.current_job_id || null,
        generationJobIds: Array.isArray(row.generation_job_ids) ? row.generation_job_ids : [],
        outputAssetIds: Array.isArray(row.output_asset_ids) ? row.output_asset_ids : [],
        policySnapshot: row.policy_snapshot || {},
        promptVersion: row.prompt_version || null,
        schemaVersion: row.schema_version || null,
        modelPromptBindings: Array.isArray(row.model_prompt_bindings)
            ? row.model_prompt_bindings.map(mapContentModelPromptBinding)
            : [],
        inputSnapshot: row.input_snapshot || {},
        output: row.output || {},
        reviews: Array.isArray(row.reviews) ? row.reviews : [],
        hardFail: row.hard_fail === true,
        mediaRetryCount: Number(row.media_retry_count || 0),
        mediaRetryLimit: Number(row.media_retry_limit || 0),
        errorMessage: row.error_message || null,
        createdAt: row.created_at,
        startedAt: row.started_at || null,
        completedAt: row.completed_at || null,
        updatedAt: row.updated_at,
    };
}

function mapContentModelPromptBinding(row: Row): ContentModelPromptBinding {
    return {
        promptId: String(row.promptId || row.prompt_id || ""),
        stage: row.stage,
        purposeKey: String(row.purposeKey || row.purpose_key || ""),
        purposeLabel: String(row.purposeLabel || row.purpose_label || ""),
        modelId: String(row.modelId || row.model_id || ""),
        version: Number(row.version || 0),
    };
}

export function mapContentArtifactRow(row: Row): ContentMediaArtifact {
    return {
        id: row.id,
        topicId: row.topic_id,
        attemptId: row.attempt_id,
        nodeId: row.node_id,
        runId: row.run_id || null,
        assetId: row.asset_id,
        ownerId: row.owner_id,
        kind: row.kind,
        source: row.source,
        outputIndex: row.output_index == null ? null : Number(row.output_index),
        metadata: row.metadata || {},
        createdAt: row.created_at,
    };
}

export function mapContentSelectionRow(row: Row): ContentClipSelection {
    return {
        id: row.id,
        topicId: row.topic_id,
        attemptId: row.attempt_id,
        shotNodeId: row.shot_node_id,
        artifactId: row.artifact_id,
        selectedBy: row.selected_by,
        selectedAt: row.selected_at,
    };
}

export function mapContentPolicyRow(row: Row): ContentStagePolicy {
    return {
        stage: row.stage,
        capability: row.capability,
        producerModelId: row.producer_model_id || null,
        reviewerModelId: row.reviewer_model_id || null,
        fallbackModelId: row.fallback_model_id || null,
        validationEnabled: row.validation_enabled === true,
        acceptanceRule: row.acceptance_rule || {},
        maxRounds: Number(row.max_rounds || 1),
        mediaRetryLimit: Number(row.media_retry_limit || 0),
        promptKey: row.prompt_key,
        promptVersion: row.prompt_version,
        schemaVersion: row.schema_version,
        updatedBy: row.updated_by || null,
        updatedAt: row.updated_at,
    };
}

export function mapContentModelPromptVersionRow(row: Row): ContentModelPromptVersion {
    return {
        promptId: String(row.prompt_id || row.id || ""),
        stage: row.stage,
        purposeKey: String(row.purpose_key || ""),
        purposeLabel: String(row.purpose_label || ""),
        version: Number(row.version || 0),
        systemPrompt: String(row.system_prompt || ""),
        active: row.active === true,
        createdBy: row.created_by || null,
        createdAt: row.created_at,
        activatedBy: row.activated_by || null,
        activatedAt: row.activated_at || null,
    };
}

export async function getContentGlobalSettings(): Promise<ContentGlobalSettings> {
    const row = required(await supabase.from("content_global_settings").select("*").eq("id", true).single(), "全局内容背景不存在") as Row;
    return {
        contentGoal: row.content_goal,
        targetAudience: row.target_audience,
        marketLanguage: row.market_language,
        primaryPlatforms: row.primary_platforms || [],
        contentFormat: row.content_format,
        defaultDurationSeconds: Number(row.default_duration_seconds || 60),
        defaultAspectRatio: row.default_aspect_ratio,
        expressionStyle: row.expression_style,
        version: Number(row.version || 1),
        updatedAt: row.updated_at,
    };
}

export async function updateContentGlobalSettings(settings: Omit<ContentGlobalSettings, "version" | "updatedAt">, updatedBy: string) {
    const current = await getContentGlobalSettings();
    const result = await supabase.from("content_global_settings").update({
        content_goal: settings.contentGoal,
        target_audience: settings.targetAudience,
        market_language: settings.marketLanguage,
        primary_platforms: settings.primaryPlatforms,
        content_format: settings.contentFormat,
        default_duration_seconds: settings.defaultDurationSeconds,
        default_aspect_ratio: settings.defaultAspectRatio,
        expression_style: settings.expressionStyle,
        version: current.version + 1,
        updated_by: updatedBy,
    }).eq("id", true).select("*").single();
    return required(result, "全局内容背景保存失败");
}

export async function listContentTopics(filters: { status?: ContentTopic["status"]; ownerId?: string; sourceType?: ContentSourceType; search?: string; tags?: string[]; createdBy?: string; sort?: "newest" | "oldest"; limit?: number } = {}) {
    let query = supabase.from("content_topics").select("*").order("created_at", { ascending: filters.sort === "oldest" }).limit(filters.limit || 200);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
    if (filters.sourceType) query = query.eq("source_type", filters.sourceType);
    if (filters.createdBy) query = query.eq("created_by", filters.createdBy);
    if (filters.tags?.length) query = query.contains("tags", filters.tags);
    if (filters.search?.trim()) query = query.or(`title.ilike.%${filters.search.trim()}%,original_topic.ilike.%${filters.search.trim()}%`);
    return list(await query, "Topic 列表读取失败").map(mapContentTopicRow);
}

export async function getContentTopic(topicId: string) {
    return mapContentTopicRow(required(await supabase.from("content_topics").select("*").eq("id", topicId).single(), "Topic 不存在") as Row);
}

const workflowProjectSelect = "*, topic:content_topics(*)";

export async function listContentWorkflowProjects() {
    return list(await supabase.from("content_workflow_projects").select(workflowProjectSelect).neq("workflow_type", "course-video").order("updated_at", { ascending: false }), "项目列表读取失败").map(mapContentWorkflowProjectRow);
}

export async function getContentWorkflowProject(projectId: string) {
    return mapContentWorkflowProjectRow(required(await supabase.from("content_workflow_projects").select(workflowProjectSelect).eq("id", projectId).single(), "项目不可用") as Row);
}

export async function createContentWorkflowProject(workflowType: ContentVideoWorkflowType) {
    return mapContentWorkflowProjectRow(required(await supabase.rpc("create_content_workflow_project", { p_workflow_type: workflowType }), "项目创建失败") as Row);
}

export async function deleteContentWorkflowProject(projectId: string) {
    return required(await supabase.rpc("delete_content_workflow_project", { p_project_id: projectId }), "项目删除失败") as string;
}

export async function initializeKouboWorkflowProject(projectId: string, clientRequestId: string) {
    return initializeVideoWorkflowProject("koubo-video", projectId, clientRequestId);
}

export async function initializeVideoWorkflowProject(workflowType: ContentVideoWorkflowType, projectId: string, clientRequestId: string) {
    if (workflowType === "course-flow") {
        return mapContentWorkflowProjectRow(required(await supabase.rpc("initialize_course_flow_project", {
            p_project_id: projectId,
            p_client_request_id: clientRequestId,
        }), "Course Flow 项目初始化失败") as Row);
    }
    return mapContentWorkflowProjectRow(required(await supabase.rpc("initialize_koubo_workflow_project", {
        p_workflow_type: workflowType,
        p_project_id: projectId,
        p_client_request_id: clientRequestId,
    }), `${workflowType === "course-video" ? "课程视频" : "口播"}项目初始化失败`) as Row);
}

export type CreateContentTopicInput = {
    title: string;
    originalTopic: string;
    creationNotes: string;
    tags: string[];
    sourceType: ContentSourceType;
    sourceAssetId: string | null;
    sourceInspirationId: string | null;
    claim: boolean;
};

export async function createContentTopic(input: CreateContentTopicInput) {
    return required(await supabase.rpc("create_content_topic", {
        p_title: input.title,
        p_original_topic: input.originalTopic,
        p_creation_notes: input.creationNotes,
        p_tags: input.tags,
        p_source_type: input.sourceType,
        p_source_asset_id: input.sourceAssetId,
        p_source_inspiration_id: input.sourceInspirationId,
        p_claim: input.claim,
    }), "Topic 创建失败") as { topicId: string; attemptId: string | null; claimed: boolean };
}

export async function claimContentTopic(topicId: string) {
    const result = await supabase.rpc("claim_content_topic", { p_topic_id: topicId });
    if (result.error?.message?.includes("已被领取")) throw new Error("这个 Topic 已被其他成员领取");
    return mapContentAttemptRow(required(result, "Topic 领取失败") as Row);
}

export async function abandonContentTopic(topicId: string, reason: string) {
    return required(await supabase.rpc("abandon_content_topic", { p_topic_id: topicId, p_reason: reason }), "Topic 放弃失败") as boolean;
}

export async function completeContentTopic(topicId: string, finalAssetIds: string[], notes: string) {
    const row = required(await supabase.rpc("complete_content_topic", { p_topic_id: topicId, p_final_asset_ids: finalAssetIds, p_notes: notes }), "Topic 完成失败") as Row;
    return mapCompletionRow(row);
}

export async function getContentAttempt(attemptId: string) {
    return mapContentAttemptRow(required(await supabase.from("content_topic_attempts").select("*").eq("id", attemptId).single(), "Topic Attempt 不存在") as Row);
}

export async function listContentNodes(attemptId: string) {
    return list(await supabase.from("content_nodes").select("*").eq("attempt_id", attemptId).order("sort_order").order("created_at"), "内容节点读取失败").map(mapContentNodeRow);
}

export async function createContentNode(input: Omit<ContentNode, "id" | "revision" | "hiddenAt" | "createdAt" | "updatedAt">) {
    const row = required(await supabase.from("content_nodes").insert({
        topic_id: input.topicId,
        attempt_id: input.attemptId,
        parent_id: input.parentId,
        node_type: input.nodeType,
        title: input.title,
        summary: input.summary,
        sort_order: input.sortOrder,
        data: input.data,
        status: input.status,
        created_by: input.createdBy,
    }).select("*").single(), "内容节点创建失败") as Row;
    return mapContentNodeRow(row);
}

export async function updateContentNode(node: ContentNode, patch: Partial<Pick<ContentNode, "title" | "summary" | "sortOrder" | "data" | "status" | "hiddenAt">>) {
    const values: Row = {};
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.summary !== undefined) values.summary = patch.summary;
    if (patch.sortOrder !== undefined) values.sort_order = patch.sortOrder;
    if (patch.data !== undefined) values.data = patch.data;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.hiddenAt !== undefined) values.hidden_at = patch.hiddenAt;
    values.revision = node.revision + 1;
    const row = required(await supabase.from("content_nodes").update(values).eq("id", node.id).eq("revision", node.revision).select("*").single(), "节点已在其他页面更新，请刷新后重试") as Row;
    return mapContentNodeRow(row);
}

export async function listContentReferences(attemptId: string) {
    return list(await supabase.from("content_node_references").select("*").eq("attempt_id", attemptId).order("created_at"), "节点引用读取失败").map(mapContentReferenceRow);
}

export async function createContentReference(input: Omit<ContentNodeReference, "id" | "createdAt">) {
    return mapContentReferenceRow(required(await supabase.from("content_node_references").insert({
        topic_id: input.topicId,
        attempt_id: input.attemptId,
        node_id: input.nodeId,
        asset_id: input.assetId,
        referenced_node_id: input.referencedNodeId,
        reference_kind: input.referenceKind,
        purpose: input.purpose,
        created_by: input.createdBy,
    }).select("*").single(), "节点引用创建失败") as Row);
}

export async function deleteContentReference(referenceId: string) {
    const { error } = await supabase.from("content_node_references").delete().eq("id", referenceId);
    if (error) throw new Error(error.message || "节点引用删除失败");
}

export async function listContentRuns(attemptId: string) {
    return list(await supabase.from("content_generation_runs").select("*").eq("attempt_id", attemptId).order("created_at"), "生成记录读取失败").map(mapContentRunRow);
}

export async function listOwnerContentRuns(ownerId: string) {
    return list(await supabase.from("content_generation_runs").select("*").eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(1000), "生成记录读取失败").map(mapContentRunRow);
}

export async function createContentRun(input: Omit<ContentGenerationRun, "id" | "createdAt" | "updatedAt">) {
    const row = required(await supabase.from("content_generation_runs").insert(runValues(input)).select("*").single(), "生成记录创建失败") as Row;
    return mapContentRunRow(row);
}

export async function updateContentRun(runId: string, patch: Partial<ContentGenerationRun>) {
    const row = required(await supabase.from("content_generation_runs").update(runValues(patch)).eq("id", runId).select("*").single(), "生成记录更新失败") as Row;
    return mapContentRunRow(row);
}

export async function startContentOrchestration(input: {
    topicId: string;
    attemptId: string;
    rootNodeId: string;
    resultNodeId?: string;
    stage: ContentStage;
    mode: "automatic" | "manual";
    input: Record<string, unknown>;
}) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", { body: input });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "内容生成编排启动失败");
    return {
        runId: String(data.runId),
        status: "queued" as const,
        node: data.node ? mapContentNodeRow(data.node as Row) : null,
    };
}

export async function startContentTopicFactory(input: {
    topicId: string;
    attemptId: string;
    rootNodeId: string;
    input: {
        topic: Record<string, unknown>;
        orientation: Record<string, unknown>;
        references: Array<Record<string, unknown>>;
    };
}) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", {
        body: { action: "start_topic_factory", ...input },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "选题任务启动失败");
    return {
        batchId: String(data.batchId),
        nodes: (Array.isArray(data.nodes) ? data.nodes : []).map(mapContentNodeRow),
        runs: Array.isArray(data.runs) ? data.runs : [],
        existing: data.existing === true,
    };
}

export async function regenerateContentTopicFactory(input: {
    topicId: string;
    attemptId: string;
    rootNodeId: string;
    nodeId?: string;
    input: {
        topic: Record<string, unknown>;
        orientation: Record<string, unknown>;
        references: Array<Record<string, unknown>>;
    };
}) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", {
        body: { action: "regenerate_topic_factory", ...input },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "选题重新生成失败");
    return {
        batchId: String(data.batchId),
        nodes: (Array.isArray(data.nodes) ? data.nodes : []).map(mapContentNodeRow),
        runs: Array.isArray(data.runs) ? data.runs : [],
        regenerated: data.regenerated === true,
    };
}

export async function stopContentTopicFactory(input: { runId: string }) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", {
        body: { action: "cancel_topic_factory", runId: input.runId },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "选题分支停止失败");
    return {
        canceled: data.canceled === true,
        runId: String(data.runId || input.runId),
        jobId: data.jobId ? String(data.jobId) : null,
        nodeId: data.nodeId ? String(data.nodeId) : null,
    };
}

export async function optimizeContentTopicFactory(input: {
    topicId: string;
    attemptId: string;
    rootNodeId: string;
    sourceNodeId: string;
    direction: string;
    clientRequestId: string;
    input: {
        topic: Record<string, unknown>;
        orientation: Record<string, unknown>;
        references: Array<Record<string, unknown>>;
    };
}) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", {
        body: { action: "optimize_topic_factory", ...input },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "选题优化失败");
    return {
        batchId: String(data.batchId),
        nodes: (Array.isArray(data.nodes) ? data.nodes : []).map(mapContentNodeRow),
        runs: Array.isArray(data.runs) ? data.runs : [],
        existing: data.existing === true,
    };
}

export async function startContentStorylineOperation(input: {
    operation: "generate" | "optimize" | "rebuild";
    topicId: string;
    attemptId: string;
    sourceNodeId: string;
    clientRequestId: string;
    direction?: string;
    input: {
        topic: Record<string, unknown>;
        orientation: Record<string, unknown>;
        references: Array<Record<string, unknown>>;
    };
}) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", {
        body: { action: "start_storyline", ...input },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "故事线任务启动失败");
    if (!data?.node || !data?.run?.id) throw new Error("故事线任务没有返回节点或 Run");
    return {
        node: mapContentNodeRow(data.node as Row),
        runId: String(data.run.id),
        existing: data.existing === true,
    };
}

export async function startContentStoryboardOperation(input: {
    operation: "generate" | "regenerate" | "optimize" | "optimize_node";
    topicId: string;
    attemptId: string;
    sourceNodeId: string;
    clientRequestId: string;
    direction?: string;
    input: {
        topic: Record<string, unknown>;
        orientation: Record<string, unknown>;
        storyline: Record<string, unknown>;
        references: Array<Record<string, unknown>>;
        additionalInfo?: string;
    };
}) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", {
        body: { action: "start_storyboard", ...input },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "分镜任务启动失败");
    if (!data?.node || !data?.run?.id) throw new Error("分镜任务没有返回节点或 Run");
    return {
        node: mapContentNodeRow(data.node as Row),
        runId: String(data.run.id),
        existing: data.existing === true,
    };
}

export async function stopContentStoryboard(input: { runId: string }) {
    const { data, error } = await supabase.functions.invoke("content-orchestrate", {
        body: { action: "cancel_storyboard", runId: input.runId },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error.message || "分镜任务停止失败");
    return {
        canceled: data.canceled === true,
        runId: String(data.runId || input.runId),
        nodeId: data.nodeId ? String(data.nodeId) : null,
    };
}

export async function listContentNoticeNodes(ownerId: string) {
    const response = await supabase.from("content_nodes")
        .select("*,content_topics!inner(owner_id)")
        .eq("content_topics.owner_id", ownerId)
        .eq("notice_unread", true)
        .is("hidden_at", null)
        .order("notice_at", { ascending: false });
    return list(response, "节点提醒读取失败").map(mapContentNodeRow);
}

export async function markContentNodeNoticeSeen(nodeId: string) {
    return mapContentNodeRow(required(
        await supabase.rpc("mark_content_node_notice_seen", { p_node_id: nodeId }),
        "节点提醒状态更新失败",
    ) as Row);
}

export async function listGenerationJobsByIds(ids: string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return [] as GenerationJob[];
    const { data, error } = await supabase.from("generation_jobs")
        .select("id,status,output_text,reasoning_text,error_message,metadata")
        .in("id", unique);
    if (error) throw new Error(error.message || "生成任务读取失败");
    return (data || []) as GenerationJob[];
}

function runValues(input: Partial<ContentGenerationRun>) {
    const mapping: Array<[keyof ContentGenerationRun, string]> = [
        ["topicId", "topic_id"], ["attemptId", "attempt_id"], ["ownerId", "owner_id"], ["rootNodeId", "root_node_id"],
        ["resultNodeId", "result_node_id"], ["stage", "stage"], ["mode", "mode"], ["status", "status"], ["round", "round"],
        ["maxRounds", "max_rounds"], ["producerModelId", "producer_model_id"], ["reviewerModelId", "reviewer_model_id"],
        ["fallbackModelId", "fallback_model_id"], ["currentJobId", "current_job_id"], ["generationJobIds", "generation_job_ids"],
        ["outputAssetIds", "output_asset_ids"], ["policySnapshot", "policy_snapshot"], ["promptVersion", "prompt_version"],
        ["schemaVersion", "schema_version"], ["inputSnapshot", "input_snapshot"], ["output", "output"], ["reviews", "reviews"],
        ["hardFail", "hard_fail"], ["mediaRetryCount", "media_retry_count"], ["mediaRetryLimit", "media_retry_limit"],
        ["errorMessage", "error_message"], ["startedAt", "started_at"], ["completedAt", "completed_at"],
    ];
    return Object.fromEntries(mapping.filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]]));
}

export async function listContentArtifacts(attemptId: string) {
    return list(await supabase.from("content_media_artifacts").select("*").eq("attempt_id", attemptId).order("created_at"), "媒体结果读取失败").map(mapContentArtifactRow);
}

export async function createContentArtifact(input: Omit<ContentMediaArtifact, "id" | "createdAt">) {
    return mapContentArtifactRow(required(await supabase.from("content_media_artifacts").insert({
        topic_id: input.topicId,
        attempt_id: input.attemptId,
        node_id: input.nodeId,
        run_id: input.runId,
        asset_id: input.assetId,
        owner_id: input.ownerId,
        kind: input.kind,
        source: input.source,
        output_index: input.outputIndex,
        metadata: input.metadata,
    }).select("*").single(), "媒体结果登记失败") as Row);
}

export async function listContentClipSelections(attemptId: string) {
    return list(await supabase.from("content_clip_selections").select("*").eq("attempt_id", attemptId).order("selected_at"), "Clip 选择读取失败").map(mapContentSelectionRow);
}

export async function selectContentClip(input: Omit<ContentClipSelection, "id" | "selectedAt">) {
    return mapContentSelectionRow(required(await supabase.from("content_clip_selections").insert({
        topic_id: input.topicId,
        attempt_id: input.attemptId,
        shot_node_id: input.shotNodeId,
        artifact_id: input.artifactId,
        selected_by: input.selectedBy,
    }).select("*").single(), "Clip 勾选失败") as Row);
}

export async function deselectContentClip(shotNodeId: string, artifactId: string) {
    const { error } = await supabase.from("content_clip_selections").delete().eq("shot_node_id", shotNodeId).eq("artifact_id", artifactId);
    if (error) throw new Error(error.message || "取消 Clip 勾选失败");
}

export async function listContentDeliveries(attemptId: string) {
    return list(await supabase.from("content_delivery_snapshots").select("*").eq("attempt_id", attemptId).order("version", { ascending: false }), "交付版本读取失败").map(mapDeliveryRow);
}

export async function createContentDelivery(input: { topicId: string; attemptId: string; ownerId: string; version: number; artifactIds: string[]; manifest: ContentDeliveryManifest }) {
    return mapDeliveryRow(required(await supabase.from("content_delivery_snapshots").insert({
        topic_id: input.topicId,
        attempt_id: input.attemptId,
        owner_id: input.ownerId,
        version: input.version,
        artifact_ids: input.artifactIds,
        manifest: input.manifest,
    }).select("*").single(), "交付版本创建失败") as Row);
}

function mapDeliveryRow(row: Row): ContentDeliverySnapshot {
    return {
        id: row.id, topicId: row.topic_id, attemptId: row.attempt_id, ownerId: row.owner_id,
        version: Number(row.version), artifactIds: row.artifact_ids || [], manifest: row.manifest, createdAt: row.created_at,
    };
}

export async function listContentCompletions(topicId: string) {
    return list(await supabase.from("content_completion_versions").select("*").eq("topic_id", topicId).order("version", { ascending: false }), "完成版本读取失败").map(mapCompletionRow);
}

function mapCompletionRow(row: Row): ContentCompletionVersion {
    return {
        id: row.id, topicId: row.topic_id, attemptId: row.attempt_id, ownerId: row.owner_id,
        version: Number(row.version), finalAssetIds: row.final_asset_ids || [], notes: row.notes || "",
        nodeVersions: row.node_versions || {}, selectedArtifactIds: row.selected_artifact_ids || [],
        deliverySnapshotId: row.delivery_snapshot_id || null, statsSnapshot: row.stats_snapshot || {}, createdAt: row.created_at,
    };
}

export async function listContentStagePolicies() {
    return list(await supabase.from("content_stage_policies").select("*").order("stage"), "AI Stage Policy 读取失败").map(mapContentPolicyRow);
}

export async function updateContentStagePolicy(stage: string, patch: Partial<Pick<ContentStagePolicy, "producerModelId" | "reviewerModelId" | "fallbackModelId" | "validationEnabled" | "acceptanceRule" | "maxRounds" | "mediaRetryLimit" | "updatedBy">>) {
    const values: Row = {};
    if (patch.producerModelId !== undefined) values.producer_model_id = patch.producerModelId;
    if (patch.reviewerModelId !== undefined) values.reviewer_model_id = patch.reviewerModelId;
    if (patch.fallbackModelId !== undefined) values.fallback_model_id = patch.fallbackModelId;
    if (patch.validationEnabled !== undefined) values.validation_enabled = patch.validationEnabled;
    if (patch.acceptanceRule !== undefined) values.acceptance_rule = patch.acceptanceRule;
    if (patch.maxRounds !== undefined) values.max_rounds = patch.maxRounds;
    if (patch.mediaRetryLimit !== undefined) values.media_retry_limit = patch.mediaRetryLimit;
    if (patch.updatedBy !== undefined) values.updated_by = patch.updatedBy;
    return mapContentPolicyRow(required(await supabase.from("content_stage_policies").update(values).eq("stage", stage).select("*").single(), "AI Stage Policy 更新失败") as Row);
}

export async function listContentPromptRegistry() {
    return list(await supabase.from("content_prompt_registry").select("*").eq("active", true).order("stage"), "Prompt Registry 读取失败");
}

export async function listContentModelPromptVersions(stage: string) {
    return list(await supabase.from("content_model_prompt_versions")
        .select("*")
        .eq("stage", stage)
        .order("purpose_label")
        .order("version", { ascending: false }), "System Prompt 版本读取失败").map(mapContentModelPromptVersionRow);
}

export async function saveContentModelPromptVersion(input: {
    stage: string;
    purposeKey: string;
    purposeLabel: string;
    systemPrompt: string;
}) {
    return mapContentModelPromptVersionRow(required(await supabase.rpc("save_content_model_prompt_version", {
        p_stage: input.stage,
        p_purpose_key: input.purposeKey,
        p_purpose_label: input.purposeLabel,
        p_system_prompt: input.systemPrompt,
    }), "System Prompt 保存失败") as Row);
}

export async function activateContentModelPromptVersion(versionId: string) {
    return mapContentModelPromptVersionRow(required(await supabase.rpc("activate_content_model_prompt_version", {
        p_version_id: versionId,
    }), "System Prompt 激活失败") as Row);
}

export async function createContentInspiration(input: { sourceAssetId: string; markedBy: string; notes: string }) {
    return mapInspirationRow(required(await supabase.from("content_inspirations").insert({
        source_asset_id: input.sourceAssetId,
        marked_by: input.markedBy,
        notes: input.notes,
    }).select("*").single(), "灵感记录创建失败") as Row);
}

export async function updateContentInspiration(id: string, patch: Partial<Pick<ContentInspiration, "notes" | "analysis" | "promptVersion" | "schemaVersion">>) {
    const values: Row = {};
    if (patch.notes !== undefined) values.notes = patch.notes;
    if (patch.analysis !== undefined) values.analysis = patch.analysis;
    if (patch.promptVersion !== undefined) values.prompt_version = patch.promptVersion;
    if (patch.schemaVersion !== undefined) values.schema_version = patch.schemaVersion;
    return mapInspirationRow(required(await supabase.from("content_inspirations").update(values).eq("id", id).select("*").single(), "灵感记录更新失败") as Row);
}

function mapInspirationRow(row: Row): ContentInspiration {
    return {
        id: row.id, sourceAssetId: row.source_asset_id, markedBy: row.marked_by, notes: row.notes,
        analysis: row.analysis || {}, promptVersion: row.prompt_version || null, schemaVersion: row.schema_version || null,
        createdAt: row.created_at, updatedAt: row.updated_at,
    };
}

export async function getContentProductionStats(start: string, end: string, memberId?: string) {
    return required(await supabase.rpc("content_production_stats", { p_start: start, p_end: end, p_member_id: memberId || null }), "内容生产统计读取失败") as ContentProductionStats;
}

export async function listContentMembers() {
    return list(await supabase.from("profiles").select("id,display_name,username").eq("status", "active").order("display_name"), "内容成员读取失败").map((row) => ({
        id: row.id,
        displayName: row.display_name || row.username,
        username: row.username,
    })) as ContentMember[];
}

export async function listContentActivityEvents(topicId?: string) {
    let query = supabase.from("content_activity_events").select("*").order("created_at", { ascending: false }).limit(500);
    if (topicId) query = query.eq("topic_id", topicId);
    return list(await query, "内容审计记录读取失败").map((row) => ({
        id: Number(row.id),
        topicId: row.topic_id || null,
        attemptId: row.attempt_id || null,
        actorId: row.actor_id,
        eventType: row.event_type,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        details: row.details || {},
        createdAt: row.created_at,
    })) as ContentActivityEvent[];
}

export function subscribeContentProduction(onChange: (table: string, payload: unknown) => void) {
    const channel = ["content_topics", "content_nodes", "content_generation_runs", "koubo_projects"].reduce(
        (current, table) => current.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => onChange(table, payload)),
        supabase.channel(`content-production-${crypto.randomUUID()}`),
    );
    channel.subscribe();
    return () => {
        void supabase.removeChannel(channel);
    };
}
