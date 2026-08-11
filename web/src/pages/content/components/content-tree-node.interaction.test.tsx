// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { useRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CrocoCanvas } from "@/components/canvas/crocotv-canvas";
import type { ContentNode } from "@/types/content-production";
import { ContentTreeNode } from "./content-tree-node";

const roleImageNode: ContentNode = {
    id: "role-image-1",
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: null,
    nodeType: "image",
    title: "角色口播图 1",
    summary: "",
    sortOrder: 1,
    status: "succeeded",
    revision: 1,
    createdBy: "user-1",
    hiddenAt: null,
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
    data: { roleImage: true, url: "/role.png" },
};

beforeAll(() => {
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
    HTMLElement.prototype.setPointerCapture = vi.fn();
});

afterEach(cleanup);

function RoleImageCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ x: 0, y: 0, k: 1 });
    return (
        <ConfigProvider theme={{ token: { motion: false } }}>
            <CrocoCanvas containerRef={containerRef} viewport={viewport} onViewportChange={setViewport}>
                <ContentTreeNode node={roleImageNode} x={0} y={0} selected={false} onSelect={() => undefined} />
            </CrocoCanvas>
        </ConfigProvider>
    );
}

describe("ContentTreeNode role image preview", () => {
    it("keeps the large preview at its intrinsic aspect ratio", async () => {
        render(<RoleImageCanvas />);
        fireEvent.click(screen.getByRole("button", { name: "查看角色口播图大图" }));

        const image = await screen.findByAltText("角色口播图大图预览");
        expect(image.className).toContain("h-auto");
        expect(image.className).toContain("max-w-full");
        expect(image.classList.contains("w-full")).toBe(false);
    });

    it.each([
        ["关闭按钮", () => screen.getByRole("button", { name: "Close" })],
        ["遮罩区域", () => document.querySelector<HTMLElement>(".ant-modal-wrap")!],
    ])("allows closing from the %s", async (_label, target) => {
        render(<RoleImageCanvas />);
        fireEvent.click(screen.getByRole("button", { name: "查看角色口播图大图" }));
        await screen.findByRole("dialog", { name: "角色口播图" });

        const dismissalTarget = target();
        expect(fireEvent.pointerDown(dismissalTarget)).toBe(true);
        fireEvent.mouseDown(dismissalTarget);
        fireEvent.mouseUp(dismissalTarget);
        fireEvent.click(dismissalTarget);

        await waitFor(() => expect(screen.queryByRole("dialog", { name: "角色口播图" })).toBeNull());
    });
});

describe("ContentTreeNode video player", () => {
    it("keeps player clicks inside the video instead of activating the parent node", () => {
        const onSelect = vi.fn();
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <ContentTreeNode
                    node={{
                        ...roleImageNode,
                        id: "video-1",
                        nodeType: "video",
                        title: "口播视频 1",
                        data: { url: "/talking-head.mp4" },
                    }}
                    x={0}
                    y={0}
                    selected={false}
                    onSelect={onSelect}
                />
            </ConfigProvider>,
        );

        const player = screen.getByLabelText("播放 口播视频 1");
        fireEvent.pointerDown(player);
        fireEvent.click(player);

        expect(onSelect).not.toHaveBeenCalled();
    });

    it("runs the video footer actions without activating the parent node", () => {
        const onSelect = vi.fn();
        const onDownload = vi.fn();
        const onRegenerate = vi.fn();
        render(
            <ConfigProvider theme={{ token: { motion: false } }}>
                <ContentTreeNode
                    node={{
                        ...roleImageNode,
                        id: "video-actions",
                        nodeType: "video",
                        title: "口播视频 1",
                        data: { url: "/talking-head.mp4" },
                    }}
                    x={0}
                    y={0}
                    selected={false}
                    onSelect={onSelect}
                    downloadTitle="下载口播视频"
                    onDownload={onDownload}
                    regenerateTitle="重新生成口播视频"
                    onRegenerate={onRegenerate}
                />
            </ConfigProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "下载口播视频" }));
        fireEvent.click(screen.getByRole("button", { name: "重新生成口播视频" }));

        expect(onDownload).toHaveBeenCalledOnce();
        expect(onRegenerate).toHaveBeenCalledOnce();
        expect(onSelect).not.toHaveBeenCalled();
    });
});
