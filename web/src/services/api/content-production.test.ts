import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

const { invoke, rpc } = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
    supabase: {
        rpc,
        functions: { invoke },
        from: vi.fn(),
        channel: vi.fn(),
        removeChannel: vi.fn(),
    },
}));

import {
    activateContentModelPromptVersion,
    claimContentTopic,
    createContentTopic,
    deleteContentWorkflowProject,
    initializeVideoWorkflowProject,
    mapContentModelPromptVersionRow,
    mapContentNodeRow,
    mapContentRunRow,
    mapContentTopicRow,
    mapContentWorkflowProjectRow,
    markContentNodeNoticeSeen,
    saveContentModelPromptVersion,
    startContentStorylineOperation,
    startContentStoryboardOperation,
    stopContentStoryboard,
} from "./content-production";

beforeEach(() => {
    invoke.mockReset();
    rpc.mockReset();
});

describe("content production row mapping", () => {
    it("maps workflow project rows and rejects unknown workflows", () => {
        expect(mapContentWorkflowProjectRow({
            id: "project-1", workflow_type: "koubo-video", title: "口播视频", owner_id: "user-1",
            topic_id: null, created_at: "2026-07-29T00:00:00Z", updated_at: "2026-07-29T00:00:00Z",
        })).toMatchObject({ workflowType: "koubo-video", topicId: null });
        expect(mapContentWorkflowProjectRow({
            id: "course-1", workflow_type: "course-video", title: "课程视频", owner_id: "user-1",
            topic_id: null, created_at: "2026-08-04T00:00:00Z", updated_at: "2026-08-04T00:00:00Z",
        })).toMatchObject({ workflowType: "course-video", topicId: null });
        expect(mapContentWorkflowProjectRow({
            id: "flow-1", workflow_type: "course-flow", title: "课程视频", owner_id: "user-1",
            topic_id: null, created_at: "2026-08-04T00:00:00Z", updated_at: "2026-08-04T00:00:00Z",
        })).toMatchObject({ workflowType: "course-flow", topicId: null });
        expect(() => mapContentWorkflowProjectRow({ workflow_type: "future-flow" })).toThrow("未知工作流类型: future-flow");
    });
    it("maps topic rows once at the API boundary", () => {
        expect(mapContentTopicRow({
            id: "topic-1",
            workflow_type: "social_media_video_v1",
            title: "选题",
            original_topic: "原始选题",
            creation_notes: "说明",
            tags: ["育儿"],
            source_type: "member",
            source_asset_id: null,
            source_inspiration_id: null,
            parent_topic_id: null,
            created_by: "user-1",
            owner_id: null,
            current_attempt_id: null,
            status: "pool",
            background_snapshot: { defaultAspectRatio: "9:16" },
            latest_completion_version: 0,
            has_post_completion_changes: false,
            completed_at: null,
            created_at: "2026-07-24T00:00:00Z",
            updated_at: "2026-07-24T00:00:00Z",
        })).toMatchObject({
            id: "topic-1",
            workflowType: "social_media_video_v1",
            originalTopic: "原始选题",
            sourceType: "member",
            currentAttemptId: null,
            hasPostCompletionChanges: false,
        });
    });

    it("maps node notice state at the API boundary", () => {
        expect(mapContentNodeRow({
            id: "node-1", topic_id: "topic-1", attempt_id: "attempt-1", parent_id: null, node_type: "topic",
            title: "Topic", summary: "", sort_order: 0, data: {}, status: "succeeded", revision: 1,
            created_by: "user-1", hidden_at: null, created_at: "2026-07-24T00:00:00Z", updated_at: "2026-07-24T00:00:00Z",
            notice_kind: "success", notice_unread: true, notice_at: "2026-07-24T00:01:00Z",
        })).toMatchObject({ noticeKind: "success", noticeUnread: true, noticeAt: "2026-07-24T00:01:00Z" });
    });

    it("maps stage Prompt history independently from runtime model bindings", () => {
        expect(mapContentModelPromptVersionRow({
            prompt_id: "prompt-2",
            stage: "topic_factory",
            purpose_key: "review",
            purpose_label: "质量检查",
            version: 2,
            system_prompt: "检查候选",
            active: true,
            created_by: "admin-1",
            created_at: "2026-07-28T00:00:00Z",
            activated_by: "admin-1",
            activated_at: "2026-07-28T00:00:00Z",
        })).toMatchObject({
            promptId: "prompt-2",
            purposeKey: "review",
            version: 2,
            active: true,
        });
        expect(mapContentRunRow({
            id: "run-1", topic_id: "topic-1", attempt_id: "attempt-1", owner_id: "user-1",
            root_node_id: "root-1", result_node_id: "node-1", stage: "topic_factory", mode: "automatic",
            status: "accepted", round: 1, max_rounds: 3, generation_job_ids: [], output_asset_ids: [],
            model_prompt_bindings: [{
                promptId: "prompt-2", stage: "topic_factory", purposeKey: "review",
                purposeLabel: "质量检查", modelId: "glm-id", version: 2,
            }],
            created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z",
        }).modelPromptBindings).toEqual([{
            promptId: "prompt-2", stage: "topic_factory", purposeKey: "review",
            purposeLabel: "质量检查", modelId: "glm-id", version: 2,
        }]);
    });
});

