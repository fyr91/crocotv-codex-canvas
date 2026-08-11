import { describe, expect, it, vi } from "vitest";

describe("koubo API mapping", () => {
    it("preserves segment text without exposing audio confirmation", async () => {
        vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
        vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
        const { mapKouboSegment } = await import("./koubo-video");
        expect(mapKouboSegment({
            id: "s", project_id: "p", script_group_id: "g", position: 2, text: "原文\r\n标点！",
            voice_direction: "克制", revision: 3, generation_id: null, model_prompt_binding: {},
        })).toEqual({
            id: "s", projectId: "p", scriptGroupId: "g", position: 2, text: "原文\r\n标点！",
            voiceDirection: "克制", revision: 3, generationId: null, modelPromptBinding: {},
        });
    });

    it("maps generated and segmented audio as canonical parent-child nodes", async () => {
        const { mapKouboAudioNode } = await import("./koubo-video");

        expect(mapKouboAudioNode({
            id: "a2",
            project_id: "p",
            segment_id: "s",
            parent_audio_node_id: "a1",
            segmentation_run_id: "run",
            segment_index: 0,
            asset_id: "asset",
            duration_ms: 1200,
            source_type: "segment",
            source_start_ms: 400,
            source_end_ms: 1600,
            source_segment_revision: 3,
            status: "ready",
        })).toEqual({
            id: "a2",
            projectId: "p",
            segmentId: "s",
            parentAudioNodeId: "a1",
            segmentationRunId: "run",
            segmentIndex: 0,
            assetId: "asset",
            durationMs: 1200,
            sourceType: "segment",
            sourceStartMs: 400,
            sourceEndMs: 1600,
            sourceSegmentRevision: 3,
            status: "ready",
            imageResultId: null,
            generationId: null,
            clientRequestId: null,
            errorMessage: null,
        });

        expect(mapKouboAudioNode({
            id: "a1",
            project_id: "p",
            segment_id: "s",
            parent_audio_node_id: null,
            asset_id: "asset",
            duration_ms: 2200,
            source_type: "generated",
            status: "ready",
        }).sourceType).toBe("generated");
    });

    it("extracts only persisted media ids from canvas node ids", async () => {
        const { kouboNodeDatabaseIds } = await import("./koubo-video");

        expect(kouboNodeDatabaseIds([
            "koubo-audio-a1",
            "koubo-image-i1",
            "koubo-video-v1",
            "koubo-segment-s1",
        ])).toEqual({ audio: ["a1"], image: ["i1"], video: ["v1"] });
    });
});
