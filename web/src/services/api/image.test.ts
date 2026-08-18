import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/stores/use-config-store", () => ({
    modelOptionName: (model: string) => model.includes("::") ? model.split("::").at(-1) : model,
}));

import { requestGeneration } from "./image";

describe("standalone image generation", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("submits the client request id and exposes the real scheduler job id", async () => {
        const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
            if (url.startsWith("/api/generate/progress/")) return new Response(JSON.stringify({
                requestId: "canvas-image-1",
                status: "running",
                jobs: [{ stage: "queued", jobId: "scheduler-image-job", outputIndex: 0, progress: 0, label: "ERNIE 已排队" }],
            }), { status: 200, headers: { "Content-Type": "application/json" } });
            return new Response(JSON.stringify({ resource: { id: "resource-image-1", url: "/files/image-1.png" } }), { status: 200, headers: { "Content-Type": "application/json" } });
        }));
        const onJobCreated = vi.fn();

        const result = await requestGeneration({ model: "ernie-image-turbo", imageModel: "ernie-image-turbo", size: "1024x1024", count: "1" } as never, "银色产品图", {
            clientRequestId: "canvas-image-1",
            onJobCreated,
        });

        expect(requests.find((request) => request.url === "/api/generate/image")?.body).toMatchObject({
            clientRequestId: "canvas-image-1",
            model: "ernie-image-turbo",
            width: 1024,
            height: 1024,
        });
        expect(onJobCreated).toHaveBeenCalledWith("scheduler-image-job", 0);
        expect(result[0]).toMatchObject({ storageKey: "resource-image-1", outputIndex: 0 });
    });
});
