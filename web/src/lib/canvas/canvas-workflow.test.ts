import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types/canvas";
import {
    attachWorkflowOutputResults,
    createWorkflowGroup,
    duplicateWorkflowGroup,
    expandWorkflowGroupBounds,
    workflowBatchInputs,
    workflowExecutableNodes,
    workflowInputGroupForNode,
    workflowOutputTemplateIds,
    workflowReadyNodeIds,
    workflowTemplateDependencies,
} from "./canvas-workflow";

const node = (id: string, type: CanvasNodeType, x: number, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x, y: 100 },
    width: 100,
    height: 80,
    metadata,
});

describe("createWorkflowGroup", () => {
    it("groups exactly the selected eligible nodes without changing any connection", () => {
        const nodes = [node("text", CanvasNodeType.Text, 100, { content: "固定文字" }), node("config", CanvasNodeType.Config, 260, { generationMode: "image" }), node("outside", CanvasNodeType.Image, 500, { content: "image" }), node("layout", CanvasNodeType.Group, 700)];
        const connections: CanvasConnection[] = [
            { id: "inside", fromNodeId: "text", toNodeId: "config" },
            { id: "cross", fromNodeId: "outside", toNodeId: "config" },
        ];

        const result = createWorkflowGroup(new Set(["text", "config", "layout"]), nodes, connections, () => "workflow");

        expect(result.connections).toEqual(connections);
        expect(result.nodes.find((item) => item.id === "text")?.metadata?.groupId).toBe("workflow");
        expect(result.nodes.find((item) => item.id === "config")?.metadata?.groupId).toBe("workflow");
        expect(result.nodes.find((item) => item.id === "outside")?.metadata?.groupId).toBeUndefined();
        expect(result.nodes.find((item) => item.id === "layout")?.metadata?.groupId).toBeUndefined();
        expect(result.nodes.find((item) => item.id === "workflow")?.type).toBe(CanvasNodeType.WorkflowGroup);
    });
});

describe("workflow scheduling", () => {
    const group = node("workflow", CanvasNodeType.WorkflowGroup, 0);
    const llm = node("llm", CanvasNodeType.Config, 100, { groupId: "workflow", generationMode: "text" });
    const seedText = node("seed-text", CanvasNodeType.Text, 220, { groupId: "workflow", content: "旧结果", workflowResultOf: "llm" });
    const image = node("image", CanvasNodeType.Config, 360, { groupId: "workflow", generationMode: "image" });
    const merge = node("merge", CanvasNodeType.Config, 520, { groupId: "workflow", generationMode: "video", composerContent: "@[node:seed-text] @[node:image-result]" });
    const imageResult = node("image-result", CanvasNodeType.Image, 460, { groupId: "workflow", content: "old-image", workflowResultOf: "image" });
    const nodes = [group, llm, seedText, image, imageResult, merge];
    const connections: CanvasConnection[] = [
        { id: "a", fromNodeId: "llm", toNodeId: "seed-text" },
        { id: "b", fromNodeId: "image", toNodeId: "image-result" },
        { id: "c", fromNodeId: "seed-text", toNodeId: "merge" },
        { id: "d", fromNodeId: "image-result", toNodeId: "merge" },
    ];

    it("runs independent roots together and waits until every referenced step completes", () => {
        const executable = workflowExecutableNodes("workflow", nodes, connections);
        const dependencies = new Map(executable.map((item) => [item.id, workflowTemplateDependencies(item, "workflow", nodes, connections)]));

        expect(workflowReadyNodeIds(executable, dependencies, new Map(), new Set())).toEqual(["llm", "image"]);
        expect(workflowReadyNodeIds(executable, dependencies, new Map([["llm", ["new-text"]]]), new Set(["llm", "image"]))).toEqual([]);
        expect(workflowReadyNodeIds(executable, dependencies, new Map([["llm", ["new-text"]], ["image", ["new-image"]]]), new Set(["llm", "image"]))).toEqual(["merge"]);
    });
});

