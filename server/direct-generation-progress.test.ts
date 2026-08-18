import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { beginDirectGenerationProgress, directGenerationRequestId, finishDirectGenerationProgress, getDirectGenerationProgress, publishDirectGenerationProgress } from "./direct-generation-progress";

describe("direct generation progress bridge", () => {
  it("keeps the real scheduler job ids separated by output index", () => {
    const requestId = `test-${randomUUID()}`;
    beginDirectGenerationProgress(requestId);
    publishDirectGenerationProgress(requestId, { stage: "queued", jobId: "job-a", outputIndex: 0, progress: 0, label: "已排队" });
    publishDirectGenerationProgress(requestId, { stage: "running", jobId: "job-b", outputIndex: 1, progress: 42, label: "生成中" });
    finishDirectGenerationProgress(requestId);

    const snapshot = getDirectGenerationProgress(requestId);
    assert.equal(snapshot.requestId, requestId);
    assert.equal(snapshot.status, "completed");
    assert.deepEqual(snapshot.jobs.map((job) => ({ jobId: job.jobId, outputIndex: job.outputIndex, progress: job.progress })), [
      { jobId: "job-a", outputIndex: 0, progress: 0 },
      { jobId: "job-b", outputIndex: 1, progress: 42 },
    ]);
  });

  it("rejects identifiers that cannot safely enter a route", () => {
    assert.throws(() => directGenerationRequestId("bad/request"), /生成请求 ID 格式无效/);
  });
});
