type Position = { x: number; y: number };
type NodeLike = { id?: string; type?: string; position?: Position; width?: number; height?: number; metadata?: Record<string, unknown> };
type OperationLike = { op?: string; node?: NodeLike; [key: string]: unknown };
type Bounds = { id: string; type: string; groupId: string; left: number; top: number; right: number; bottom: number };

const GAP = 64;

export function avoidMcpNodeOverlaps(existingNodes: NodeLike[], inputOperations: unknown[]) {
  const operations = inputOperations as OperationLike[];
  if (!operations.some((operation) => operation.op === "add_node")) return inputOperations;
  const occupied = existingNodes.flatMap((node) => boundsFor(node));
  return operations.map((operation, index) => {
    if (operation.op !== "add_node" || !operation.node) return operation;
    const size = nodeSize(operation.node);
    const node = operation.node;
    const groupId = String(node.metadata?.groupId || "");
    let position = validPosition(node.position) ? { ...node.position } : nextPosition(occupied);
    let collisions = collidingBounds(position, size, groupId, occupied);
    while (collisions.length) {
      position = groupId
        ? { ...position, y: Math.max(...collisions.map((item) => item.bottom)) + GAP }
        : { ...position, x: Math.max(...collisions.map((item) => item.right)) + GAP };
      collisions = collidingBounds(position, size, groupId, occupied);
    }
    const id = String(node.id || operation.ref || `mcp-add-${index}`);
    occupied.push({ id, type: String(node.type || ""), groupId, left: position.x, top: position.y, right: position.x + size.width, bottom: position.y + size.height });
    return { ...operation, node: { ...node, position } };
  });
}

function boundsFor(node: NodeLike): Bounds[] {
  if (!validPosition(node.position)) return [];
  const size = nodeSize(node);
  return [{
    id: String(node.id || ""),
    type: String(node.type || ""),
    groupId: String(node.metadata?.groupId || ""),
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + size.width,
    bottom: node.position.y + size.height,
  }];
}

function collidingBounds(position: Position, size: { width: number; height: number }, groupId: string, occupied: Bounds[]) {
  const candidate = { left: position.x, top: position.y, right: position.x + size.width, bottom: position.y + size.height };
  return occupied.filter((item) => {
    if ((item.type === "group" && item.id === groupId) || (groupId === item.groupId && item.type === "group")) return false;
    return candidate.left < item.right + GAP && candidate.right + GAP > item.left && candidate.top < item.bottom + GAP && candidate.bottom + GAP > item.top;
  });
}

function nextPosition(occupied: Bounds[]) {
  if (!occupied.length) return { x: 160, y: 160 };
  return { x: Math.max(...occupied.map((item) => item.right)) + GAP, y: Math.min(...occupied.map((item) => item.top)) };
}

function validPosition(value: unknown): value is Position {
  const position = value as Position | undefined;
  return Boolean(position && Number.isFinite(position.x) && Number.isFinite(position.y));
}

function nodeSize(node: NodeLike) {
  const defaults: Record<string, { width: number; height: number }> = {
    text: { width: 320, height: 240 }, image: { width: 360, height: 320 }, video: { width: 400, height: 300 },
    audio: { width: 360, height: 180 }, music: { width: 380, height: 220 }, config: { width: 360, height: 390 },
    split: { width: 340, height: 280 }, group: { width: 720, height: 520 }, comment: { width: 280, height: 180 },
  };
  const fallback = defaults[String(node.type || "")] || defaults.text;
  return { width: positive(node.width) || fallback.width, height: positive(node.height) || fallback.height };
}

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}
