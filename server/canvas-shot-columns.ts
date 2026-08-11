import { createHash } from "node:crypto";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { publishProjectUpdated } from "./canvas-events";
import { readProject } from "./storage";

type ProjectNode = { id: string; type: string; metadata?: Record<string, unknown> };
type LayoutOptions = { origin?: { x: number; y: number }; groupPadding?: number; nodeGap?: number; sectionGap?: number; columnGap?: number; preserveManualLayout?: boolean };

export async function upsertCanvasShotColumn(input: { projectId: string; factoryRunId: string; shotId: string; columnIndex: number; title?: string; operations?: CanvasOperation[]; layout?: LayoutOptions; originClientId: string }) {
  const project = await readProject(input.projectId) as { nodes?: ProjectNode[] };
  const factoryRunId = boundedId(input.factoryRunId, "factoryRunId");
  const shotId = boundedId(input.shotId, "shotId");
  const existing = (project.nodes || []).find((node) => node.type === "group" && node.metadata?.groupKind === "shot-column" && node.metadata?.factoryRunId === factoryRunId && node.metadata?.shotId === shotId);
  const groupId = existing?.id || deterministicGroupId(factoryRunId, shotId);
  const operations: CanvasOperation[] = [];
  if (!existing) operations.push({
    op: "add_node",
    node: {
      id: groupId,
      type: "group",
      title: String(input.title || `${String(Math.max(0, Math.floor(input.columnIndex)) + 1).padStart(2, "0")} · ${shotId}`).slice(0, 180),
      position: input.layout?.origin || { x: 160, y: 160 },
      width: 520,
      height: 320,
      metadata: { groupKind: "shot-column", factoryRunId, shotId, columnIndex: Math.max(0, Math.floor(input.columnIndex)), layoutDirection: "vertical", layoutCollisionFree: true },
    },
  });
  else operations.push({ op: "update_node", nodeId: groupId, patch: { ...(input.title ? { title: input.title } : {}), metadata: { columnIndex: Math.max(0, Math.floor(input.columnIndex)), layoutDirection: "vertical" } } });
  for (const operation of input.operations || []) operations.push(bindOperationToShot(operation, groupId, factoryRunId, shotId, project.nodes || []));
  operations.push({ op: "layout_shot_columns", factoryRunId, ...(input.layout || {}) });
  const result = await applyCanvasOperations(input.projectId, operations);
  publishProjectUpdated(result.project, input.originClientId);
  return { projectId: input.projectId, factoryRunId, shotId, groupId, projectVersion: result.project.version, createdRefs: result.createdRefs };
}

export async function relayoutCanvasShotColumns(input: { projectId: string; factoryRunId: string; shotIds?: string[]; layout?: LayoutOptions; originClientId: string }) {
  const factoryRunId = boundedId(input.factoryRunId, "factoryRunId");
  const result = await applyCanvasOperations(input.projectId, [{ op: "layout_shot_columns", factoryRunId, shotIds: input.shotIds, ...(input.layout || {}) }]);
  publishProjectUpdated(result.project, input.originClientId);
  return { projectId: input.projectId, factoryRunId, shotIds: input.shotIds || [], projectVersion: result.project.version };
}

function bindOperationToShot(operation: CanvasOperation, groupId: string, factoryRunId: string, shotId: string, nodes: ProjectNode[]): CanvasOperation {
  if (operation.op === "layout_shot_columns") throw new Error("分镜列操作中不能嵌套布局命令");
  if (operation.op === "add_node" && operation.node.type !== "group") return {
    ...operation,
    node: { ...operation.node, metadata: { ...(operation.node.metadata || {}), groupId, factoryRunId, shotId, layoutManaged: operation.node.metadata?.layoutManaged !== false } },
  };
  if (operation.op === "update_node") {
    const target = nodes.find((node) => node.id === operation.nodeId);
    if (target && target.id !== groupId && target.metadata?.groupId && target.metadata.groupId !== groupId) throw new Error(`节点 ${target.id} 属于其他分镜列`);
    if (target?.type !== "group") return { ...operation, patch: { ...operation.patch, metadata: { ...(operation.patch.metadata || {}), groupId, factoryRunId, shotId } } };
  }
  return operation;
}

function deterministicGroupId(factoryRunId: string, shotId: string) { return `shot-column-${createHash("sha256").update(`${factoryRunId}\0${shotId}`).digest("hex").slice(0, 32)}`; }
function boundedId(value: string, label: string) { const text = String(value || "").trim(); if (!text || text.length > 80) throw new Error(`${label} 必须是 1–80 个字符`); return text; }
