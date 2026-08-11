import { describe, expect, it } from "vitest";

import { resolveHappyHorseVideoSelection } from "./happyhorse-video-input";

const connected = [
    { nodeId: "image-1", type: "image" as const },
    { nodeId: "image-2", type: "image" as const },
    { nodeId: "video-1", type: "video" as const },
    { nodeId: "video-2", type: "video" as const },
    { nodeId: "audio-1", type: "audio" as const },
];

describe("resolveHappyHorseVideoSelection", () => {
    it("never infers an edit source from connected videos", () => {
        expect(resolveHappyHorseVideoSelection("videoEdit", {}, connected)).toEqual({ error: "请选择一条待编辑视频" });
    });

    it("uses the explicitly selected edit video and ordered images", () => {
        expect(resolveHappyHorseVideoSelection("videoEdit", {
            videoEditSourceNodeId: "video-2",
        }, connected, ["image-2", "image-1"])).toEqual({ videoNodeId: "video-2", imageNodeIds: ["image-2", "image-1"] });
    });

    it("rejects more than five edit reference images", () => {
        const inputs = [
            { nodeId: "video-1", type: "video" as const },
            ...Array.from({ length: 6 }, (_, index) => ({ nodeId: `image-${index}`, type: "image" as const })),
        ];
        expect(resolveHappyHorseVideoSelection("videoEdit", {
            videoEditSourceNodeId: "video-1",
        }, inputs, inputs.slice(1).map((item) => item.nodeId))).toEqual({ error: "视频编辑最多支持 5 张参考图片" });
    });

    it("requires one to nine reference images", () => {
        expect(resolveHappyHorseVideoSelection("referenceImages", {}, connected, [])).toEqual({ error: "参考图生视频需要在提示词中引用 1 至 9 张图片" });
        expect(resolveHappyHorseVideoSelection("referenceImages", {}, connected, ["image-2", "image-1"])).toEqual({ imageNodeIds: ["image-2", "image-1"] });
    });

    it("accepts exactly one explicit first frame", () => {
        expect(resolveHappyHorseVideoSelection("firstFrame", { videoFirstFrameNodeId: "image-1" }, connected)).toEqual({ imageNodeIds: ["image-1"] });
    });
});
