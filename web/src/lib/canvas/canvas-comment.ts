import type { CanvasCommentColor, CanvasConnection, CanvasNodeData, CanvasNodeType } from "@/types/canvas";
import { CanvasNodeType as NodeType } from "@/types/canvas";

export const CANVAS_COMMENT_COLORS: CanvasCommentColor[] = ["default", "yellow", "green", "blue", "purple", "pink"];

export const COMMENT_BEAUTIFY_SYSTEM_PROMPT = `你是 Markdown 内容编辑助手。请在保持原意、事实和信息完整的前提下，优化标题层级、段落、列表、引用、强调和表格，让内容更清晰、易读并适合在画布注释中展示。只返回完整的 Markdown 正文，不要解释，不要使用代码围栏，不要补造信息。`;

export function pickCommentModel(models: string[], configuredModel: string) {
    return models.find((model) => /(^|[^a-z0-9])glm[-_. ]?5\.2([^a-z0-9]|$)/i.test(model))
        || (models.includes(configuredModel) ? configuredModel : "")
        || models[0]
        || "";
}

export function canConnectCanvasNodes(sourceType: CanvasNodeType, targetType: CanvasNodeType) {
    return sourceType !== NodeType.Comment && targetType !== NodeType.Comment;
}

export function filterCanvasCommentConnections<Node extends Pick<CanvasNodeData, "id" | "type">, Connection extends Pick<CanvasConnection, "fromNodeId" | "toNodeId">>(nodes: Node[], connections: Connection[]) {
    const typeById = new Map(nodes.map((node) => [node.id, node.type]));
    return connections.filter((connection) => {
        const sourceType = typeById.get(connection.fromNodeId);
        const targetType = typeById.get(connection.toNodeId);
        return Boolean(sourceType && targetType && canConnectCanvasNodes(sourceType, targetType));
    });
}

export function commentColorSurface(color: CanvasCommentColor = "default", dark = false) {
    const palettes = dark
        ? { yellow: ["#3b3218", "#6b5b27"], green: ["#14532d", "#22c55e"], blue: ["#1d3044", "#35597b"], purple: ["#322744", "#5b4778"], pink: ["#402632", "#74465c"] }
        : { yellow: ["#fff3bf", "#ead58a"], green: ["#166534", "#22c55e"], blue: ["#dceefb", "#aacde5"], purple: ["#eee4f8", "#cbb6df"], pink: ["#f8e1eb", "#ddb6c7"] };
    if (color === "default") return null;
    const [background, border] = palettes[color];
    return { background, border };
}
