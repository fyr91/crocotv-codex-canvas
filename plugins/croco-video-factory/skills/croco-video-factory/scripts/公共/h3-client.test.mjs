import assert from "node:assert/strict";
import { test } from "node:test";
import {
    buildH3Request,
    downloadH3,
    ensureH3Runtime,
    getH3Job,
    h3Config,
    submitH3Job,
} from "./h3-client.mjs";

test("H3 Skill 固定使用成都 V2 任务合同", async () => {
    const config = h3Config({
        GPU_API_BASE_URL: "https://gpu.example.test/",
        GPU_API_TOKEN: "gpu-token",
        H3_BASE_URL: "https://legacy.example.test",
        H3_API_KEY: "legacy-token",
    });
    assert.deepEqual(config, { baseUrl: "https://gpu.example.test", apiKey: "gpu-token" });
    const request = buildH3Request({
        externalJobId: "shot-1",
        prompt: "A quiet lake",
        durationSeconds: 5,
        quality: "preview",
        imageAssetIds: ["image-1"],
        audioAssetIds: ["audio-1"],
    });
    assert.equal(request.model_id, "minimax-h3");
    assert.equal(request.operation, "video.generate");
    assert.equal(request.parameters.mode, "r2v");
    assert.deepEqual(request.inputs, [
        { role: "reference_image", asset_id: "image-1" },
        { role: "reference_audio", asset_id: "audio-1" },
    ]);

    const calls = [];
    const fetcher = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/outputs/video/content")) return new Response(new Uint8Array([1, 2, 3]));
        return Response.json({ job_id: "job-1", status: "queued" }, { status: String(url).endsWith("/api/v2/jobs") ? 202 : 200 });
    };
    const runtime = await ensureH3Runtime(config, { fetcher: () => { throw new Error("不应直连 Runtime"); } });
    assert.equal(runtime.active_runtime, "managed-by-gpu-orchestrator");
    const created = await submitH3Job({ config, request, idempotencyKey: "shot-1" }, { fetcher });
    assert.equal(created.job_id, "job-1");
    await getH3Job({ config, jobId: "job-1" }, { fetcher });
    assert.deepEqual([...await downloadH3({ config, jobId: "job-1" }, { fetcher })], [1, 2, 3]);
    assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
        "/api/v2/jobs",
        "/api/v2/jobs/job-1",
        "/api/v2/jobs/job-1/outputs/video/content",
    ]);
    assert.equal(new Headers(calls[0].init.headers).get("idempotency-key"), "croco-skill:shot-1");
});
