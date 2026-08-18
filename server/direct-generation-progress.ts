import type { GpuJobProgress } from "./gpu-orchestrator";

export type DirectGenerationProgressSnapshot = {
  requestId: string;
  status: "pending" | "running" | "completed" | "failed";
  jobs: GpuJobProgress[];
  updatedAt: string;
  error?: string;
};

const snapshots = new Map<string, DirectGenerationProgressSnapshot>();
const maximumSnapshots = 500;
const retentionMs = 10 * 60_000;

export function directGenerationRequestId(value: unknown) {
  const requestId = String(value || "").trim();
  if (!requestId) return undefined;
  if (requestId.length > 180 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    throw new Error("生成请求 ID 格式无效");
  }
  return requestId;
}

export function beginDirectGenerationProgress(requestId: string) {
  pruneSnapshots();
  const snapshot: DirectGenerationProgressSnapshot = {
    requestId,
    status: "pending",
    jobs: [],
    updatedAt: new Date().toISOString(),
  };
  snapshots.set(requestId, snapshot);
  return publicSnapshot(snapshot);
}

export function publishDirectGenerationProgress(requestId: string, progress: GpuJobProgress) {
  const current = snapshots.get(requestId) || beginDirectGenerationProgress(requestId);
  const jobs = current.jobs.filter((item) => item.outputIndex !== progress.outputIndex);
  jobs.push({ ...progress });
  jobs.sort((left, right) => left.outputIndex - right.outputIndex);
  const snapshot: DirectGenerationProgressSnapshot = {
    ...current,
    status: "running",
    jobs,
    updatedAt: new Date().toISOString(),
  };
  snapshots.set(requestId, snapshot);
  return publicSnapshot(snapshot);
}

export function finishDirectGenerationProgress(requestId: string, error?: unknown) {
  const current = snapshots.get(requestId) || beginDirectGenerationProgress(requestId);
  const message = error instanceof Error ? error.message : error ? String(error) : "";
  const snapshot: DirectGenerationProgressSnapshot = {
    ...current,
    status: message ? "failed" : "completed",
    updatedAt: new Date().toISOString(),
    ...(message ? { error: message.replace(/https?:\/\/\S+/gi, "[URL 已脱敏]").slice(0, 500) } : {}),
  };
  snapshots.set(requestId, snapshot);
  return publicSnapshot(snapshot);
}

export function getDirectGenerationProgress(requestId: string) {
  pruneSnapshots();
  const snapshot = snapshots.get(requestId);
  if (!snapshot) throw Object.assign(new Error("生成进度不存在或已过期"), { statusCode: 404 });
  return publicSnapshot(snapshot);
}

function publicSnapshot(snapshot: DirectGenerationProgressSnapshot): DirectGenerationProgressSnapshot {
  return { ...snapshot, jobs: snapshot.jobs.map((item) => ({ ...item })) };
}

function pruneSnapshots() {
  const oldest = Date.now() - retentionMs;
  for (const [requestId, snapshot] of snapshots) {
    if (Date.parse(snapshot.updatedAt) < oldest) snapshots.delete(requestId);
  }
  while (snapshots.size >= maximumSnapshots) {
    const requestId = snapshots.keys().next().value as string | undefined;
    if (!requestId) break;
    snapshots.delete(requestId);
  }
}
