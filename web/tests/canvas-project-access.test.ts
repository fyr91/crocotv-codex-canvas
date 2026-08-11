import assert from "node:assert/strict";

import { canvasSaveDiagnostic, classifyCanvasSaveError, cloneCanvasProject, isCanvasReadOnly, partitionCanvasProjects } from "../src/lib/canvas/canvas-project-access";
import { CanvasNodeType } from "../src/types/canvas";
import type { CanvasProject } from "../src/stores/canvas/use-canvas-store";

const base: CanvasProject = {
    id: "source",
    ownerId: "user-b",
    ownerName: "同事 B",
    ownerUsername: "user-b",
    title: "分镜画布",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    version: 4,
    nodes: [{ id: "image-1", type: CanvasNodeType.Image, title: "图片", position: { x: 0, y: 0 }, width: 320, height: 320, metadata: { storageKey: "asset-1" } }],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    backgroundMode: "lines",
    showImageInfo: true,
    viewport: { x: 10, y: 20, k: 0.8 },
};

const partition = partitionCanvasProjects([{ ...base, id: "mine", ownerId: "user-a" }, base], "user-a");
assert.deepEqual(partition.own.map((project) => project.id), ["mine"]);
assert.deepEqual(partition.shared.map((project) => project.id), ["source"]);
assert.equal(isCanvasReadOnly(base, "user-a"), true);
assert.equal(isCanvasReadOnly(base, "user-b"), false);

const copy = cloneCanvasProject(base, { id: "copy", ownerId: "user-a", ownerName: "同事 A", ownerUsername: "user-a", now: "2026-07-15T01:00:00.000Z" });
assert.equal(copy.title, "分镜画布 - 副本");
assert.equal(copy.ownerId, "user-a");
assert.equal(copy.version, 1);
assert.equal(copy.nodes[0].metadata?.storageKey, "asset-1");
copy.nodes[0].title = "已修改";
assert.equal(base.nodes[0].title, "图片");

assert.equal(classifyCanvasSaveError({ code: "42501", message: "permission denied" }), "blocked");
assert.equal(classifyCanvasSaveError({ code: "PGRST301", message: "JWT expired" }), "blocked");
assert.equal(classifyCanvasSaveError({ code: "503", message: "service unavailable" }), "retrying");
const diagnostic = canvasSaveDiagnostic("canvas-1", { code: "503", message: "service unavailable", details: "temporary", hint: "retry" }, "retrying");
assert.deepEqual({ projectId: diagnostic.projectId, status: diagnostic.status, code: diagnostic.code, message: diagnostic.message }, { projectId: "canvas-1", status: "retrying", code: "503", message: "service unavailable" });

console.log("canvas project access tests passed");
