import type { CanvasOperation } from "./canvas-commands";

type Position = { x: number; y: number };
type PlacementNode = {
  id?: string;
  type?: string;
  position?: Position;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
};

const DEFAULT_GAP = 40;

export function avoidStudioNodeOverlaps(existingNodes: PlacementNode[], operations: CanvasOperation[], gap = DEFAULT_GAP): CanvasOperation[] {
  const occupied = existingNodes.filter(isLeafWithBounds).map(toBounds);
  return operations.map((operation) => {
    if (operation.op !== "add_node" || operation.node.type === "group" || !validPosition(operation.node.position)) return operation;
    const width = positive(operation.node.width) || defaultSize(operation.node.type).width;
    const height = positive(operation.node.height) || defaultSize(operation.node.type).height;
    let position = { ...operation.node.position };
    let collisions = occupied.filter((bounds) => overlaps(toBounds({ position, width, height }), bounds, gap));
    while (collisions.length) {
      position = { ...position, y: Math.max(...collisions.map((bounds) => bounds.bottom)) + gap };
      collisions = occupied.filter((bounds) => overlaps(toBounds({ position, width, height }), bounds, gap));
    }
    occupied.push(toBounds({ position, width, height }));
    return { ...operation, node: { ...operation.node, position } };
  });
}

function isLeafWithBounds(node: PlacementNode): node is PlacementNode & { position: Position; width: number; height: number } {
  return node.type !== "group" && validPosition(node.position) && Boolean(positive(node.width)) && Boolean(positive(node.height));
}

function validPosition(value: unknown): value is Position {
  const position = value as Position | undefined;
  return Boolean(position && Number.isFinite(position.x) && Number.isFinite(position.y));
}

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function defaultSize(type: string) {
  if (type === "config") return { width: 360, height: 390 };
  if (type === "image") return { width: 360, height: 320 };
  if (type === "video") return { width: 400, height: 300 };
  if (type === "audio") return { width: 360, height: 180 };
  if (type === "music") return { width: 380, height: 220 };
  if (type === "comment") return { width: 280, height: 180 };
  if (type === "split") return { width: 340, height: 280 };
  return { width: 320, height: 240 };
}

function toBounds(node: Pick<PlacementNode, "position" | "width" | "height">) {
  const position = node.position!;
  return { left: position.x, top: position.y, right: position.x + Number(node.width), bottom: position.y + Number(node.height) };
}

function overlaps(left: ReturnType<typeof toBounds>, right: ReturnType<typeof toBounds>, gap: number) {
  return left.left < right.right + gap && left.right + gap > right.left && left.top < right.bottom + gap && left.bottom + gap > right.top;
}
