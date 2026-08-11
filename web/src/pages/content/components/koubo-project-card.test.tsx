import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
    useQuery: () => ({
        data: {
            status: "draft",
            noticeUnread: false,
            latestMessage: null,
            exportedAt: null,
            segments: [],
            audioNodes: [],
            imageResults: [],
            videoCandidates: [],
            compositions: [],
        },
    }),
}));

import { KouboProjectCard } from "./koubo-project-card";

describe("KouboProjectCard", () => {
    it("matches the Topic card information hierarchy without a leading media icon", () => {
        const html = renderToStaticMarkup(
            <KouboProjectCard
                projectId="project-1"
                title="口播视频"
                updatedAt="2026-07-30T08:30:00Z"
                onOpen={() => undefined}
                onDelete={() => undefined}
            />,
        );

        expect(html).toContain("口播视频");
        expect(html).toContain("07-30 16:30");
        expect(html).toContain("items-start");
        expect(html.match(/<button type="button" class="([^"]+)"[^>]+aria-label="打开 口播视频"/)?.[1]).toContain("cursor-pointer");
        expect(html).not.toContain("lucide-mic");
        expect(html).not.toContain("草稿");
        expect(html).not.toContain("lucide-circle");
    });
});
