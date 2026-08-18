import { afterEach, describe, expect, test, vi } from "vitest";
import { cancelCanvasRunJob, startCanvasRunJob, waitForCanvasRunJob } from "./canvas-run-jobs";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("Canvas run jobs", () => {
    test("starts Canvas generation through the asynchronous endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ jobId: "job-1", status: "queued" }, 202));
        vi.stubGlobal("fetch", fetchMock);

        await startCanvasRunJob("project/one", ["config-1"]);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/canvas/projects/project%2Fone/run-nodes",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ nodeIds: ["config-1"], concurrency: 1, async: true }),
            }),
        );
    });

    test("polls until the server job reaches a terminal state", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ jobId: "job-1", status: "running" }))
            .mockResolvedValueOnce(jsonResponse({ jobId: "job-1", status: "completed", result: { results: [] } }));
        vi.stubGlobal("fetch", fetchMock);

        const result = await waitForCanvasRunJob("job-1", { pollIntervalMs: 10 });

        expect(result.status).toBe("completed");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("uses the durable server cancellation endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ jobId: "job-1", status: "cancelled" }));
        vi.stubGlobal("fetch", fetchMock);

        await cancelCanvasRunJob("job-1");

        expect(fetchMock).toHaveBeenCalledWith("/api/canvas/run-jobs/job-1/cancel", { method: "POST" });
    });
});

function jsonResponse(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
