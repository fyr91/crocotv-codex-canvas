import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TopicStatusModule } from "./topic-status-module";
import type { ContentTopic } from "@/types/content-production";

const topic: ContentTopic = {
    id: "topic-1",
    workflowType: "social_media_video_v1",
    title: "孩子拖延怎么办",
    originalTopic: "帮助家长理解孩子拖延",
    creationNotes: "",
    tags: ["育儿", "亲子"],
    sourceType: "member",
    sourceAssetId: null,
    sourceInspirationId: null,
    parentTopicId: null,
    createdBy: "user-1",
    ownerId: "user-1",
    currentAttemptId: "attempt-1",
    status: "in_progress",
    backgroundSnapshot: {},
    latestCompletionVersion: 0,
    hasPostCompletionChanges: false,
    completedAt: null,
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
};

describe("TopicStatusModule", () => {
    it("opens from one compact semantic card action", () => {
        const html = renderToStaticMarkup(
            <TopicStatusModule
                topic={topic}
                summary={{ running: 2, unread: 3, attention: 0, failures: 0, latestMessage: "分镜图已生成", latestAt: "2026-07-24T01:00:00Z" }}
                onOpen={vi.fn()}
                onDelete={vi.fn()}
            />,
        );
        expect(html).toContain("孩子拖延怎么办");
        expect(html).not.toContain("有新结果");
        expect(html).not.toContain("lucide-sparkles");
        expect(html).toMatch(/^<article/);
        expect(html).toContain('aria-label="删除"');
        expect(html).toContain("cursor-pointer");
        expect(html).not.toContain(">打开<");
        expect(html).toContain("07-24");
        expect(html).not.toMatch(/编辑|重新生成|模型切换|Clip 勾选|完成 Topic|放弃 Topic/);
    });

    it("keeps the timestamp and canvas-style delete action together inside the card footer", () => {
        const html = renderToStaticMarkup(
            <TopicStatusModule
                topic={topic}
                summary={{ running: 0, unread: 0, attention: 0, failures: 0, latestMessage: "", latestAt: null }}
                onOpen={vi.fn()}
                onDelete={vi.fn()}
            />,
        );
        const footer = html.match(/<footer[^>]*>(.*?)<\/footer>/s)?.[1];

        expect(footer).toContain("07-24");
        expect(footer).toContain('aria-label="删除"');
        expect(footer).not.toContain("lucide-ellipsis");
        expect(html).not.toContain("absolute bottom-2");
    });

    it("uses stable responsive grid columns without stretching a single card", () => {
        const source = readFileSync(new URL("./topic-workspace-grid.tsx", import.meta.url), "utf8");
        expect(source).toContain("grid-cols-1");
        expect(source).toContain("sm:grid-cols-2");
        expect(source).toContain("lg:grid-cols-3");
        expect(source).toContain("xl:grid-cols-4");
        expect(source).not.toContain("auto-fit");
    });

    it("gives project and add-project cards the same visible hover feedback", () => {
        const html = renderToStaticMarkup(
            <TopicStatusModule
                topic={topic}
                summary={{ running: 0, unread: 0, attention: 0, failures: 0, latestMessage: "", latestAt: null }}
                onOpen={vi.fn()}
                onDelete={vi.fn()}
            />,
        );
        const source = readFileSync(new URL("./topic-workspace-grid.tsx", import.meta.url), "utf8");

        expect(html).toContain("hover:border-[var(--border-strong)]");
        expect(html).toContain("hover:shadow-[var(--elevation-card-hover)]");
        expect(source).toContain("cursor-pointer");
        expect(source).toContain("hover:border-[var(--border-strong)]");
        expect(source).toContain("hover:shadow-[var(--elevation-card-hover)]");
    });
});
