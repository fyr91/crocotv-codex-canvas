import { randomUUID } from "node:crypto";
import { mutateProject } from "./storage";
import { parseStudioProjectState } from "./studio-schemas";
import type { StudioProjectState } from "./studio-types";

type Position = { x: number; y: number };
type CanvasNode = {
  id: string;
  type: string;
  title: string;
  position: Position;
  width: number;
  height: number;
  locked?: boolean;
  metadata?: Record<string, unknown>;
};
type CanvasConnection = { id: string; fromNodeId: string; toNodeId: string; fromPort?: string; toPort?: string };

export type CanvasOperation =
  | { op: "add_node"; ref?: string; node: Partial<CanvasNode> & Pick<CanvasNode, "type"> }
  | { op: "update_node"; nodeId: string; patch: Partial<Omit<CanvasNode, "id" | "type">> & { metadata?: Record<string, unknown> } }
  | { op: "delete_node"; nodeId: string }
  | { op: "connect"; ref?: string; from: string; to: string; fromPort?: string; toPort?: string }
  | { op: "disconnect"; connectionId?: string; from?: string; to?: string }
  | { op: "rename_project"; title: string }
  | { op: "set_viewport"; viewport: { x: number; y: number; k: number } }
  | { op: "set_studio_state"; state: StudioProjectState }
  | { op: "add_studio_canvas_bindings"; bindings: Array<{ fromNodeId: string; toNodeId: string; fromPort?: string; toPort?: string }> }
  | { op: "layout_shot_columns"; factoryRunId: string; shotIds?: string[]; origin?: Position; groupPadding?: number; nodeGap?: number; sectionGap?: number; columnGap?: number; preserveManualLayout?: boolean };

type ApplyCanvasOperationOptions = {
  allowStudioManagedWrites?: boolean;
};

const allowedNodeTypes = new Set(["text", "image", "video", "audio", "music", "config", "split", "group", "comment"]);
const allowedConnectionPorts = new Set(["node", "workflow-input", "workflow-output"]);