describe("workflow inputs and duplication", () => {
    it("exposes the workflow input only to internal nodes with an explicit input mapping", () => {
        const nodes = [node("workflow", CanvasNodeType.WorkflowGroup, 0), node("mapped", CanvasNodeType.Config, 100, { groupId: "workflow" }), node("unmapped", CanvasNodeType.Config, 220, { groupId: "workflow" })];
        const connections: CanvasConnection[] = [{ id: "input-map", fromNodeId: "workflow", toNodeId: "mapped", fromPort: "workflow-input" }];

        expect(workflowInputGroupForNode("mapped", nodes, connections)?.id).toBe("workflow");
        expect(workflowInputGroupForNode("unmapped", nodes, connections)).toBeNull();
    });

    it("uses only explicit workflow-input edges as FIFO batch items", () => {
        const nodes = [node("workflow", CanvasNodeType.WorkflowGroup, 0), node("one", CanvasNodeType.Text, -300, { content: "1" }), node("two", CanvasNodeType.Text, -200, { content: "2" }), node("public", CanvasNodeType.Text, -100, { content: "public" }), node("step", CanvasNodeType.Config, 100, { groupId: "workflow" })];
        const connections: CanvasConnection[] = [
            { id: "public", fromNodeId: "public", toNodeId: "step" },
            { id: "one", fromNodeId: "one", toNodeId: "workflow", toPort: "workflow-input" },
            { id: "two", fromNodeId: "two", toNodeId: "workflow", toPort: "workflow-input" },
        ];

        expect(workflowBatchInputs("workflow", nodes, connections).map((item) => item.id)).toEqual(["one", "two"]);
    });

    it("copies the complete saved group graph and every external input but excludes runtime results", () => {
        const nodes = [node("workflow", CanvasNodeType.WorkflowGroup, 0, { workflowRunId: "run" }), node("step", CanvasNodeType.Config, 100, { groupId: "workflow" }), node("saved-result", CanvasNodeType.Image, 260, { groupId: "workflow", content: "saved-image", workflowResultOf: "step" }), node("runtime-result", CanvasNodeType.Text, 420, { groupId: "workflow", content: "runtime-text", reasoningText: "runtime-reasoning", reasoningState: "complete", workflowRunId: "run", workflowResultOf: "step" }), node("public", CanvasNodeType.Text, -100, { content: "fixed" }), node("batch", CanvasNodeType.Text, -220, { content: "batch" })];
        const connections: CanvasConnection[] = [
            { id: "public", fromNodeId: "public", toNodeId: "step" },
            { id: "batch", fromNodeId: "batch", toNodeId: "workflow", toPort: "workflow-input" },
            { id: "input-map", fromNodeId: "workflow", toNodeId: "step", fromPort: "workflow-input" },
            { id: "output-map", fromNodeId: "saved-result", toNodeId: "workflow", toPort: "workflow-output" },
            { id: "saved-result", fromNodeId: "step", toNodeId: "saved-result" },
            { id: "runtime-result", fromNodeId: "step", toNodeId: "runtime-result" },
        ];

        const copy = duplicateWorkflowGroup("workflow", nodes, connections, (() => { let index = 0; return () => `copy-${index++}`; })());

        expect(copy.nodes.some((item) => item.metadata?.workflowRunId)).toBe(false);
        expect(copy.nodes.some((item) => item.metadata?.content === "saved-image")).toBe(true);
        expect(copy.nodes.some((item) => item.metadata?.content === "runtime-text")).toBe(false);
        expect(copy.nodes.some((item) => item.metadata?.reasoningText === "runtime-reasoning")).toBe(false);
        expect(copy.connections).toHaveLength(5);
        expect(copy.connections.some((item) => item.fromNodeId === "batch" && item.toNodeId === copy.groupId && item.toPort === "workflow-input")).toBe(true);
        expect(copy.connections.some((item) => item.fromNodeId === "public" && item.toNodeId.startsWith("copy-"))).toBe(true);
        expect(copy.connections.some((item) => item.fromPort === "workflow-input")).toBe(true);
        expect(copy.connections.some((item) => item.toPort === "workflow-output")).toBe(true);
    });

    it("keeps template steps executable after a previous run", () => {
        const nodes = [node("workflow", CanvasNodeType.WorkflowGroup, 0, { workflowRunId: "old-run" }), node("step", CanvasNodeType.Config, 100, { groupId: "workflow", generationMode: "image", prompt: "一只猫" }), node("runtime-result", CanvasNodeType.Image, 260, { groupId: "workflow", content: "image", workflowRunId: "old-run", workflowResultOf: "step" })];

        expect(workflowExecutableNodes("workflow", nodes, [])).toEqual([nodes[1]]);
    });
});

