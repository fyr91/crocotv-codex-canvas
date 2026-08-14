import { randomUUID } from "node:crypto";
import path from "node:path";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { publishProjectUpdated } from "./canvas-events";
import { queueCanvasConfigNodes, runCanvasConfigNodes } from "./canvas-node-runtime";
import { atomicJson, dataDir, listProjects, readJson, readProject } from "./storage";

type CanvasRunJob = {
  id: string;
  projectId: string;
  nodeIds: string[];
  concurrency: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: Awaited<ReturnType<typeof runCanvasConfigNodes>>;
  error?: string;
  targetOutputNodeIds?: Record<string, string[]>;
};

const jobs = new Map<string, CanvasRunJob>();
const controllers = new Map<string, AbortController>();
const maximumRetainedJobs = 200;
const jobsPath = path.join(dataDir, "runtime", "canvas-run-jobs.json");

export async function initializeCanvasRunJobs() {
  const stored = await readJson<CanvasRunJob[]>(jobsPath, []);
  for (const job of stored.slice(-maximumRetainedJobs)) {
    if (job.status === "queued" || job.status === "running") {
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.error = "本地服务重启，运行任务已中断";
    }
    jobs.set(job.id, job);
  }
  await persistJobs();
}

export async function createCanvasRunJob(input: {
  projectId: string;
  nodeIds: string[];
  concurrency?: number;
  originClientId: string;
  targetOutputNodeIds?: Record<string, string[]>;
}) {
  const jobId = randomUUID();
  const queued = await queueCanvasConfigNodes({
    projectId: input.projectId,
    configNodeIds: input.nodeIds,
    operationId: jobId,
    originClientId: input.originClientId,
    targetOutputNodeIds: input.targetOutputNodeIds,
  });
  const requestedConcurrency = Number(input.concurrency);
  const concurrency = Math.max(1, Math.min(queued.nodeIds.length, Number.isInteger(requestedConcurrency) && requestedConcurrency > 0 ? requestedConcurrency : queued.nodeIds.length));
  const job: CanvasRunJob = {
    id: jobId,
    projectId: input.projectId,
    nodeIds: queued.nodeIds,
    concurrency,
    status: "queued",
    createdAt: new Date().toISOString(),
    ...(input.targetOutputNodeIds ? { targetOutputNodeIds: input.targetOutputNodeIds } : {}),
  };
  jobs.set(job.id, job);
  trimJobs();
  await persistJobs();
  void executeJob(job, input.originClientId);
  return publicJob(job);
}

export async function createCanvasRerunJob(input: { projectId: string; outputNodeIds: string[]; concurrency?: number; originClientId: string }) {
  const project = await readProject(input.projectId) as { nodes?: Array<{ id: string; type: string; metadata?: Record<string, unknown> }> };
  const outputIds = [...new Set(input.outputNodeIds.map(String).filter(Boolean))];
  if (!outputIds.length) throw new Error("至少需要一个结果节点 ID");
  const targets: Record<string, string[]> = {};
  for (const outputId of outputIds) {
    const node = (project.nodes || []).find((item) => item.id === outputId);
    if (!node) throw new Error(`结果节点不存在：${outputId}`);
    const configNodeId = String(node.metadata?.sourceConfigNodeId || "");
    const config = (project.nodes || []).find((item) => item.id === configNodeId);
    if (!config || config.type !== "config") throw new Error(`结果节点 ${outputId} 没有可复现的生成模组`);
    (targets[configNodeId] ||= []).push(outputId);
  }
  return createCanvasRunJob({ projectId: input.projectId, nodeIds: Object.keys(targets), concurrency: input.concurrency, originClientId: input.originClientId, targetOutputNodeIds: targets });
}

export function getCanvasRunJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) throw Object.assign(new Error(`运行任务不存在或已过期：${jobId}`), { statusCode: 404 });
  return publicJob(job);
}

export async function cancelCanvasRunJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) throw Object.assign(new Error(`运行任务不存在或已过期：${jobId}`), { statusCode: 404 });
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") return publicJob(job);
  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  job.error = "用户取消运行";
  controllers.get(jobId)?.abort(new Error("用户取消运行"));
  const project = await readProject(job.projectId) as { nodes?: Array<{ id: string; metadata?: Record<string, unknown> }> };
  const operations = (project.nodes || []).flatMap((node): CanvasOperation[] => String(node.metadata?.remoteOperationId || "") === jobId ? [{
    op: "update_node",
    nodeId: node.id,
    patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationLabel: "MCP 运行已取消", errorDetails: "用户取消运行" } },
  }] : []);
  if (operations.length) {
    const result = await applyCanvasOperations(job.projectId, operations);
    publishProjectUpdated(result.project, "mcp-cancel");
  }
  await persistJobs();
  return publicJob(job);
}

async function executeJob(job: CanvasRunJob, originClientId: string) {
  const controller = new AbortController();
  controllers.set(job.id, controller);
  job.status = "running";
  job.startedAt = new Date().toISOString();
  await persistJobs();
  try {
    job.result = await runCanvasConfigNodes({
      projectId: job.projectId,
      configNodeIds: job.nodeIds,
      concurrency: job.concurrency,
      originClientId,
      remoteOperation: true,
      operationId: job.id,
      signal: controller.signal,
      targetOutputNodeIds: job.targetOutputNodeIds,
    });
    if (jobs.get(job.id)?.status !== "cancelled") job.status = "completed";
  } catch (error) {
    if (jobs.get(job.id)?.status !== "cancelled") { job.status = "failed"; job.error = safeError(error); }
  } finally {
    controllers.delete(job.id);
    job.completedAt = new Date().toISOString();
    await persistJobs();
  }
}

export async function recoverInterruptedCanvasRuns() {
  for (const summary of await listProjects()) {
    const projectId = String(summary?.id || "");
    if (!projectId) continue;
    const project = await readProject(projectId) as { nodes?: Array<{ id: string; metadata?: Record<string, unknown> }> };
    const operations = (project.nodes || []).flatMap((node): CanvasOperation[] => node.metadata?.remoteOperationActive ? [{
      op: "update_node",
      nodeId: node.id,
      patch: {
        metadata: {
          remoteOperationActive: false,
          remoteOperationId: null,
          remoteOperationLabel: "服务重启，操作已中断",
          ...(node.metadata?.generationState === "queued" || node.metadata?.generationState === "running"
            ? { status: "error", generationState: "failed", errorDetails: "本地服务重启后原 MCP 操作已终止，请重新运行节点" }
            : {}),
        },
      },
    }] : []);
    if (!operations.length) continue;
    const result = await applyCanvasOperations(projectId, operations);
    publishProjectUpdated(result.project, "service-recovery");
  }
}

function publicJob(job: CanvasRunJob) {
  return {
    jobId: job.id,
    projectId: job.projectId,
    nodeIds: job.nodeIds,
    concurrency: job.concurrency,
    status: job.status,
    createdAt: job.createdAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

function trimJobs() {
  if (jobs.size <= maximumRetainedJobs) return;
  for (const [jobId, job] of jobs) {
    if (jobs.size <= maximumRetainedJobs) break;
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") jobs.delete(jobId);
  }
}

async function persistJobs() { await atomicJson(jobsPath, [...jobs.values()]); }

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "画布节点运行失败")
    .replace(/https?:\/\/\S+/gi, "[临时素材 URL 已脱敏]")
    .slice(0, 500);
}
