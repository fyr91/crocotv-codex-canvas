import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260729200000_koubo_video_workflow.sql", import.meta.url);

describe("koubo video persistence migration", () => {
    it("defines owner-isolated workflow records and media constraints", async () => {
        const sql = await readFile(migrationUrl, "utf8");
        for (const table of [
            "koubo_projects",
            "koubo_script_groups",
            "koubo_segments",
            "koubo_audio_revisions",
            "koubo_image_results",
            "koubo_video_candidates",
            "koubo_compositions",
        ]) {
            expect(sql).toContain(`create table public.${table}`);
            expect(sql).toContain(`alter table public.${table} enable row level security`);
        }
        expect(sql).toContain("using (owner_id = auth.uid()) with check (owner_id = auth.uid())");
        expect(sql).toContain("duration_ms < 20000");
        expect(sql).toContain("koubo_video_candidates_one_selected_per_segment");
        expect(sql).toContain("create or replace function public.ensure_koubo_project");
        expect(sql).toContain("workflow_type <> 'koubo-video'");
    });
});
