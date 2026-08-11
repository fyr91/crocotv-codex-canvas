// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddContentProjectModal } from "./add-content-project-modal";

vi.mock("../use-content-production", () => ({
    useContentTopicsQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
    useClaimContentTopicMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateContentTopicMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe("AddContentProjectModal", () => {
    it("opens course video through its independent workflow route", () => {
        const onOpened = vi.fn();
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <App>
                    <AddContentProjectModal open onClose={vi.fn()} onOpened={onOpened} />
                </App>
            </ConfigProvider>,
        );

        expect(screen.getByRole("button", { name: /课程视频/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: /口播视频/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: /基于 Topic 生成内容/ })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /课程视频/ }));
        expect(onOpened).toHaveBeenCalledWith(expect.stringMatching(/^\/content\/course-video\/[^?]+\?initialize=/));
    });
});
