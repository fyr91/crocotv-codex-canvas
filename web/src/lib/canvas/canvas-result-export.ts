import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const exportableTypes = new Set<CanvasNodeType>([CanvasNodeType.Text, CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio, CanvasNodeType.Music]);

export function selectedCanvasResultNodes(nodes: CanvasNodeData[], selectedIds: ReadonlySet<string>) {
    return nodes.filter((node) => selectedIds.has(node.id) && exportableTypes.has(node.type) && Boolean(node.metadata?.content));
}

export function canvasResultFileName(node: CanvasNodeData) {
    return `${safeFileName(node.title || node.type)}.${canvasResultExtension(node)}`;
}

export async function exportCanvasResultNodes(nodes: CanvasNodeData[]) {
    if (!nodes.length) return 0;
    if (nodes.length === 1) {
        const node = nodes[0];
        const data = node.type === CanvasNodeType.Text ? await canvasResultBlob(node) : node.metadata!.content!;
        saveAs(data, canvasResultFileName(node));
        return 1;
    }

    const usedNames = new Set<string>();
    const files = await Promise.all(
        nodes.map(async (node) => ({
            name: uniqueFileName(canvasResultFileName(node), usedNames),
            data: await canvasResultBlob(node),
        })),
    );
    saveAs(await createZip(files), "CrocoTV-画布结果.zip");
    return nodes.length;
}

async function canvasResultBlob(node: CanvasNodeData) {
    const content = node.metadata?.content;
    if (!content) throw new Error(`结果「${node.title || node.id}」没有可导出内容`);
    if (node.type === CanvasNodeType.Text) return new Blob([content], { type: "text/plain;charset=utf-8" });

    const storageKey = node.metadata?.storageKey;
    const stored = storageKey ? await readStoredResult(node, storageKey) : null;
    if (stored) return stored;

    const response = await fetch(content);
    if (!response.ok) throw new Error(`无法读取结果「${node.title || node.id}」`);
    return response.blob();
}

async function readStoredResult(node: CanvasNodeData, storageKey: string) {
    if (node.type === CanvasNodeType.Image) {
        const { getImageBlob } = await import("@/services/image-storage");
        return getImageBlob(storageKey);
    }
    const { getMediaBlob } = await import("@/services/file-storage");
    return getMediaBlob(storageKey);
}

function canvasResultExtension(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return "txt";
    const mimeType = node.metadata?.mimeType || "";
    if (node.type === CanvasNodeType.Video) return mimeType.includes("webm") ? "webm" : mimeType.includes("quicktime") ? "mov" : "mp4";
    if (node.type === CanvasNodeType.Audio || node.type === CanvasNodeType.Music) {
        if (mimeType.includes("wav")) return "wav";
        if (mimeType.includes("opus")) return "opus";
        if (mimeType.includes("aac")) return "aac";
        if (mimeType.includes("flac")) return "flac";
        if (mimeType.includes("ogg")) return "ogg";
        if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
        return "mp3";
    }
    return mimeType.match(/^image[/]([a-z0-9.+-]+)/i)?.[1].replace("jpeg", "jpg").replace("svg+xml", "svg") || node.metadata?.content?.match(/^data:image[/]([^;]+)/)?.[1].replace("jpeg", "jpg") || "png";
}

function safeFileName(value: string) {
    return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").slice(0, 80) || "result";
}

function uniqueFileName(name: string, usedNames: Set<string>) {
    const extensionIndex = name.lastIndexOf(".");
    const base = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
    const extension = extensionIndex > 0 ? name.slice(extensionIndex) : "";
    let candidate = name;
    let index = 2;
    while (usedNames.has(candidate)) candidate = `${base}-${index++}${extension}`;
    usedNames.add(candidate);
    return candidate;
}
