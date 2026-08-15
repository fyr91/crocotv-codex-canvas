import { randomUUID } from "node:crypto";
import path from "node:path";
import { atomicJson, dataDir, readJson } from "./storage";

export type StudioGenerationJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type StudioGenerationOperation = "asset-image" | "frame-video" | "asset-video" | "playground";

type StudioGenerationJob = {
  id: string;
  projectId: string;
  operation: StudioGenerationOperation;
  status: StudioGenerationJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type JobExecutor = (context: { jobId: string; signal: AbortSignal }) => Promise<Record<string, unknown> | void>;

const jobs = new Map<string, StudioGenerationJob>();
const controllers = new Map<string, AbortController>();
const maximumRetainedJobs = 500;
const jobsPath = path.join(dataDir, "runtime", "studio-generation-jobs.json");

export async function initializeStudioGenerationJobs() {
  const stored = await readJson<StudioGenerationJob[]>(jobsPath, []);
  for (const job of stored.slice(-maximumRetainedJobs)) {
    if (job.status === "queued" || job.status === "running") {
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.error = "本地服务重启，Studio 生成任务已中断";
    }
    jobs.set(job.id, job);
  }
  await persistJobs();
}

export async function createStudioGenerationJob(input: {
  id?: string;
  projectId: string;
  operation: StudioGenerationOperation;
  metadata?: Record<string, unknown>;
  execute: JobExecutor;
}) {
  const id = input.id || randomUUID();
  if (jobs.has(id)) throw new Error(`Studio 生成任务 ID 已存在：${id}`);
  const job: StudioGenerationJob = {
    id,
    projectId: input.projectId,
    operation: input.operation,
    status: "queued",
    createdAt: new Date().toISOString(),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  jobs.set(id, job);
  trimJobs();
  await persistJobs();
  queueMicrotask(() => void executeJob(job, input.execute));
  return publicJob(job);
}

export function findStudioGenerationJob(jobId: string) {
  const job = jobs.get(jobId);
  return job ? publicJob(job) : undefined;
}

export function getStudioGenerationJob(jobId: string) {
  const job = findStudioGenerationJob(jobId);
  if (!job) throw Object.assign(new Error(`Studio 生成任务不存在或已过期：${jobId}`), { statusCode: 404 });
  return job;
}

export async function cancelStudioGenerationJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) throw Object.assign(new Error(`Studio 生成任务不存在或已过期：${jobId}`), { statusCode: 404 });
  if (isTerminal(job.status)) return publicJob(job);
  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  job.error = "用户取消生成";
  controllers.get(jobId)?.abort(new Error("用户取消生成"));
  await persistJobs();
  return publicJob(job);
}

async function executeJob(job: StudioGenerationJob, execute: JobExecutor) {
  if (job.status === "cancelled") return;
  const controller = new AbortController();
  controllers.set(job.id, controller);
  job.status = "running";
  job.startedAt = new Date().toISOString();
  await persistJobs();
  try {
    const result = await execute({ jobId: job.id, signal: controller.signal });
    if (jobs.get(job.id)?.status !== "cancelled") {
      job.status = "completed";
      if (result) job.result = result;
    }
  } catch (error) {
    if (jobs.get(job.id)?.status !== "cancelled") {
      job.status = "failed";
      job.error = safeError(error);
    }
  } finally {
    controllers.delete(job.id);
    job.completedAt ||= new Date().toISOString();
    await persistJobs();
  }
}

function publicJob(job: StudioGenerationJob) {
  return {
    jobId: job.id,
    projectId: job.projectId,
    operation: job.operation,
    status: job.status,
    createdAt: job.createdAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(job.metadata ? { metadata: job.metadata } : {}),
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

function isTerminal(status: StudioGenerationJobStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function trimJobs() {
  if (jobs.size <= maximumRetainedJobs) return;
  for (const [jobId, job] of jobs) {
    if (jobs.size <= maximumRetainedJobs) break;
    if (isTerminal(job.status)) jobs.delete(jobId);
  }
}

async function persistJobs() { await atomicJson(jobsPath, [...jobs.values()]); }

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Studio 生成失败")
    .replace(/https?:\/\/\S+/gi, "[临时素材 URL 已脱敏]")
    .slice(0, 500);
}
