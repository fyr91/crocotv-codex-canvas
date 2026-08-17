import assert from "node:assert/strict";
import { test } from "node:test";
import { cancelH3GpuJob, gpuProgressState, submitUnifiedGpuJob } from "./gpu-orchestrator";

test("统一 GPU 客户端使用固定 v2 契约、成都 Token 与幂等键", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.GPU_API_BASE_URL;
  const originalToken = process.env.GPU_API_TOKEN;
  process.env.GPU_API_BASE_URL = "https://gpu.example.test/";
  process.env.GPU_API_TOKEN = "test-token";
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(url);
    requestInit = init;
    return Response.json({ job_id: "job-1", model_id: "ltx-2.5", operation: "video.generate", status: "accepted" }, { status: 202 });
  }) as typeof fetch;
  try {
    const job = await submitUnifiedGpuJob({
      modelId: "ltx-2.5",
      operation: "video.generate",
      contractVersion: "2",
      clientJobId: "client-1",
      parameters: { prompt: "A quiet lake" },
    });
    assert.equal(job.job_id, "job-1");
    assert.equal(requestUrl, "https://gpu.example.test/api/v2/jobs");
    const headers = new Headers(requestInit?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-token");
    assert.equal(headers.get("idempotency-key"), "croco:client-1");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      model_id: "ltx-2.5",
      operation: "video.generate",
      contract_version: "2",
      client_job_id: "client-1",
      parameters: { prompt: "A quiet lake" },
      inputs: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.GPU_API_BASE_URL; else process.env.GPU_API_BASE_URL = originalBaseUrl;
    if (originalToken === undefined) delete process.env.GPU_API_TOKEN; else process.env.GPU_API_TOKEN = originalToken;
  }
});

test("统一 GPU 状态映射为 Canvas 可展示的排队与运行进度", () => {
  assert.deepEqual(gpuProgressState({ model_id: "ernie-image-turbo", status: "queued", stage: null, progress: 5 }), { stage: "queued", progress: 5, label: "ERNIE Image Turbo 排队或准备中" });
  assert.deepEqual(gpuProgressState({ model_id: "flashvsr", status: "running", stage: "enhancing", progress: 42 }), { stage: "running", progress: 42, label: "FlashVSR 生成中" });
});

test("H3 取消仍使用兼容的 v1 任务端点", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.GPU_API_BASE_URL;
  const originalToken = process.env.GPU_API_TOKEN;
  process.env.GPU_API_BASE_URL = "https://gpu.example.test";
  process.env.GPU_API_TOKEN = "test-token";
  let requestUrl = "";
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestUrl = String(url);
    return Response.json({ status: "cancel_requested" });
  }) as typeof fetch;
  try {
    await cancelH3GpuJob("h3-job-1");
    assert.equal(requestUrl, "https://gpu.example.test/api/v1/h3/jobs/h3-job-1/cancel");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.GPU_API_BASE_URL; else process.env.GPU_API_BASE_URL = originalBaseUrl;
    if (originalToken === undefined) delete process.env.GPU_API_TOKEN; else process.env.GPU_API_TOKEN = originalToken;
  }
});