export async function applyCanvasOperations(projectId: string, operations: CanvasOperation[], expectedVersion?: number, options: ApplyCanvasOperationOptions = {}) {
  if (!operations.length) throw new Error("至少需要一个画布操作");
  const createdRefs: Record<string, string> = {};
  const project = await mutateProject(projectId, (current) => {
    let nodes = cloneArray<CanvasNode>(current.nodes);
    let connections = cloneArray<CanvasConnection>(current.connections);
    let title = cleanTitle(current.title) || "未命名画布";
    let viewport = validViewport(current.viewport) || { x: 0, y: 0, k: 1 };
    let studio = current.studio;

    for (const operation of operations) {
      if (operation.op === "add_node") {
        if (!allowedNodeTypes.has(operation.node.type)) throw new Error(`不支持的节点类型：${operation.node.type}`);
        if (operation.node.metadata?.studioManaged && !options.allowStudioManagedWrites) throw new Error("Studio 托管节点只能通过 Studio 结构化命令创建");
        const id = cleanId(operation.node.id) || randomUUID();
        if (nodes.some((node) => node.id === id)) throw new Error(`节点已存在：${id}`);
        const defaults = nodeDefaults(operation.node.type);
        const node: CanvasNode = {
          id,
          type: operation.node.type,
          title: cleanTitle(operation.node.title) || defaults.title,
          position: validPosition(operation.node.position) || nextNodePosition(nodes),
          width: positiveNumber(operation.node.width) || defaults.width,
          height: positiveNumber(operation.node.height) || defaults.height,
          ...(operation.node.locked ? { locked: true } : {}),
          metadata: { status: operation.node.metadata?.status || defaultStatus(operation.node.type, operation.node.metadata), ...(operation.node.metadata || {}) },
        };
        nodes.push(node);
        if (operation.ref) {
          if (createdRefs[operation.ref]) throw new Error(`临时引用重复：${operation.ref}`);
          createdRefs[operation.ref] = id;
        }
        continue;
      }
      if (operation.op === "update_node") {
        const nodeId = resolveNodeId(operation.nodeId, createdRefs);
        const index = nodes.findIndex((node) => node.id === nodeId);
        if (index < 0) throw new Error(`节点不存在：${nodeId}`);
        const currentNode = nodes[index];
        if (isStudioManaged(currentNode) && !options.allowStudioManagedWrites && !isStudioVisualPatch(operation.patch)) {
          throw new Error(`Studio 托管节点 ${nodeId} 的内容和语义只能通过 Studio 结构化命令修改`);
        }
        nodes[index] = {
          ...currentNode,
          ...(operation.patch.title != null ? { title: cleanTitle(operation.patch.title) || currentNode.title } : {}),
          ...(validPosition(operation.patch.position) ? { position: validPosition(operation.patch.position)! } : {}),
          ...(positiveNumber(operation.patch.width) ? { width: positiveNumber(operation.patch.width)! } : {}),
          ...(positiveNumber(operation.patch.height) ? { height: positiveNumber(operation.patch.height)! } : {}),
          ...(operation.patch.locked != null ? { locked: Boolean(operation.patch.locked) } : {}),
          ...(operation.patch.metadata ? { metadata: { ...(currentNode.metadata || {}), ...operation.patch.metadata } } : {}),
        };
        continue;
      }
      if (operation.op === "delete_node") {
        const nodeId = resolveNodeId(operation.nodeId, createdRefs);
        if (!nodes.some((node) => node.id === nodeId)) throw new Error(`节点不存在：${nodeId}`);
        if (isStudioManaged(nodes.find((node) => node.id === nodeId)) && !options.allowStudioManagedWrites) throw new Error(`Studio 托管节点 ${nodeId} 不能直接删除`);
        nodes = nodes.filter((node) => node.id !== nodeId);
        connections = connections.filter((connection) => connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId);
        continue;
      }
      if (operation.op === "connect") {
        const fromNodeId = resolveNodeId(operation.from, createdRefs);
        const toNodeId = resolveNodeId(operation.to, createdRefs);
        if (operation.fromPort && !allowedConnectionPorts.has(operation.fromPort)) throw new Error(`不支持的起点端口：${operation.fromPort}`);
        if (operation.toPort && !allowedConnectionPorts.has(operation.toPort)) throw new Error(`不支持的终点端口：${operation.toPort}`);
        if (!nodes.some((node) => node.id === fromNodeId)) throw new Error(`起点节点不存在：${fromNodeId}`);
        if (!nodes.some((node) => node.id === toNodeId)) throw new Error(`终点节点不存在：${toNodeId}`);
        if (!options.allowStudioManagedWrites && [fromNodeId, toNodeId].some((nodeId) => isStudioManaged(nodes.find((node) => node.id === nodeId)))) {
          throw new Error("Studio 托管节点的连接只能通过 Studio 结构化命令修改");
        }
        if (fromNodeId === toNodeId) throw new Error("节点不能连接到自身");
        const duplicate = connections.some((connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId && connection.fromPort === operation.fromPort && connection.toPort === operation.toPort);
        if (!duplicate) {
          const id = randomUUID();
          connections.push({ id, fromNodeId, toNodeId, ...(operation.fromPort ? { fromPort: operation.fromPort } : {}), ...(operation.toPort ? { toPort: operation.toPort } : {}) });
          if (operation.ref) createdRefs[operation.ref] = id;
        }
        continue;
      }
      if (operation.op === "disconnect") {
        const before = connections.length;
        const from = operation.from ? resolveNodeId(operation.from, createdRefs) : undefined;
        const to = operation.to ? resolveNodeId(operation.to, createdRefs) : undefined;
        const selectedConnections = connections.filter((connection) => operation.connectionId
          ? connection.id === operation.connectionId
          : Boolean(from && to && connection.fromNodeId === from && connection.toNodeId === to));
        if (!options.allowStudioManagedWrites && selectedConnections.some((connection) => [connection.fromNodeId, connection.toNodeId].some((nodeId) => isStudioManaged(nodes.find((node) => node.id === nodeId))))) {
          throw new Error("Studio 托管节点的连接只能通过 Studio 结构化命令修改");
        }
        connections = connections.filter((connection) => operation.connectionId
          ? connection.id !== operation.connectionId
          : !(from && to && connection.fromNodeId === from && connection.toNodeId === to));
        if (connections.length === before) throw new Error("没有找到需要断开的连接");
        continue;
      }
      if (operation.op === "rename_project") {
        title = cleanTitle(operation.title) || title;
        continue;
      }
      if (operation.op === "set_studio_state") {
        if (!options.allowStudioManagedWrites) throw new Error("Studio state 只能通过 Studio 结构化命令修改");
        studio = parseStudioProjectState(operation.state);
        continue;
      }
      if (operation.op === "add_studio_canvas_bindings") {
        if (!options.allowStudioManagedWrites) throw new Error("Studio Canvas 绑定只能通过结构化命令修改");
        if (operation.bindings.length > 100) throw new Error("一次最多新增 100 个 Studio Canvas 绑定");
        const state = parseStudioProjectState(studio);
        const bindings = [...state.canvasBindings];
        for (const binding of operation.bindings) {
          const from = nodes.find((node) => node.id === binding.fromNodeId);
          const to = nodes.find((node) => node.id === binding.toNodeId);
          if (!from || !to) throw new Error("Studio Canvas 绑定包含不存在的节点");
          if (!isStudioManaged(from) && !isStudioManaged(to)) throw new Error("Studio Canvas 绑定必须连接至少一个 Studio 托管节点");
          const fromPort = binding.fromPort || "workflow-output";
          const toPort = binding.toPort || "workflow-input";
          if (!allowedConnectionPorts.has(fromPort) || !allowedConnectionPorts.has(toPort)) throw new Error("Studio Canvas 绑定端口无效");
          const alreadyBound = bindings.some((item) => item.fromNodeId === from.id && item.toNodeId === to.id && (item.fromPort || "workflow-output") === fromPort && (item.toPort || "workflow-input") === toPort);
          if (!alreadyBound) bindings.push({ id: randomUUID(), fromNodeId: from.id, toNodeId: to.id, ...(binding.fromPort ? { fromPort: binding.fromPort as "node" | "workflow-input" | "workflow-output" } : {}), ...(binding.toPort ? { toPort: binding.toPort as "node" | "workflow-input" | "workflow-output" } : {}) });
        }
        studio = { ...state, canvasBindings: bindings };
        continue;
      }
      if (operation.op === "set_viewport") viewport = validViewport(operation.viewport) || viewport;
      if (operation.op === "layout_shot_columns") nodes = layoutShotColumns(nodes, operation);
    }

    return { ...current, title, viewport, nodes, connections, ...(studio ? { studio } : {}) };
  }, expectedVersion);
  return { project, createdRefs };
}

function resolveNodeId(value: string, refs: Record<string, string>) { return refs[value] || value; }
function isStudioManaged(node: CanvasNode | undefined) { return node?.metadata?.studioManaged === true; }
function isStudioVisualPatch(patch: Extract<CanvasOperation, { op: "update_node" }>["patch"]) {
  return Object.keys(patch).every((key) => key === "position" || key === "width" || key === "height");
}
function cleanId(value: unknown) { const text = String(value || "").trim(); return /^[A-Za-z0-9_-]{1,80}$/.test(text) ? text : ""; }
function cleanTitle(value: unknown) { return String(value || "").trim().slice(0, 180); }
function positiveNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : undefined; }
function validPosition(value: unknown): Position | undefined {
  const input = value as Position | undefined;
  return input && Number.isFinite(Number(input.x)) && Number.isFinite(Number(input.y)) ? { x: Number(input.x), y: Number(input.y) } : undefined;
}
function validViewport(value: unknown) {
  const input = value as { x?: unknown; y?: unknown; k?: unknown } | undefined;
  return input && Number.isFinite(Number(input.x)) && Number.isFinite(Number(input.y)) && Number(input.k) > 0
    ? { x: Number(input.x), y: Number(input.y), k: Number(input.k) }
    : undefined;
}
function cloneArray<T>(value: unknown): T[] { return Array.isArray(value) ? structuredClone(value) : []; }
function nextNodePosition(nodes: CanvasNode[]) {
  if (!nodes.length) return { x: 160, y: 160 };
  const right = Math.max(...nodes.map((node) => node.position.x + node.width));
  return { x: right + 64, y: Math.min(...nodes.map((node) => node.position.y)) };
}
function defaultStatus(type: string, metadata?: Record<string, unknown>) {
  if (metadata?.content || metadata?.storageKey) return "success";
  return type === "config" || type === "group" ? "idle" : type === "text" ? "success" : "idle";
}
function nodeDefaults(type: string) {
  if (type === "config") return { title: "生成模组", width: 360, height: 390 };
  if (type === "image") return { title: "图片", width: 360, height: 320 };
  if (type === "video") return { title: "视频", width: 400, height: 300 };
  if (type === "audio") return { title: "音频", width: 360, height: 180 };
  if (type === "music") return { title: "音乐", width: 380, height: 220 };
  if (type === "comment") return { title: "注释", width: 280, height: 180 };
  if (type === "group") return { title: "组", width: 720, height: 520 };
  if (type === "split") return { title: "拆分", width: 340, height: 280 };
  return { title: "文本", width: 320, height: 240 };
}

