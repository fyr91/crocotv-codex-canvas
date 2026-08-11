import { describe, expect, it, vi } from "vitest";

describe("TopicWorkspaceGrid", () => {
    it("exports the multi-workflow project grid", async () => {
        vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
        vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
        const module = await import("./topic-workspace-grid");
        expect(typeof module.TopicWorkspaceGrid).toBe("function");
    });
});
