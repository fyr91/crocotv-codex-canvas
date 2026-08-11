import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function canvasNodePrompt(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return firstPromptValue(node.metadata?.content, node.metadata?.prompt);
    if (node.type === CanvasNodeType.Config) return node.metadata?.generationMode === "music" ? firstPromptValue(node.metadata.musicDescription, node.metadata.musicLyrics, node.metadata.prompt) : firstPromptValue(node.metadata?.composerContent, node.metadata?.prompt);
    if (node.type === CanvasNodeType.Split) return firstPromptValue(node.metadata?.composerContent, node.metadata?.prompt);
    if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio || node.type === CanvasNodeType.Music) return firstPromptValue(node.metadata?.prompt);
    return "";
}

function firstPromptValue(...values: Array<string | undefined>) {
    for (const value of values) {
        const prompt = value?.trim();
        if (prompt) return prompt;
    }
    return "";
}

export function promptTitle(prompt: string) {
    const firstLine = prompt.split("\n").find((line) => line.trim())?.trim().replace(/\s+/g, " ") || "未命名提示词";
    return firstLine.slice(0, 40);
}
