import assert from "node:assert/strict";
import { test } from "vitest";

import { buildSplitContext, createSplitOutputGraph, hasSplitOutputs, parseSplitResponse, requiredInputModalities } from "../src/lib/canvas/canvas-split.ts";
import { CanvasNodeType } from "../src/types/canvas.ts";

const inputs = [
    { nodeId: "text", type: "text" as const, title: "文案", text: "第一段\n第二段" },
    { nodeId: "image", type: "image" as const, title: "截图", image: { id: "image", name: "image.png", type: "image/png", dataUrl: "blob:image", storageKey: "asset-image" } },
    { nodeId: "video", type: "video" as const, title: "视频", video: { id: "video", name: "video.mp4", type: "video/mp4", url: "blob:video", storageKey: "asset-video" } },
    { nodeId: "audio", type: "audio" as const, title: "配音", audio: { id: "audio", name: "audio.mp3", type: "audio/mpeg", url: "blob:audio", storageKey: "asset-audio" } },
];

test("split inputs require text plus every connected media modality", () => {
    assert.deepEqual(requiredInputModalities(inputs), ["text", "image", "video", "audio"]);
});

test("plain language keeps every input while mentions select and order inputs", () => {
    assert.deepEqual(buildSplitContext(inputs, "按场景拆分").selectedInputs.map((input) => input.nodeId), ["text", "image", "video", "audio"]);
    const selected = buildSplitContext(inputs, "先看 @[node:video] 再结合 @[node:text]");
    assert.deepEqual(selected.selectedInputs.map((input) => input.nodeId), ["video", "text"]);
    assert.match(selected.prompt, /【视频1】/);
    assert.match(selected.prompt, /【文本1】\n第一段/);
});

test("split response is strict about structure and requested count", () => {
    assert.deepEqual(parseSplitResponse('{"items":[{"content":" A "},{"content":"B"}]}', "auto"), ["A", "B"]);
    assert.throws(() => parseSplitResponse('{"items":[{"content":"A"}]}', "auto"), /2–24/);
    assert.equal(parseSplitResponse(JSON.stringify({ items: Array.from({ length: 24 }, (_, index) => ({ content: `结果 ${index + 1}` })) }), "auto").length, 24);
    assert.throws(() => parseSplitResponse(JSON.stringify({ items: Array.from({ length: 25 }, (_, index) => ({ content: `结果 ${index + 1}` })) }), "auto"), /2–24/);
    assert.throws(() => parseSplitResponse('{"items":[{"content":"A"},{"content":"B"}]}', 3), /3/);
    assert.throws(() => parseSplitResponse('{"items":[{"content":"A"},{"content":"A"}]}', "auto"), /重复/);
});

test("split outputs are text nodes arranged in one horizontal row", () => {
    let nextId = 0;
    const source = { id: "split", type: CanvasNodeType.Split, title: "拆分", position: { x: 10, y: 20 }, width: 420, height: 240, metadata: {} };
    const graph = createSplitOutputGraph(source, ["1", "2", "3", "4", "5"], () => `id-${++nextId}`);
    assert.equal(graph.nodes.length, 5);
    assert.ok(graph.nodes.every((node) => node.type === CanvasNodeType.Text));
    assert.equal(new Set(graph.nodes.map((node) => node.position.x)).size, graph.nodes.length);
    assert.equal(new Set(graph.nodes.map((node) => node.position.y)).size, 1);
    assert.ok(graph.connections.every((connection) => connection.fromNodeId === source.id));
    assert.equal(hasSplitOutputs(source.id, graph.nodes, graph.connections), true);
});
