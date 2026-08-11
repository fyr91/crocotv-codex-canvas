import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContentNodePanel } from "./content-node-panel";
import type { ContentNode } from "@/types/content-production";

const node: ContentNode = {
    id: "script-1",
    topicId: "topic-1",
    attemptId: "attempt-1",
    parentId: "angle-1",
    nodeType: "script",
    title: "脚本",
    summary: "",
    sortOrder: 0,
    data: {},
    status: "idle",
    revision: 1,
    createdBy: "user-1",
    hiddenAt: null,
    createdAt: "2026-07-27T00:00:00Z",
    updatedAt: "2026-07-27T00:00:00Z",
};

describe("ContentNodePanel", () => {
    it("does not expose the undecided manual branch creation control", () => {
        const html = renderToStaticMarkup(
            <ContentNodePanel
                node={node}
                editable
                saving={false}
                onSave={async () => node}
                onGenerate={async () => undefined}
                references={null}
                modelOptions={[]}
            />,
        );

        expect(html).not.toContain("从当前节点建立探索分支");
        expect(html).not.toContain(">添加<");
    });

    it("shows the shared segmentation panel for ready TTS audio", () => {
        const html = renderToStaticMarkup(
            <ContentNodePanel
                node={{ ...node, nodeType: "tts", status: "succeeded", data: { url: "audio.wav", durationMs: 1200 } }}
                editable
                saving={false}
                onSave={async () => node}
                onGenerate={async () => undefined}
                onSegmentAudio={async () => undefined}
                references={null}
                modelOptions={[]}
            />,
        );

        expect(html).toContain("音频分段");
        expect(html).not.toContain("自动分段");
        expect(html).not.toContain("角色 Voice / Speaker ID");
    });
});