describe("content lifecycle RPCs", () => {
    it("initializes a course video without rewriting its workflow type", async () => {
        rpc.mockResolvedValue({
            data: {
                id: "course-1", workflow_type: "course-video", title: "课程视频", owner_id: "user-1",
                topic_id: null, created_at: "2026-08-04T00:00:00Z", updated_at: "2026-08-04T00:00:00Z",
            },
            error: null,
        });

        await expect(initializeVideoWorkflowProject("course-video", "course-1", "request-1"))
            .resolves.toMatchObject({ workflowType: "course-video" });
        expect(rpc).toHaveBeenCalledWith("initialize_koubo_workflow_project", {
            p_workflow_type: "course-video",
            p_project_id: "course-1",
            p_client_request_id: "request-1",
        });
    });

    it("initializes Course Flow through its independent RPC", async () => {
        rpc.mockResolvedValue({ data: { id: "flow-1", workflow_type: "course-flow", title: "课程视频", owner_id: "user-1", topic_id: null, created_at: "", updated_at: "" }, error: null });

        await expect(initializeVideoWorkflowProject("course-flow", "flow-1", "request-1")).resolves.toMatchObject({ workflowType: "course-flow" });
        expect(rpc).toHaveBeenCalledWith("initialize_course_flow_project", { p_project_id: "flow-1", p_client_request_id: "request-1" });
    });

    it("deletes one owned workflow project through the dedicated RPC", async () => {
        rpc.mockResolvedValue({ data: "koubo-video", error: null });

        await expect(deleteContentWorkflowProject("project-1")).resolves.toBe("koubo-video");
        expect(rpc).toHaveBeenCalledWith("delete_content_workflow_project", {
            p_project_id: "project-1",
        });
    });

    it("stops one Topic Factory run through the authenticated orchestrator action", async () => {
        invoke.mockResolvedValue({
            data: { canceled: true, runId: "run-1", jobId: "job-1", nodeId: "node-1" },
            error: null,
        });
        const api = await import("./content-production");

        expect("stopContentTopicFactory" in api).toBe(true);
        await expect((api as typeof api & {
            stopContentTopicFactory: (input: { runId: string }) => Promise<unknown>;
        }).stopContentTopicFactory({ runId: "run-1" })).resolves.toMatchObject({
            canceled: true,
            runId: "run-1",
        });
        expect(invoke).toHaveBeenCalledWith("content-orchestrate", {
            body: { action: "cancel_topic_factory", runId: "run-1" },
        });
    });

    it("uses exact model Prompt save and activation RPC contracts", async () => {
        rpc.mockResolvedValue({ data: {
            id: "prompt-3", stage: "topic_factory", purpose_key: "review", purpose_label: "质量检查",
            version: 3, system_prompt: "新版检查", active: true,
            created_at: "2026-07-28T01:00:00Z", activated_at: "2026-07-28T01:00:00Z",
        }, error: null });
        await saveContentModelPromptVersion({
            stage: "topic_factory",
            purposeKey: "review",
            purposeLabel: "质量检查",
            systemPrompt: "新版检查",
        });
        expect(rpc).toHaveBeenLastCalledWith("save_content_model_prompt_version", {
            p_stage: "topic_factory",
            p_purpose_key: "review",
            p_purpose_label: "质量检查",
            p_system_prompt: "新版检查",
        });
        await activateContentModelPromptVersion("prompt-2");
        expect(rpc).toHaveBeenLastCalledWith("activate_content_model_prompt_version", {
            p_version_id: "prompt-2",
        });
    });

    it("saves a course Prompt without binding it to the selected model", async () => {
        rpc.mockResolvedValue({ data: {
            id: "course-prompt-2", stage: "course_script", purpose_key: "generate", purpose_label: "内容生成",
            version: 2, system_prompt: "共享课程 Prompt", active: true,
            created_at: "2026-08-04T04:00:00Z", activated_at: "2026-08-04T04:00:00Z",
        }, error: null });

        await saveContentModelPromptVersion({
            stage: "course_script",
            purposeKey: "generate",
            purposeLabel: "内容生成",
            systemPrompt: "共享课程 Prompt",
        });

        expect(rpc).toHaveBeenLastCalledWith("save_content_model_prompt_version", {
            p_stage: "course_script",
            p_purpose_key: "generate",
            p_purpose_label: "内容生成",
            p_system_prompt: "共享课程 Prompt",
        });
    });

    it("starts Storyline optimization through the dedicated operation contract", async () => {
        invoke.mockResolvedValue({
            data: {
                node: {
                    id: "story-2", topic_id: "topic-1", attempt_id: "attempt-1", parent_id: "story-1", node_type: "storyline",
                    title: "故事线优化中", summary: "", sort_order: 0, data: {}, status: "running", revision: 1,
                    created_by: "user-1", hidden_at: null, created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z",
                },
                run: { id: "run-1" },
                existing: false,
            },
            error: null,
        });
        await expect(startContentStorylineOperation({
            operation: "optimize",
            topicId: "topic-1",
            attemptId: "attempt-1",
            sourceNodeId: "story-1",
            clientRequestId: "request-1",
            direction: "增强 Reveal 反差",
            input: { topic: {}, orientation: {}, references: [] },
        })).resolves.toMatchObject({ node: { id: "story-2" }, runId: "run-1", existing: false });
        expect(invoke).toHaveBeenCalledWith("content-orchestrate", {
            body: {
                action: "start_storyline",
                operation: "optimize",
                topicId: "topic-1",
                attemptId: "attempt-1",
                sourceNodeId: "story-1",
                clientRequestId: "request-1",
                direction: "增强 Reveal 反差",
                input: { topic: {}, orientation: {}, references: [] },
            },
        });
    });

    it("shows the structured Storyline rejection returned by the Edge Function", async () => {
        invoke.mockResolvedValue({
            data: null,
            error: new FunctionsHttpError(new Response(JSON.stringify({
                error: {
                    code: "STORYLINE_START_REJECTED",
                    message: "当前选题分支缺少可用于故事线的候选内容",
                },
            }), {
                status: 422,
                headers: { "Content-Type": "application/json" },
            })),
        });

        await expect(startContentStorylineOperation({
            operation: "generate",
            topicId: "topic-1",
            attemptId: "attempt-1",
            sourceNodeId: "angle-1",
            clientRequestId: "request-1",
            input: { topic: {}, orientation: {}, references: [] },
        })).rejects.toThrow("当前选题分支缺少可用于故事线的候选内容");
    });

    it("starts and stops Storyboard through dedicated orchestrator actions", async () => {
        invoke.mockResolvedValueOnce({
            data: {
                node: {
                    id: "board-1", topic_id: "topic-1", attempt_id: "attempt-1", parent_id: "story-1", node_type: "batch",
                    title: "分镜脚本生成中", summary: "", sort_order: 0, data: {}, status: "running", revision: 1,
                    created_by: "user-1", hidden_at: null, created_at: "2026-07-29T00:00:00Z", updated_at: "2026-07-29T00:00:00Z",
                },
                run: { id: "run-board-1" },
                existing: false,
            },
            error: null,
        });
        await expect(startContentStoryboardOperation({
            operation: "generate",
            topicId: "topic-1",
            attemptId: "attempt-1",
            sourceNodeId: "story-1",
            clientRequestId: "request-1",
            input: { topic: {}, orientation: {}, storyline: {}, references: [], additionalInfo: "写实" },
        })).resolves.toMatchObject({ node: { id: "board-1" }, runId: "run-board-1" });
        expect(invoke).toHaveBeenLastCalledWith("content-orchestrate", {
            body: {
                action: "start_storyboard",
                operation: "generate",
                topicId: "topic-1",
                attemptId: "attempt-1",
                sourceNodeId: "story-1",
                clientRequestId: "request-1",
                input: { topic: {}, orientation: {}, storyline: {}, references: [], additionalInfo: "写实" },
            },
        });

        invoke.mockResolvedValueOnce({ data: { canceled: true, runId: "run-board-1", nodeId: "board-1" }, error: null });
        await expect(stopContentStoryboard({ runId: "run-board-1" })).resolves.toMatchObject({ canceled: true });
        expect(invoke).toHaveBeenLastCalledWith("content-orchestrate", {
            body: { action: "cancel_storyboard", runId: "run-board-1" },
        });
    });

    it("uses the exact create RPC contract", async () => {
        rpc.mockResolvedValue({ data: { topicId: "topic-1", attemptId: "attempt-1", claimed: true }, error: null });
        await expect(createContentTopic({
            title: "选题",
            originalTopic: "原始选题",
            creationNotes: "说明",
            tags: ["育儿"],
            sourceType: "member",
            sourceAssetId: null,
            sourceInspirationId: null,
            claim: true,
        })).resolves.toEqual({ topicId: "topic-1", attemptId: "attempt-1", claimed: true });
        expect(rpc).toHaveBeenCalledWith("create_content_topic", {
            p_title: "选题",
            p_original_topic: "原始选题",
            p_creation_notes: "说明",
            p_tags: ["育儿"],
            p_source_type: "member",
            p_source_asset_id: null,
            p_source_inspiration_id: null,
            p_claim: true,
        });
    });

    it("normalizes an atomic claim conflict", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "Topic 已被领取" } });
        await expect(claimContentTopic("topic-1")).rejects.toThrow("这个 Topic 已被其他成员领取");
    });

    it("clears a node dot through the node notice RPC", async () => {
        rpc.mockResolvedValue({
            data: {
                id: "node-1", topic_id: "topic-1", attempt_id: "attempt-1", parent_id: null, node_type: "topic",
                title: "Topic", summary: "", sort_order: 0, data: {}, status: "failed", revision: 1,
                created_by: "user-1", hidden_at: null, created_at: "2026-07-24T00:00:00Z", updated_at: "2026-07-24T00:00:00Z",
                notice_kind: "failure", notice_unread: false, notice_at: "2026-07-24T00:01:00Z",
            },
            error: null,
        });
        await expect(markContentNodeNoticeSeen("node-1")).resolves.toMatchObject({ noticeKind: "failure", noticeUnread: false, status: "failed" });
        expect(rpc).toHaveBeenCalledWith("mark_content_node_notice_seen", { p_node_id: "node-1" });
    });
});
