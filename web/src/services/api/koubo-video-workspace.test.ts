import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    selects: {} as Record<string, string>,
    workflowType: "koubo-video",
}));

vi.mock("@/lib/supabase/client", () => ({
    supabase: {
        rpc: vi.fn(async (name: string) => ({
            data: name === "ensure_koubo_project" ? {
                status: "generating",
                selected_image_result_id: null,
                exported_at: null,
                notice_unread: false,
                latest_message: null,
                course_script_model_id: "ark-pro-id",
            } : null,
            error: null,
        })),
        from: vi.fn((table: string) => {
            const rows: Record<string, Record<string, unknown>[]> = {
                koubo_script_groups: [],
                koubo_segments: [],
                koubo_audio_nodes: [],
                koubo_image_results: [],
                koubo_video_candidates: [{
                    id: "video-1",
                    project_id: "project-1",
                    segment_id: "segment-1",
                    audio_node_id: "audio-1",
                    image_result_id: "image-1",
                    asset_id: null,
                    source_segment_revision: 1,
                    status: "running",
                    selected: false,
                    generation_id: "job-1",
                    client_request_id: "request-1",
                    error_message: null,
                }],
                koubo_compositions: [],
                generation_jobs: [{
                    id: "job-1",
                    metadata: {
                        progress: 0,
                        videoProgress: { "0": { stage: "queued", progress: 0 } },
                    },
                }],
            };
            const query: Record<string, unknown> = {};
            query.select = vi.fn((columns: string) => {
                mocks.selects[table] = columns;
                return query;
            });
            query.eq = vi.fn(() => query);
            query.is = vi.fn(() => query);
            query.order = vi.fn(() => query);
            query.in = vi.fn(() => query);
            query.maybeSingle = vi.fn(async () => table === "content_workflow_projects"
                ? { data: { id: "project-1", title: "口播视频", workflow_type: mocks.workflowType }, error: null }
                : { data: null, error: null });
            query.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows[table] || [], error: null });
            return query;
        }),
    },
}));

vi.mock("./cloud-assets", () => ({ getCloudAsset: vi.fn() }));

import { supabase } from "@/lib/supabase/client";
import { getKouboWorkspace, saveCourseScriptModel } from "./koubo-video";

describe("getKouboWorkspace video generation state", () => {
    beforeEach(() => {
        mocks.selects = {};
        mocks.workflowType = "koubo-video";
    });

    it("maps the provider queued stage and progress from generation metadata", async () => {
        const workspace = await getKouboWorkspace("project-1");

        expect(workspace?.videoCandidates[0]).toMatchObject({
            progress: 0,
            generationStage: "queued",
        });
        expect(mocks.selects.generation_jobs).toBe("id,metadata");
    });

    it("loads a course workspace only when the expected workflow type matches", async () => {
        mocks.workflowType = "course-video";

        await expect(getKouboWorkspace("project-1", "course-video")).resolves.toMatchObject({
            projectId: "project-1",
            courseScriptModelId: "ark-pro-id",
        });
        await expect(getKouboWorkspace("project-1", "koubo-video")).resolves.toBeNull();
    });

    it("persists the selected course script model through the scoped RPC", async () => {
        await saveCourseScriptModel("project-1", "ark-pro-id");

        expect(vi.mocked(supabase.rpc)).toHaveBeenLastCalledWith("set_course_script_model", {
            p_project_id: "project-1",
            p_model_id: "ark-pro-id",
        });
    });
});
