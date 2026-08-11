import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { CanvasNode } from "./canvas-node";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

it("视频 stack 收起时整个子节点外壳同步退场", () => {
    const noop = vi.fn();
    const node: CanvasNodeData = {
        id: "video-child",
        type: CanvasNodeType.Video,
        title: "视频 1",
        position: { x: 640, y: 200 },
        width: 320,
        height: 180,
        metadata: { batchRootId: "video-root", content: "video.mp4", status: "success" },
    };
    const html = renderToStaticMarkup(
        <CanvasNode
            data={node}
            scale={1}
            isSelected={false}
            isRelated={false}
            isFocusRelated={false}
            isConnectionTarget={false}
            isConnecting={false}
            showPanel={false}
            showImageInfo={false}
            batchClosing
            batchMotion={{ x: -120, y: 0, index: 0 }}
            onMouseDown={noop}
            onHoverStart={noop}
            onHoverEnd={noop}
            onConnectStart={noop}
            onResize={noop}
            onPanelResize={noop}
            onContentChange={noop}
            onTitleChange={noop}
            onContextMenu={noop}
        />,
    );
    const outerShell = html.match(/^<div[^>]+>/)?.[0] || "";

    expect(outerShell).toContain("animation:canvas-batch-child-shell-out");
});
