import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { buildNodeGenerationContext } from "./canvas-node-generation";

describe("canvas generation text references", () => {
    it("resolves a standalone node text reference to only its content", () => {
        const nodes: CanvasNodeData[] = [
            {
                id: "reference",
                type: CanvasNodeType.Text,
                title: "参考文本",
                position: { x: 0, y: 0 },
                width: 240,
                height: 160,
                metadata: { content: "量子世界早已存在，只等待我们理解。" },
            },
            {
                id: "audio",
                type: CanvasNodeType.Audio,
                title: "音频",
                position: { x: 320, y: 0 },
                width: 300,
                height: 180,
                metadata: { promptDraft: "文本1" },
            },
        ];
        const connections: CanvasConnection[] = [
            { id: "reference-audio", fromNodeId: "reference", toNodeId: "audio" },
        ];

        expect(buildNodeGenerationContext("audio", nodes, connections, "文本1").prompt).toBe(
            "量子世界早已存在，只等待我们理解。",
        );
    });

    it("does not append text content again when retrying a resolved standalone prompt", () => {
        const content = "量子世界早已存在，只等待我们理解。";
        const nodes: CanvasNodeData[] = [
            {
                id: "reference",
                type: CanvasNodeType.Text,
                title: "参考文本",
                position: { x: 0, y: 0 },
                width: 240,
                height: 160,
                metadata: { content },
            },
            {
                id: "audio",
                type: CanvasNodeType.Audio,
                title: "音频",
                position: { x: 320, y: 0 },
                width: 300,
                height: 180,
                metadata: { prompt: content },
            },
        ];
        const connections: CanvasConnection[] = [
            { id: "reference-audio", fromNodeId: "reference", toNodeId: "audio" },
        ];

        expect(buildNodeGenerationContext("audio", nodes, connections, content).prompt).toBe(content);
    });

    it("expands text references without adding internal labels", () => {
        const nodes: CanvasNodeData[] = [
            {
                id: "reference",
                type: CanvasNodeType.Text,
                title: "参考文本",
                position: { x: 0, y: 0 },
                width: 240,
                height: 160,
                metadata: { content: "欢迎来到 CrocoTV" },
            },
            {
                id: "generator",
                type: CanvasNodeType.Config,
                title: "多模态生成",
                position: { x: 320, y: 0 },
                width: 300,
                height: 220,
                metadata: { composerContent: "开场：@[node:reference]\n结尾：@[node:reference]" },
            },
        ];
        const connections: CanvasConnection[] = [
            { id: "reference-generator", fromNodeId: "reference", toNodeId: "generator" },
        ];

        expect(buildNodeGenerationContext("generator", nodes, connections, nodes[1].metadata?.composerContent || "").prompt).toBe(
            "开场：欢迎来到 CrocoTV\n结尾：欢迎来到 CrocoTV",
        );
    });
});
