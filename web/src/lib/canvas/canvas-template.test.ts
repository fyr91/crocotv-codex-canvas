import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { canvasTemplateProjectInput, templateNodeCounts } from "./canvas-template";
import type { CanvasTemplate } from "../../services/api/canvas-templates";
import { CanvasNodeType } from "../../types/canvas";

const template = {
    id: "template-1",
    sourceProjectId: "project-1",
    creatorId: "user-1",
    creatorName: "测试用户",
    title: "产品短片模板",
    description: "说明",
    status: "published" as const,
    document: {
        nodes: [
            { id: "image-1", type: CanvasNodeType.Image, title: "图片", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { storageKey: "asset-1", content: "" } },
            { id: "video-1", type: CanvasNodeType.Video, title: "视频", position: { x: 120, y: 0 }, width: 100, height: 100, metadata: { storageKey: "asset-2", content: "" } },
        ],
        connections: [{ id: "line-1", fromNodeId: "image-1", toNodeId: "video-1" }],
        chatSessions: [],
        activeChatId: null,
        showImageInfo: false,
        viewport: { x: 12, y: 24, k: 0.8 },
    },
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    publishedAt: "2026-07-17T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
} satisfies CanvasTemplate;

describe("canvasTemplateProjectInput", () => {
    it("keeps the snapshot graph and storage keys without leaking ownership", () => {
        const project = canvasTemplateProjectInput(template);

        expect(project.title).toBe("产品短片模板");
        expect(project.nodes?.[0].metadata?.storageKey).toBe("asset-1");
        expect(project.connections).toEqual(template.document.connections);
        expect(project.viewport).toEqual(template.document.viewport);
        expect(project).not.toHaveProperty("ownerId");
        expect(project).not.toHaveProperty("id");
    });
});

describe("templateNodeCounts", () => {
    it("counts snapshot nodes by type", () => {
        expect(templateNodeCounts(template.document.nodes)).toEqual({ total: 2, image: 1, video: 1 });
    });
});

describe("local canvas product scope", () => {
    it("does not reintroduce the removed template submission control", () => {
        const project = readFileSync(new URL("../../pages/canvas/project.tsx", import.meta.url), "utf8");

        expect(project).not.toContain("NATURAL_ICON_BUTTON_CLASS");
        expect(project).not.toMatch(/提交为模板|重新提交模板/);
    });
});

describe("template metadata management", () => {
    it("lets the admin edit only the template title and description", () => {
        const service = readFileSync(new URL("../../services/api/canvas-templates.ts", import.meta.url), "utf8");
        const page = readFileSync(new URL("../../pages/admin/templates/index.tsx", import.meta.url), "utf8");

        expect(service).toContain("export async function updateCanvasTemplateMetadata");
        expect(service).toContain('.update({ title: input.title.trim(), description: input.description.trim() })');
        expect(page).toContain('aria-label="编辑模板"');
        expect(page).toContain('title="编辑模板"');
    });
});
