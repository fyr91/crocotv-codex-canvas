import { describe, expect, it } from "vitest";

import { buildNodeGenerationInputs } from "@/components/canvas/canvas-node-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { buildNodeMentionReferences } from "./canvas-resource-references";

const nodes: CanvasNodeData[] = [
    { id: "workflow", type: CanvasNodeType.WorkflowGroup, title: "分镜工作流", position: { x: 0, y: 0 }, width: 400, height: 300 },
    { id: "config", type: CanvasNodeType.Config, title: "生成视频", position: { x: 100, y: 100 }, width: 300, height: 220, metadata: { groupId: "workflow" } },
];
const connections: CanvasConnection[] = [{ id: "input-map", fromNodeId: "workflow", toNodeId: "config", fromPort: "workflow-input" }];

describe("workflow input prompt reference", () => {
    it("adds a virtual 工作组输入 candidate to mapped composer inputs", () => {
        expect(buildNodeGenerationInputs("config", nodes, connections, { includeWorkflowInput: true })).toEqual([
            { nodeId: "workflow", type: "text", title: "当前批次输入", label: "工作组输入" },
        ]);
        expect(buildNodeGenerationInputs("config", nodes, connections)).toEqual([]);
    });

    it("adds the same candidate to standalone media prompt editors", () => {
        expect(buildNodeMentionReferences(nodes[1], nodes, connections)).toEqual([
            { id: "workflow", nodeId: "workflow", kind: "text", label: "工作组输入", title: "当前批次输入", active: true },
        ]);
    });

    it("resolves a downstream workflow-output connection to the latest published result nodes", () => {
        const outputNodes: CanvasNodeData[] = [
            { ...nodes[0], metadata: { workflowRunId: "run-2" } },
            { id: "latest", type: CanvasNodeType.Image, title: "最终图片", position: { x: 500, y: 100 }, width: 200, height: 200, metadata: { content: "https://example.com/latest.png", workflowRunId: "run-2", workflowResultOf: "config" } },
            { id: "consumer", type: CanvasNodeType.Config, title: "下游", position: { x: 800, y: 100 }, width: 300, height: 220 },
        ];
        const outputConnections: CanvasConnection[] = [
            { id: "published", fromNodeId: "workflow", toNodeId: "latest", fromPort: "workflow-output" },
            { id: "downstream", fromNodeId: "workflow", toNodeId: "consumer", fromPort: "workflow-output" },
        ];

        expect(buildNodeGenerationInputs("consumer", outputNodes, outputConnections).map((input) => input.nodeId)).toEqual(["latest"]);
    });
});
