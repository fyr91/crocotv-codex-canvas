import { describe, expect, it, vi } from "vitest";

describe("content workboard", () => {
    it("exports the storyboard-enabled workboard page", async () => {
        vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
        vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
        const { default: ContentWorkboardPage } = await import("./workboard");
        expect(typeof ContentWorkboardPage).toBe("function");
    });
});