function layoutShotColumns(nodes: CanvasNode[], operation: Extract<CanvasOperation, { op: "layout_shot_columns" }>) {
  const factoryRunId = String(operation.factoryRunId || "").trim();
  if (!factoryRunId) throw new Error("分镜列布局缺少 factoryRunId");
  const requestedShots = new Set((operation.shotIds || []).map(String).filter(Boolean));
  const groups = nodes.filter((node) => node.type === "group" && node.metadata?.groupKind === "shot-column" && node.metadata?.factoryRunId === factoryRunId && (!requestedShots.size || requestedShots.has(String(node.metadata?.shotId || ""))));
  if (!groups.length) throw new Error("没有找到需要布局的分镜列 Group");
  groups.sort((a, b) => Number(a.metadata?.columnIndex || 0) - Number(b.metadata?.columnIndex || 0) || String(a.metadata?.shotId || "").localeCompare(String(b.metadata?.shotId || "")));
  const padding = boundedLayoutNumber(operation.groupPadding, 48, 24, 120);
  const nodeGap = boundedLayoutNumber(operation.nodeGap, 56, 16, 200);
  const sectionGap = boundedLayoutNumber(operation.sectionGap, 96, nodeGap, 280);
  const columnGap = boundedLayoutNumber(operation.columnGap, 160, 48, 400);
  const headerHeight = 72;
  const existingOrigin = { x: Math.min(...groups.map((group) => group.position.x)), y: Math.min(...groups.map((group) => group.position.y)) };
  let columnX = validPosition(operation.origin)?.x ?? existingOrigin.x;
  const columnY = validPosition(operation.origin)?.y ?? existingOrigin.y;
  const groupIds = new Set(groups.map((group) => group.id));
  const outside = nodes.filter((node) => !groupIds.has(node.id) && !groupIds.has(String(node.metadata?.groupId || "")));
  const layouts: Array<{ group: CanvasNode; children: CanvasNode[]; width: number; height: number; positions: Map<string, Position> }> = [];

  for (const group of groups) {
    const children = nodes.filter((node) => node.metadata?.groupId === group.id);
    const manual = children.filter((node) => operation.preserveManualLayout !== false && node.metadata?.layoutManaged === false);
    const managed = children.filter((node) => !manual.includes(node)).sort((a, b) => Number(a.metadata?.layoutOrder || 0) - Number(b.metadata?.layoutOrder || 0) || a.position.y - b.position.y || a.id.localeCompare(b.id));
    const oldOrigin = group.position;
    const maxChildWidth = Math.max(424, ...children.map((node) => node.width));
    const manualRight = Math.max(0, ...manual.map((node) => node.position.x - oldOrigin.x + node.width + padding));
    const width = Math.max(520, maxChildWidth + padding * 2, manualRight);
    const delta = { x: columnX - oldOrigin.x, y: columnY - oldOrigin.y };
    const positions = new Map<string, Position>();
    const occupied = manual.map((node) => {
      const position = { x: node.position.x + delta.x, y: node.position.y + delta.y };
      positions.set(node.id, position);
      return rect(position, node.width, node.height);
    });
    let cursorY = columnY + headerHeight + padding;
    let previousSection = "";
    for (const node of managed) {
      const section = String(node.metadata?.layoutSection || "");
      if (previousSection && section !== previousSection) cursorY += Math.max(0, sectionGap - nodeGap);
      let position = { x: columnX + padding, y: cursorY };
      while (occupied.some((item) => rectanglesOverlap(rect(position, node.width, node.height), item, nodeGap))) {
        position = { ...position, y: Math.max(...occupied.filter((item) => rectanglesOverlap(rect(position, node.width, node.height), item, nodeGap)).map((item) => item.bottom + nodeGap)) };
      }
      positions.set(node.id, position);
      occupied.push(rect(position, node.width, node.height));
      cursorY = position.y + node.height + nodeGap;
      previousSection = section;
    }
    const contentBottom = Math.max(columnY + headerHeight + padding, ...occupied.map((item) => item.bottom));
    const height = Math.max(320, contentBottom - columnY + padding);
    layouts.push({ group, children, width, height, positions });
    columnX += width + columnGap;
  }

  const plannedBounds = layouts.map((layout, index) => rect({ x: (validPosition(operation.origin)?.x ?? existingOrigin.x) + layouts.slice(0, index).reduce((sum, item) => sum + item.width + columnGap, 0), y: columnY }, layout.width, layout.height));
  const collidingOutside = outside.filter((node) => plannedBounds.some((bounds) => rectanglesOverlap(bounds, rect(node.position, node.width, node.height), columnGap)));
  const shiftX = collidingOutside.length ? Math.max(...collidingOutside.map((node) => node.position.x + node.width + columnGap)) - plannedBounds[0].left : 0;
  const next = nodes.map((node) => {
    const layout = layouts.find((item) => item.group.id === node.id || item.children.some((child) => child.id === node.id));
    if (!layout) return node;
    const layoutIndex = layouts.indexOf(layout);
    const groupX = plannedBounds[layoutIndex].left + shiftX;
    if (node.id === layout.group.id) return { ...node, position: { x: groupX, y: columnY }, width: layout.width, height: layout.height, metadata: { ...(node.metadata || {}), layoutCollisionFree: true } };
    const position = layout.positions.get(node.id)!;
    return { ...node, position: { x: position.x + shiftX, y: position.y }, metadata: { ...(node.metadata || {}), layoutCollisionFree: true } };
  });
  assertNoShotNodeOverlap(next, new Set(layouts.flatMap((layout) => layout.children.map((node) => node.id))));
  return next;
}

function boundedLayoutNumber(value: unknown, fallback: number, minimum: number, maximum: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }
function rect(position: Position, width: number, height: number) { return { left: position.x, top: position.y, right: position.x + width, bottom: position.y + height }; }
function rectanglesOverlap(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>, gap = 0) { return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top; }
function assertNoShotNodeOverlap(nodes: CanvasNode[], managedIds: Set<string>) {
  const managed = nodes.filter((node) => managedIds.has(node.id));
  for (let left = 0; left < managed.length; left += 1) for (let right = left + 1; right < managed.length; right += 1) {
    if (managed[left].metadata?.groupId === managed[right].metadata?.groupId && rectanglesOverlap(rect(managed[left].position, managed[left].width, managed[left].height), rect(managed[right].position, managed[right].width, managed[right].height))) throw new Error(`分镜列布局仍存在节点重叠：${managed[left].id} / ${managed[right].id}`);
  }
}
