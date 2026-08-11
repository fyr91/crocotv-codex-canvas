import { describe, expect, it } from "vitest";

import type { CourseFlowMaterialShot, CourseFlowSegment } from "@/types/course-flow";
import {
    courseFlowExportDescription,
    courseFlowStepOrder,
    courseVideoGenerationPhase,
    furthestCourseFlowStep,
    isMaterialPlanFresh,
    materialPlanState,
    mapCourseFlowMaterialShot,
    runOptimisticShotPromptSave,
    segmentsNeedingMaterialPlan,
    selectedCourseAudio,
} from "./video-planning";

const readyAudio = {
    id: "audio-2",
    version: 2,
    sourceSegmentRevision: 3,
    assetId: "audio-asset",
    url: "/audio.mp3",
    durationMs: 12_000,
    status: "ready" as const,
    errorMessage: null,
    played: false,
};

function shot(patch: Partial<CourseFlowMaterialShot> = {}): CourseFlowMaterialShot {
    return {
        id: "shot-1",
        position: 0,
        prompt: "彗星掠过夜空",
        durationSeconds: 12,
        sourceSegmentRevision: 3,
        sourceAudioVersionId: "audio-2",
        storyboardPrompt: "分镜 Prompt",
        storyboardSourcePrompt: "彗星掠过夜空",
        storyboardAssetId: "storyboard-asset",
        storyboardUrl: "/storyboard.png",
        storyboardGenerationId: "generation-1",
        storyboardStatus: "ready",
        storyboardErrorMessage: null,
        storyboardClientRequestId: "request-1",
        video: null,
        ...patch,
    };
}

function segment(patch: Partial<CourseFlowSegment> = {}): CourseFlowSegment {
    return {
        id: "segment-1",
        position: 0,
        text: "第一段课程文案",
        voiceDirection: "自然清晰",
        revision: 3,
        selectedAudioId: "audio-2",
        audioVersions: [readyAudio],
        ltxVideo: null,
        materialShots: [shot()],
        ...patch,
    };
}

