import { afterEach, describe, expect, it, vi } from "vitest";

import { watchDirectGenerationProgress } from "./direct-generation-progress";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("watchDirectGenerationProgress", () => {
    it("keeps the scheduler stage separate from its human-readable label", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            requestId: "request-1",
            status: "running",
            jobs: [{
                stage: "queued",
                jobId: "job-1",
                outputIndex: 0,
                progress: 0,
                label: "MiniMax H3 排队或准备中",
            }],
        }), { status: 200, headers: { "Content-Type": "application/json" } })));
        const onStatusChange = vi.fn();
        const onProgress = vi.fn();
        const watcher = watchDirectGenerationProgress("request-1", { onStatusChange, onProgress });

        await watcher.finish();

        expect(onStatusChange).toHaveBeenCalledWith("queued", 0);
        expect(onProgress).toHaveBeenCalledWith(0, "queued", 0, "MiniMax H3 排队或准备中");
    });
});
