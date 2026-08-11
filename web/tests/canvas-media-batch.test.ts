import assert from "node:assert/strict";
import { it } from "vitest";

import * as mediaBatch from "../src/lib/canvas/canvas-media-batch.ts";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../src/types/canvas.ts";

const { horizontalBatchResultPosition, isMediaBatchRoot, mediaBatchChildPosition, mediaBatchKind, videoBatchOutputIndex } = mediaBatch;

function node(type: CanvasNodeType, metadata: CanvasNodeMetadata): CanvasNodeData {
    return { id: "node", type, title: "node", position: { x: 0, y: 0 }, width: 100, height: 100, metadata };
}

it("batch children expand in one horizontal row", () => {
    const root = { ...node(CanvasNodeType.Video, { isBatchRoot: true }), position: { x: 100, y: 200 }, width: 320 };

    assert.deepEqual(
        [0, 1, 2].map((index) => mediaBatchChildPosition(root, index, 320)),
        [
            { x: 540, y: 200 },
            { x: 896, y: 200 },
            { x: 1252, y: 200 },
        ],
    );
});

it("shares horizontal batch positioning with every generated result type", () => {
    const source = { position: { x: 100, y: 200 }, width: 400 };

    assert.deepEqual(
        [0, 1, 2].map((index) => horizontalBatchResultPosition(source, index, 240, { y: 260 })),
        [
            { x: 596, y: 260 },
            { x: 872, y: 260 },
            { x: 1148, y: 260 },
        ],
    );
});

it("image and video roots share media batch semantics", () => {
    assert.equal(isMediaBatchRoot(node(CanvasNodeType.Image, { isBatchRoot: true, batchChildIds: ["a", "b"] })), true);
    assert.equal(isMediaBatchRoot(node(CanvasNodeType.Video, { isBatchRoot: true, batchChildIds: ["a", "b"] })), true);
    assert.equal(mediaBatchKind(node(CanvasNodeType.Video, { isBatchRoot: true })), "video");
});

it("non-media nodes cannot become stack roots", () => {
    assert.equal(isMediaBatchRoot(node(CanvasNodeType.Text, { isBatchRoot: true, batchChildIds: ["a", "b"] })), false);
});

it("legacy video batch nodes recover their output index from the stack", () => {
    const root = { ...node(CanvasNodeType.Video, { isBatchRoot: true, batchChildIds: ["a", "b"] }), id: "root" };
    const first = { ...node(CanvasNodeType.Video, { batchRootId: "root" }), id: "a" };
    const second = { ...node(CanvasNodeType.Video, { batchRootId: "root" }), id: "b" };
    assert.equal(videoBatchOutputIndex(root, [root, first, second]), 0);
    assert.equal(videoBatchOutputIndex(first, [root, first, second]), 0);
    assert.equal(videoBatchOutputIndex(second, [root, first, second]), 1);
    assert.equal(videoBatchOutputIndex({ ...second, metadata: { ...second.metadata, videoOutputIndex: 3 } }, [root, first, second]), 3);
});

it("deleting the last queued LTX node cancels its job without canceling a shared surviving batch", () => {
    const collect = (mediaBatch as unknown as {
        cancelableQueuedLtxJobIds: (
            nodes: CanvasNodeData[],
            deletedIds: Set<string>,
            isLtxModel: (model: string) => boolean,
        ) => string[];
    }).cancelableQueuedLtxJobIds;
    const nodes = [
        { ...node(CanvasNodeType.Video, { model: "ltx-model", generationJobId: "single", generationState: "queued" }), id: "single-node" },
        { ...node(CanvasNodeType.Video, { model: "ltx-model", generationJobId: "shared", generationState: "queued" }), id: "shared-a" },
        { ...node(CanvasNodeType.Video, { model: "ltx-model", generationJobId: "shared", generationState: "queued" }), id: "shared-b" },
        { ...node(CanvasNodeType.Video, { model: "ltx-model", generationJobId: "running", generationState: "running" }), id: "running-node" },
    ];

    const actual = collect
        ? collect(nodes, new Set(["single-node", "shared-a", "running-node"]), (model) => model === "ltx-model")
        : [];

    assert.deepEqual(actual, ["single"]);
});