describe("course video planning contract", () => {
    it("describes only the directories exported by each workflow", () => {
        expect(courseFlowExportDescription("general")).toBe("ZIP 按 Material、Audio 和 Script 三个目录组织，可直接交给后续剪辑。");
        expect(courseFlowExportDescription("green_screen")).toBe("ZIP 按 Material、LTX、Audio、Scene 和 Script 五个目录组织，可直接交给后续剪辑。");
    });

    it("keeps the exact six-step workflow order", () => {
        expect(courseFlowStepOrder).toEqual(["role", "script_scene", "audio", "video_plan", "video", "export"]);
        expect(furthestCourseFlowStep("video", "audio")).toBe("video");
        expect(furthestCourseFlowStep("audio", "video_plan")).toBe("video_plan");
    });

    it("returns only a ready selected audio with a positive duration", () => {
        expect(selectedCourseAudio(segment())?.id).toBe("audio-2");
        expect(selectedCourseAudio(segment({ audioVersions: [{ ...readyAudio, status: "failed" }] }))).toBeNull();
        expect(selectedCourseAudio(segment({ audioVersions: [{ ...readyAudio, durationMs: 0 }] }))).toBeNull();
        expect(selectedCourseAudio(segment({ selectedAudioId: null }))).toBeNull();
    });

    it("accepts a plan only when every shot matches current copy and selected audio", () => {
        expect(isMaterialPlanFresh(segment())).toBe(true);
        expect(isMaterialPlanFresh(segment({ revision: 4 }))).toBe(false);
        expect(isMaterialPlanFresh(segment({ selectedAudioId: "audio-3" }))).toBe(false);
        expect(isMaterialPlanFresh(segment({ materialShots: [shot(), shot({ sourceAudioVersionId: "audio-1", position: 1 })] }))).toBe(false);
        expect(isMaterialPlanFresh(segment({ materialShots: [] }))).toBe(false);
    });

    it("rejects invalid prompts and shot durations", () => {
        expect(materialPlanState(segment({ materialShots: [shot({ prompt: "" })] }), false)).toBe("invalid");
        expect(materialPlanState(segment({ materialShots: [shot({ durationSeconds: 0 })] }), false)).toBe("invalid");
        expect(materialPlanState(segment({ materialShots: [shot({ durationSeconds: 15.01 })] }), false)).toBe("invalid");
    });

    it("distinguishes planning, stale, failed, and ready cards", () => {
        expect(materialPlanState(segment(), true)).toBe("planning");
        expect(materialPlanState(segment({ revision: 4 }), false)).toBe("stale");
        expect(materialPlanState(segment(), false, "模型超时")).toBe("failed");
        expect(materialPlanState(segment(), false)).toBe("ready");
    });

    it("plans only eligible missing or stale segments", () => {
        const fresh = segment();
        const stale = segment({ id: "segment-2", revision: 4 });
        const missingAudio = segment({ id: "segment-3", selectedAudioId: null, materialShots: [] });
        expect(segmentsNeedingMaterialPlan([fresh, stale, missingAudio], new Set())).toEqual([stale]);
        expect(segmentsNeedingMaterialPlan([fresh, stale], new Set(["segment-2"]))).toEqual([]);
    });

    it("maps material plan source identity from the database row", () => {
        expect(mapCourseFlowMaterialShot({
            id: "shot-1",
            position: 0,
            prompt: "彗星",
            duration_seconds: "12.5",
            source_segment_revision: 4,
            source_audio_version_id: "audio-4",
            storyboard_prompt: "分镜 Prompt",
            storyboard_source_prompt: "彗星",
            storyboard_asset_id: "storyboard-asset",
            storyboard_url: "/storyboard.png",
            storyboard_generation_id: "generation-1",
            storyboard_status: "ready",
            storyboard_client_request_id: "request-1",
        }, null)).toEqual({
            id: "shot-1",
            position: 0,
            prompt: "彗星",
            durationSeconds: 12.5,
            sourceSegmentRevision: 4,
            sourceAudioVersionId: "audio-4",
            storyboardPrompt: "分镜 Prompt",
            storyboardSourcePrompt: "彗星",
            storyboardAssetId: "storyboard-asset",
            storyboardUrl: "/storyboard.png",
            storyboardGenerationId: "generation-1",
            storyboardStatus: "ready",
            storyboardErrorMessage: null,
            storyboardClientRequestId: "request-1",
            video: null,
        });
    });

    it("rolls back only the current failed shot save", async () => {
        const values: string[] = [];
        await expect(runOptimisticShotPromptSave({
            previousPrompt: "旧提示词",
            nextPrompt: "新提示词",
            save: async () => { throw new Error("保存失败"); },
            isCurrent: () => true,
            apply: (value) => values.push(value),
        })).rejects.toThrow("保存失败");
        expect(values).toEqual(["旧提示词"]);
    });

    it("does not let an older failed save overwrite newer input", async () => {
        const values: string[] = [];
        await expect(runOptimisticShotPromptSave({
            previousPrompt: "旧提示词",
            nextPrompt: "第一次输入",
            save: async () => { throw new Error("较早请求失败"); },
            isCurrent: () => false,
            apply: (value) => values.push(value),
        })).rejects.toThrow("较早请求失败");
        expect(values).toEqual([]);
    });

    it("runs every LTX output before starting material videos", () => {
        const readyLtx = { id: "ltx-1", segmentId: "segment-1", shotId: null, track: "ltx" as const, prompt: "口播", assetId: "ltx-asset", url: "/ltx.mp4", status: "ready" as const, errorMessage: null, clientRequestId: "request-ltx" };
        const readyMaterial = { ...readyLtx, id: "material-1", shotId: "shot-1", track: "material" as const, prompt: "素材", assetId: "material-asset", url: "/material.mp4" };

        expect(courseVideoGenerationPhase("green_screen", [segment()])).toBe("ltx");
        expect(courseVideoGenerationPhase("green_screen", [segment({ ltxVideo: { ...readyLtx, status: "running", assetId: null } })])).toBe("ltx");
        expect(courseVideoGenerationPhase("green_screen", [segment({ ltxVideo: readyLtx })])).toBe("material");
        expect(courseVideoGenerationPhase("green_screen", [segment({ ltxVideo: readyLtx, materialShots: [shot({ video: readyMaterial })] })])).toBe("complete");
    });

    it("starts general courses from material videos and ignores stale LTX outputs", () => {
        const failedLtx = { id: "ltx-1", segmentId: "segment-1", shotId: null, track: "ltx" as const, prompt: "口播", assetId: null, url: "", status: "failed" as const, errorMessage: "失败", clientRequestId: "request-ltx" };
        const readyMaterial = { ...failedLtx, id: "material-1", shotId: "shot-1", track: "material" as const, prompt: "素材", assetId: "material-asset", url: "/material.mp4", status: "ready" as const, errorMessage: null };

        expect(courseVideoGenerationPhase("general", [segment()])).toBe("material");
        expect(courseVideoGenerationPhase("general", [segment({ ltxVideo: failedLtx })])).toBe("material");
        expect(courseVideoGenerationPhase("general", [segment({ materialShots: [shot({ video: readyMaterial })] })])).toBe("complete");
    });

    it("blocks automatic phase advancement after either track fails", () => {
        const failedLtx = { id: "ltx-1", segmentId: "segment-1", shotId: null, track: "ltx" as const, prompt: "口播", assetId: null, url: "", status: "failed" as const, errorMessage: "失败", clientRequestId: "request-ltx" };
        const readyLtx = { ...failedLtx, status: "ready" as const, assetId: "ltx-asset", url: "/ltx.mp4", errorMessage: null };
        const failedMaterial = { ...failedLtx, id: "material-1", shotId: "shot-1", track: "material" as const };

        expect(courseVideoGenerationPhase("green_screen", [segment({ ltxVideo: failedLtx })])).toBe("blocked");
        expect(courseVideoGenerationPhase("green_screen", [segment({ ltxVideo: readyLtx, materialShots: [shot({ video: failedMaterial })] })])).toBe("blocked");
    });
});
