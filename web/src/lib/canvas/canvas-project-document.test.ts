import assert from "node:assert/strict";
import test from "node:test";

import { canvasProjectDocument } from "./canvas-project-document.ts";

test("does not persist pending upload nodes or their connections", () => {
    const document = canvasProjectDocument({
        nodes: [
            { id: "pending", metadata: { content: "blob:local", uploadTaskId: "upload-1" } },
            { id: "ready", metadata: { content: "https://signed", storageKey: "asset-1", commentBeautifying: true } },
        ],
        connections: [{ id: "connection-1", fromNodeId: "pending", toNodeId: "ready" }],
        chatSessions: [],
        activeChatId: null,
        showImageInfo: true,
        viewport: { x: 0, y: 0, k: 1 },
    });

    assert.deepEqual(document.nodes.map((node) => node.id), ["ready"]);
    assert.deepEqual(document.connections, []);
    assert.equal(document.nodes[0]?.metadata?.content, "");
    assert.equal(document.nodes[0]?.metadata?.commentBeautifying, undefined);
});

test("persists workflow groups, boundary ports, and published result identity", () => {
    const document = canvasProjectDocument({
        nodes: [
            { id: "workflow", type: "workflow-group", metadata: { workflowState: "success", workflowRunId: "run-1" } },
            { id: "step", type: "config", metadata: { groupId: "workflow" } },
            { id: "result", type: "image", metadata: { workflowRunId: "run-1", workflowResultOf: "step", workflowBatchIndex: 0, content: "https://result" } },
        ],
        connections: [
            { id: "input-map", fromNodeId: "workflow", toNodeId: "step", fromPort: "workflow-input" },
            { id: "output-map", fromNodeId: "step", toNodeId: "workflow", toPort: "workflow-output" },
            { id: "published-output", fromNodeId: "workflow", toNodeId: "result", fromPort: "workflow-output" },
        ],
        chatSessions: [],
        activeChatId: null,
        showImageInfo: true,
        viewport: { x: 0, y: 0, k: 1 },
    });

    assert.equal(document.nodes[0]?.type, "workflow-group");
    assert.equal(document.nodes[2]?.metadata?.workflowResultOf, "step");
    assert.equal(document.nodes[2]?.metadata?.workflowBatchIndex, 0);
    assert.equal(document.connections[0]?.fromPort, "workflow-input");
    assert.equal(document.connections[1]?.toPort, "workflow-output");
    assert.equal(document.connections[2]?.fromPort, "workflow-output");
});

test("persists completed reasoning metadata", () => {
    const document = canvasProjectDocument({
        nodes: [{ id: "text", metadata: { content: "结果", reasoningText: "分析过程", reasoningState: "complete" } }],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        showImageInfo: true,
        viewport: { x: 0, y: 0, k: 1 },
    });

    assert.equal(document.nodes[0]?.metadata?.reasoningText, "分析过程");
    assert.equal(document.nodes[0]?.metadata?.reasoningState, "complete");
});
