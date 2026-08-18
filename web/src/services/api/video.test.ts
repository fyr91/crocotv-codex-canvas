import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/stores/use-config-store", () => ({
    modelOptionName: (model: string) => model.includes("::") ? model.split("::").at(-1) : model,
    providerIdForModel: () => "minimax_h3",
}));

import { createVideoGenerationTask } from "./video";

describe("standalone video generation", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("submits through the local V2 bridge and returns the real scheduler job id", async () => {
        const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
            if (url.startsWith("/api/generate/progress/")) return new Response(JSON.stringify({
                requestId: "canvas-video-1",
                status: "running",
                jobs: [{ stage: "running", jobId: "scheduler-video-job", outputIndex: 0, progress: 37, label: "MiniMax H3 生成中" }],
            }), { status: 200, headers: { "Content-Type": "application/json" } });
            return new Response(JSON.stringify({ resources: [{ id: "resource-video-1", url: "/files/video-1.mp4", mimeType: "video/mp4", metadata: { duration: 3 } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
        }));
        const onJobCreated = vi.fn();
        const onProgress = vi.fn();

        const task = await createVideoGenerationTask({
            model: "minimax-h3",
            videoModel: "minimax-h3",
            videoInputMode: "text",
            vquality: "preview",
            size: "16:9",
            videoSeconds: "3",
            videoCount: "1",
            videoPromptEnhance: "false",
            videoWatermark: "false",
            videoAudioSetting: "auto",
        } as never, "银色产品旋转", [], [], [], { clientRequestId: "canvas-video-1", onJobCreated, onProgress });

        expect(requests.find((request) => request.url === "/api/generate/video")?.body).toMatchObject({
            clientRequestId: "canvas-video-1",
            model: "minimax-h3",
            duration: 3,
            count: 1,
        });
        expect(onJobCreated).toHaveBeenCalledWith("scheduler-video-job", 0);
        expect(onProgress).toHaveBeenCalledWith(37, "MiniMax H3 生成中", 0);
        expect(task.id).toBe("scheduler-video-job");
    });
});
