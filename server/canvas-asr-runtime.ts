import { randomUUID } from "node:crypto";
import { verifyResourceSpeech } from "./asr";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { publishProjectUpdated } from "./canvas-events";
import { readProject } from "./storage";

type CanvasNode = { id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number; locked?: boolean; metadata?: Record<string, unknown> };
type CanvasConnection = { id: string; fromNodeId: string; toNodeId: string; fromPort?: string; toPort?: string };
type CanvasProject = { nodes: CanvasNode[]; connections: CanvasConnection[]; version: number };

export async function verifyCanvasVideoAsr(input: {
  projectId: string;
  videoNodeId: string;
  expectedText: string;
  threshold?: number;
  title?: string;
  originClientId: string;
  remoteOperation: boolean;
}) {
  const project = await readProject(input.projectId) as CanvasProject;
  const video = project.nodes.find((node) => node.id === input.videoNodeId);
  if (!video) throw new Error(`视频节点不存在：${input.videoNodeId}`);
  if (video.type !== "video") throw new Error(`节点 ${input.videoNodeId} 不是视频节点`);
  if (video.metadata?.remoteOperationActive) throw new Error(`节点 ${input.videoNodeId} 正由另一个 MCP 操作锁定`);
  const resourceId = String(video.metadata?.storageKey || "").trim();
  if (!resourceId) throw new Error("视频节点尚未保存到本地资源库");
  const operationId = randomUUID();
  const shotLayout = shotLayoutMetadata(video);
  const existing = project.nodes.find((node) => node.metadata?.artifactType === "volcano-asr-verification" && node.metadata?.sourceVideoNodeId === video.id);
  const resultNodeId = existing?.id || randomUUID();
  const resultTitle = String(input.title || `ASR 验收 · ${video.title}`).slice(0, 180);
  const queuedMetadata = {
    artifactType: "volcano-asr-verification",
    sourceVideoNodeId: video.id,
    expectedText: input.expectedText,
    threshold: Math.max(0.5, Math.min(1, Number(input.threshold) || 0.88)),
    content: "火山 Coding Plan · Seed-ASR 2.0 正在识别视频音轨…",
    status: "loading",
    generationState: "running",
    remoteOperationActive: input.remoteOperation,
    remoteOperationId: input.remoteOperation ? operationId : null,
    remoteOperationLabel: input.remoteOperation ? "MCP · Seed-ASR 2.0 验收中" : "Seed-ASR 2.0 验收中",
    commentColor: "green",
    errorDetails: "",
    ...shotLayout.child(91),
  };
  const operations: CanvasOperation[] = [
    { op: "update_node", nodeId: video.id, patch: { metadata: { remoteOperationActive: input.remoteOperation, remoteOperationId: input.remoteOperation ? operationId : null, remoteOperationLabel: input.remoteOperation ? "MCP · Seed-ASR 2.0 验收中" : "Seed-ASR 2.0 验收中" } } },
  ];
  if (existing?.type === "comment") {
    operations.push({ op: "update_node", nodeId: resultNodeId, patch: { title: resultTitle, metadata: queuedMetadata } });
    project.connections
      .filter((connection) => connection.fromNodeId === resultNodeId || connection.toNodeId === resultNodeId)
      .forEach((connection) => operations.push({ op: "disconnect", connectionId: connection.id }));
  } else if (existing) {
    operations.push(
      { op: "delete_node", nodeId: resultNodeId },
      { op: "add_node", node: { id: resultNodeId, type: "comment", title: resultTitle, position: existing.position, width: existing.width, height: existing.height, locked: existing.locked, metadata: queuedMetadata } },
    );
  } else {
    operations.push({ op: "add_node", node: { id: resultNodeId, type: "comment", title: resultTitle, position: { x: video.position.x + video.width + 96, y: video.position.y }, width: 420, height: 320, metadata: queuedMetadata } });
  }
  if (shotLayout.factoryRunId) operations.push({ op: "layout_shot_columns", factoryRunId: shotLayout.factoryRunId, preserveManualLayout: true });
  await mutateAndPublish(input.projectId, operations, input.originClientId);
  try {
    const verification = await verifyResourceSpeech(resourceId, input.expectedText, input.threshold);
    const content = verificationCommentContent(verification);
    const completed = await mutateAndPublish(input.projectId, [
      { op: "update_node", nodeId: video.id, patch: { metadata: { remoteOperationActive: false, remoteOperationId: null, remoteOperationLabel: verification.passed ? "ASR 验收通过" : "ASR 验收未通过" } } },
      { op: "update_node", nodeId: resultNodeId, patch: { metadata: { ...verification, content, status: "success", generationState: "ready", commentColor: "green", remoteOperationActive: false, remoteOperationId: null, remoteOperationLabel: verification.passed ? "ASR 验收通过" : "ASR 验收未通过", errorDetails: verification.passed ? "" : "视频音轨与分镜文案不一致，需要回修生成链路" } } },
    ], input.originClientId);
    return { projectId: input.projectId, videoNodeId: video.id, resultNodeId, ...verification, projectVersion: completed.project.version };
  } catch (error) {
    const message = safeError(error);
    await mutateAndPublish(input.projectId, [
      { op: "update_node", nodeId: video.id, patch: { metadata: { remoteOperationActive: false, remoteOperationId: null, remoteOperationLabel: "ASR 验收失败" } } },
      { op: "update_node", nodeId: resultNodeId, patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, remoteOperationId: null, remoteOperationLabel: "ASR 验收失败", errorDetails: message } } },
    ], input.originClientId).catch(() => undefined);
    throw error;
  }
}

async function mutateAndPublish(projectId: string, operations: CanvasOperation[], originClientId: string) {
  const result = await applyCanvasOperations(projectId, operations);
  publishProjectUpdated(result.project, originClientId);
  return result;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Seed-ASR 2.0 验收失败")
    .replace(/https?:\/\/\S+/gi, "[URL 已脱敏]")
    .slice(0, 500);
}

function shotLayoutMetadata(node: CanvasNode) {
  const factoryRunId = String(node.metadata?.factoryRunId || "");
  const groupId = String(node.metadata?.groupId || "");
  const shotId = String(node.metadata?.shotId || "");
  return { factoryRunId, child: (layoutOrder: number) => factoryRunId && groupId && shotId ? { factoryRunId, groupId, shotId, layoutManaged: true, layoutSection: "verification", layoutOrder } : {} };
}

export function verificationCommentContent(verification: {
  passed: boolean;
  expectedText: string;
  transcript: string;
  similarity: number;
  threshold: number;
  durationMs?: number;
}) {
  const similarity = Number(verification.similarity.toFixed(4));
  return [
    `## 火山 Coding Plan · Seed-ASR 2.0 验收${verification.passed ? "通过" : "未通过"}`,
    "",
    `- **状态**：${verification.passed ? "pass" : "fail"}`,
    `- **相似度**：${similarity}`,
    `- **阈值**：${verification.threshold}`,
    ...(verification.durationMs ? [`- **耗时**：${verification.durationMs} ms`] : []),
    "",
    "### 识别文本 transcript",
    verification.transcript || "（未识别到文本）",
    "",
    "### 目标文案",
    verification.expectedText,
  ].join("\n");
}
