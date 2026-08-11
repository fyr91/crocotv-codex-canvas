import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CanvasTemplate } from "@/services/api/canvas-templates";
import { CanvasTemplateCard } from "./canvas-template-card";

const template: CanvasTemplate = {
    id: "template-1",
    sourceProjectId: "project-1",
    creatorId: "owner-1",
    creatorName: "测试用户",
    title: "口播模板",
    description: "标准口播流程",
    document: {
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        showImageInfo: true,
        viewport: { x: 0, y: 0, k: 1 },
    },
    status: "published",
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    publishedAt: "2026-07-30T00:00:00Z",
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
};

describe("CanvasTemplateCard", () => {
    it("uses the same visible card hover elevation as project cards", () => {
        const html = renderToStaticMarkup(<CanvasTemplateCard template={template} onUse={vi.fn()} />);

        expect(html).toContain("cursor-pointer");
        expect(html).toContain("hover:border-[var(--border-strong)]");
        expect(html).toContain("hover:shadow-[var(--elevation-card-hover)]");
    });
});
