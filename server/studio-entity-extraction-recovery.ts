const DEFAULT_REUSE_WINDOW_MS = 15 * 60_000;

type CanvasNodeLike = {
  id?: unknown;
  metadata?: Record<string, unknown>;
};

type StudioExecutionLike = {
  operation?: unknown;
  sourceNodeIds?: unknown;
  outputNodeIds?: unknown;
  createdAt?: unknown;
};

export type EntityExtractionPayload = {
  characters: unknown[];
  scenes: unknown[];
  props: unknown[];
  [key: string]: unknown;
};

export function parseStudioJson(text: string): Record<string, any> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return objectValue(JSON.parse(cleaned));
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return objectValue(JSON.parse(match[0])); }
      catch { /* fall through to the stable user-facing error */ }
    }
    throw new Error("模型返回的 Studio JSON 无法解析");
  }
}

/**
 * Recover a recently completed entity preview when the model finished but the
 * HTTP response was interrupted. Exact script matching prevents stale results
 * from being reused after the editor content changes.
 */
export function findReusableEntityExtraction(input: {
  text: string;
  nodes: CanvasNodeLike[];
  executions: StudioExecutionLike[];
  now?: number;
  reuseWindowMs?: number;
}): EntityExtractionPayload | undefined {
  const now = input.now ?? Date.now();
  const reuseWindowMs = input.reuseWindowMs ?? DEFAULT_REUSE_WINDOW_MS;
  const nodesById = new Map(input.nodes.map((node) => [String(node.id || ""), node]));

  for (const execution of [...input.executions].reverse()) {
    if (execution.operation !== "entity_extraction") continue;
    const createdAt = Date.parse(String(execution.createdAt || ""));
    if (!Number.isFinite(createdAt) || now - createdAt < 0 || now - createdAt > reuseWindowMs) continue;
    const sourceIds = stringArray(execution.sourceNodeIds);
    const outputIds = stringArray(execution.outputNodeIds);
    const source = sourceIds.map((id) => nodesById.get(id)).find(Boolean);
    const output = outputIds.map((id) => nodesById.get(id)).find((node) => node?.metadata?.status === "success");
    if (!source || !output) continue;

    try {
      const context = parseStudioJson(String(source.metadata?.content || ""));
      if (context.operation !== "entity_extraction" || context.draftPrompt !== input.text) continue;
      const parsed = parseStudioJson(String(output.metadata?.content || ""));
      if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.scenes) || !Array.isArray(parsed.props)) continue;
      return parsed as EntityExtractionPayload;
    } catch {
      continue;
    }
  }
  return undefined;
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}
