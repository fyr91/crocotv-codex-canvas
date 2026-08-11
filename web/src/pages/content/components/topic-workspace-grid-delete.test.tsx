// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentWorkflowProject } from "@/types/content-production";
import { TopicWorkspaceGrid } from "./topic-workspace-grid";

const { deleteProject, navigate } = vi.hoisted(() => ({
    deleteProject: vi.fn(),
    navigate: vi.fn(),
}));

const projects: ContentWorkflowProject[] = [
    {
        id: "topic-project",
        workflowType: "topic_content_v1",
        title: "选题项目",
        ownerId: "owner-1",
        topicId: "topic-1",
        topic: {
            id: "topic-1",
            workflowType: "social_media_video_v1",
            title: "选题项目",
            originalTopic: "原始选题内容",
            creationNotes: "",
            tags: [],
            sourceType: "member",
            sourceAssetId: null,
            sourceInspirationId: null,
            parentTopicId: null,
            createdBy: "owner-1",
            ownerId: "owner-1",
            currentAttemptId: "attempt-1",
            status: "in_progress",
            backgroundSnapshot: {},
            latestCompletionVersion: 0,
            hasPostCompletionChanges: false,
            completedAt: null,
            createdAt: "2026-07-30T00:00:00Z",
            updatedAt: "2026-07-30T01:00:00Z",
        },
        createdAt: "2026-07-30T00:00:00Z",
        updatedAt: "2026-07-30T01:00:00Z",
    },
    {
        id: "koubo-project",
        workflowType: "koubo-video",
        title: "口播项目",
        ownerId: "owner-1",
        topicId: null,
        createdAt: "2026-07-30T00:00:00Z",
        updatedAt: "2026-07-30T02:00:00Z",
    },
    {
        id: "course-project",
        workflowType: "course-video",
        title: "课程项目",
        ownerId: "owner-1",
        topicId: null,
        createdAt: "2026-08-04T00:00:00Z",
        updatedAt: "2026-08-04T01:00:00Z",
    },
];

vi.mock("react-router-dom", async (importOriginal) => ({
    ...await importOriginal<typeof import("react-router-dom")>(),
    useNavigate: () => navigate,
}));

vi.mock("@/stores/use-user-store", () => ({
    useUserStore: (selector: (state: { profile: { id: string } }) => unknown) => selector({ profile: { id: "owner-1" } }),
}));

vi.mock("@/stores/use-content-production-ui-store", () => ({
    useContentProductionUiStore: (selector: (state: { notificationMode: "mute"; setNotificationMode: () => void }) => unknown) =>
        selector({ notificationMode: "mute", setNotificationMode: vi.fn() }),
}));

vi.mock("../use-content-node-notice-tone", () => ({ useContentNodeNoticeTone: vi.fn() }));

vi.mock("../use-content-production", () => ({
    useContentWorkflowProjectsQuery: () => ({ data: projects, isLoading: false, isError: false, isFetched: true, refetch: vi.fn() }),
    useOwnerContentRunsQuery: () => ({ data: [], isLoading: false, isFetched: true }),
    useContentNoticeNodesQuery: () => ({ data: [], isLoading: false, isFetched: true }),
    useKouboNoticesQuery: () => ({ data: [], isLoading: false, isFetched: true }),
    useDeleteContentWorkflowProjectMutation: () => ({ mutateAsync: deleteProject, isPending: false }),
    useContentTopicsQuery: () => ({ data: [], isLoading: false }),
    useClaimContentTopicMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateContentTopicMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateContentWorkflowProjectMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/services/api/koubo-video", () => ({
    getKouboWorkspace: vi.fn().mockResolvedValue(null),
}));

globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

beforeEach(() => {
    deleteProject.mockReset().mockResolvedValue("koubo-video");
    navigate.mockReset();
});
afterEach(cleanup);

describe("TopicWorkspaceGrid project deletion", () => {
    it("opens course projects through the independent course route", () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <MemoryRouter>
                <QueryClientProvider client={client}>
                    <ConfigProvider theme={{ token: { motion: false } }}>
                        <App>
                            <TopicWorkspaceGrid />
                        </App>
                    </ConfigProvider>
                </QueryClientProvider>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole("button", { name: "打开 课程项目" }));
        expect(navigate).toHaveBeenCalledWith("/content/course-video/course-project");
    });

    it("uses the canvas-style card delete action without opening the project and confirms deletion once", async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <MemoryRouter>
                <QueryClientProvider client={client}>
                    <ConfigProvider theme={{ token: { motion: false } }}>
                        <App>
                            <TopicWorkspaceGrid />
                        </App>
                    </ConfigProvider>
                </QueryClientProvider>
            </MemoryRouter>,
        );

        const topicCard = screen.getByRole("button", { name: "打开 选题项目" }).closest("article")!;
        fireEvent.click(within(topicCard).getByRole("button", { name: "删除" }));
        expect(navigate).not.toHaveBeenCalled();

        let dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("删除项目？")).toBeTruthy();
        expect(within(dialog).getByText("Topic 会退回公共 Topic 池，当前 Attempt 会保留用于统计。")).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: /取\s*消/ }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        const kouboCard = screen.getByRole("button", { name: "打开 口播项目" }).closest("article")!;
        fireEvent.click(within(kouboCard).getByRole("button", { name: "删除" }));
        dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("项目内的文案、分段和生成记录也会一起移除。")).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: /删\s*除/ }));

        await waitFor(() => expect(deleteProject).toHaveBeenCalledWith("koubo-project"));
        expect(deleteProject).toHaveBeenCalledTimes(1);
        expect(navigate).not.toHaveBeenCalled();
    });
});
