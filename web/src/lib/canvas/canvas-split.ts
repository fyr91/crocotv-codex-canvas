import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import type { NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { horizontalBatchResultPosition } from "./canvas-media-batch";

export type CanvasInputModality = "text" | "image" | "video" | "audio";
export type SplitCount = "auto" | number;

export const SPLIT_SYSTEM_PROMPT = `你是内容拆分助手。将用户提供的全部文本和媒体视为一个整体，优先遵循用户的拆分要求。Auto 时返回 2–24 个完整且有意义的部分；指定数量时必须精确返回指定数量。只返回 JSON 对象，不要输出解释、Markdown 或代码围栏。格式必须是 {"items":[{"content":"拆分后的文本"}]}。每项必须是非空、不重复且保留必要上下文的纯文本。`;

export function normalizeInputModalities(value: unknown): CanvasInputModality[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((item): item is CanvasInputModality => item === "text" || item === "image" || item === "video" || item === "audio")));
}

export function requiredInputModalities(inputs: NodeGenerationInput[]): CanvasInputModality[] {
    const kinds = new Set<CanvasInputModality>(["text"]);
    inputs.forEach((input) => kinds.add(input.type));
    return (["text", "image", "video", "audio"] as const).filter((kind) => kinds.has(kind));
}

export function buildSplitContext(inputs: NodeGenerationInput[], composerContent?: string) {
    const source = composerContent?.trim() || "请根据内容结构自动拆分。";
    const byId = new Map(inputs.map((input) => [input.nodeId, input]));
    const matches = Array.from(source.matchAll(/@\[node:([^\]]+)\]/g));
    const selectedInputs = matches.length
        ? matches.flatMap((match) => byId.get(match[1]) || []).filter((input, index, list) => list.findIndex((item) => item.nodeId === input.nodeId) === index)
        : inputs;
    const labels = new Map<string, string>();
    const counts: Record<CanvasInputModality, number> = { text: 0, image: 0, video: 0, audio: 0 };
    const labelFor = (input: NodeGenerationInput) => {
        const current = labels.get(input.nodeId);
        if (current) return current;
        const names = { text: "文本", image: "图片", video: "视频", audio: "音频" };
        const label = `${names[input.type]}${++counts[input.type]}`;
        labels.set(input.nodeId, label);
        return label;
    };
    selectedInputs.forEach(labelFor);
    const instruction = matches.length ? source.replace(/@\[node:([^\]]+)\]/g, (_, id: string) => byId.has(id) ? `【${labelFor(byId.get(id)!)}】` : "") : source;
    const blocks = selectedInputs.map((input) => input.type === "text" ? `【${labelFor(input)}】\n${input.text || ""}` : `【${labelFor(input)}】${input.title ? ` ${input.title}` : ""}`);
    return { prompt: `${instruction}\n\n${blocks.join("\n\n")}`.trim(), selectedInputs };
}

export function parseSplitResponse(value: string, count: SplitCount): string[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value.trim());
    } catch {
        throw new Error("模型返回的拆分结果不是有效 JSON。");
    }
    const items = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { items?: unknown }).items : undefined;
    if (!Array.isArray(items)) throw new Error("模型返回的拆分结果缺少 items 数组。");
    const contents = items.map((item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as { content?: unknown }).content === "string" ? (item as { content: string }).content.trim() : "");
    if (contents.some((content) => !content)) throw new Error("模型返回了空白或无效的拆分内容。");
    if (new Set(contents).size !== contents.length) throw new Error("模型返回了重复的拆分内容。");
    if (count === "auto" && (contents.length < 2 || contents.length > 24)) throw new Error("Auto 拆分必须返回 2–24 个结果。");
    if (count !== "auto" && contents.length !== count) throw new Error(`模型必须返回 ${count} 个拆分结果。`);
    return contents;
}

export function hasSplitOutputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return connections.some((connection) => connection.fromNodeId === nodeId && nodes.some((node) => node.id === connection.toNodeId && node.type === CanvasNodeType.Text));
}

export function createSplitOutputGraph(source: CanvasNodeData, contents: string[], createId: () => string, prompt?: string) {
    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
    const nodes = contents.map((content, index): CanvasNodeData => {
        return {
            id: createId(),
            type: CanvasNodeType.Text,
            title: `拆分结果 ${index + 1}`,
            position: horizontalBatchResultPosition(source, index, spec.width, { startGap: 80 }),
            width: spec.width,
            height: spec.height,
            metadata: { content, prompt, status: "success", fontSize: 14 },
        };
    });
    const connections: CanvasConnection[] = nodes.map((node) => ({ id: createId(), fromNodeId: source.id, toNodeId: node.id }));
    return { nodes, connections };
}
