import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDataDir = "";
let jobs: typeof import("./studio-generation-jobs");

before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "croco-studio-generation-jobs-"));
  process.env.CROCO_DATA_DIR = testDataDir;
  const storage = await import("./storage");
  jobs = await import("./studio-generation-jobs");
  await storage.ensureStorage();
  await jobs.initializeStudioGenerationJobs();
});

after(async () => {
  if (testDataDir) await rm(testDataDir, { recursive: true, force: true });
});

test("Studio generation jobs expose durable running and completed states", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const created = await jobs.createStudioGenerationJob({
    projectId: "project-1",
    operation: "asset-image",
    execute: async () => { await gate; return { assetId: "asset-1" }; },
  });
  assert.match(created.jobId, /^[a-f0-9-]{36}$/);
  await waitFor(() => jobs.getStudioGenerationJob(created.jobId).status === "running");
  release();
  await waitFor(() => jobs.getStudioGenerationJob(created.jobId).status === "completed");
  assert.deepEqual(jobs.getStudioGenerationJob(created.jobId).result, { assetId: "asset-1" });
});

test("Studio generation jobs abort and retain cancellation as terminal state", async () => {
  const created = await jobs.createStudioGenerationJob({
    projectId: "project-2",
    operation: "playground",
    execute: ({ signal }) => new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  });
  await waitFor(() => jobs.getStudioGenerationJob(created.jobId).status === "running");
  const cancelled = await jobs.cancelStudioGenerationJob(created.jobId);
  assert.equal(cancelled.status, "cancelled");
  await waitFor(() => jobs.getStudioGenerationJob(created.jobId).completedAt !== undefined);
  assert.equal(jobs.getStudioGenerationJob(created.jobId).status, "cancelled");
});

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for job state");
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}