describe("workflow outputs", () => {
    it("resolves output mappings through saved result nodes to their template steps", () => {
        const nodes = [node("workflow", CanvasNodeType.WorkflowGroup, 0), node("step", CanvasNodeType.Config, 100, { groupId: "workflow" }), node("saved", CanvasNodeType.Image, 240, { groupId: "workflow", workflowResultOf: "step", content: "image" })];
        const connections: CanvasConnection[] = [{ id: "output-map", fromNodeId: "saved", toNodeId: "workflow", toPort: "workflow-output" }];

        expect(workflowOutputTemplateIds("workflow", nodes, connections)).toEqual(["step"]);
    });

    it("publishes runtime final nodes from the workflow output instead of their internal producer", () => {
        const nodes = [
            { ...node("workflow", CanvasNodeType.WorkflowGroup, 0, { workflowRunId: "run" }), width: 400 },
            node("step", CanvasNodeType.Config, 100, { groupId: "workflow" }),
            node("result-a", CanvasNodeType.Image, 260, { groupId: "workflow", workflowRunId: "run", workflowResultOf: "step", workflowBatchIndex: 0, content: "a" }),
            node("result-b", CanvasNodeType.Image, 380, { groupId: "workflow", workflowRunId: "run", workflowResultOf: "step", workflowBatchIndex: 0, content: "b" }),
        ];
        const connections: CanvasConnection[] = [
            { id: "internal-a", fromNodeId: "step", toNodeId: "result-a" },
            { id: "internal-b", fromNodeId: "result-a", toNodeId: "result-b" },
        ];
        const result = attachWorkflowOutputResults("workflow", "run", ["result-a", "result-b"], nodes, connections, (() => { let index = 0; return () => `output-${index++}`; })());

        expect(result.nodes.filter((item) => item.id.startsWith("result-")).every((item) => item.metadata?.groupId === undefined)).toBe(true);
        expect(result.nodes.find((item) => item.id === "result-a")?.position.x).toBe(496);
        expect(result.nodes.find((item) => item.id === "result-b")?.position.x).toBe(616);
        expect(result.connections).toEqual([
            { id: "output-0", fromNodeId: "workflow", toNodeId: "result-a", fromPort: "workflow-output" },
            { id: "output-1", fromNodeId: "workflow", toNodeId: "result-b", fromPort: "workflow-output" },
        ]);
    });
});

describe("expandWorkflowGroupBounds", () => {
    it("only expands right and down", () => {
        const group = { ...node("workflow", CanvasNodeType.WorkflowGroup, 100), width: 300, height: 200, position: { x: 100, y: 100 } };
        const result = { ...node("result", CanvasNodeType.Image, 430), width: 160, height: 140, position: { x: 430, y: 260 } };

        expect(expandWorkflowGroupBounds(group, [result], 24)).toMatchObject({ position: { x: 100, y: 100 }, width: 514, height: 324 });
    });
});
