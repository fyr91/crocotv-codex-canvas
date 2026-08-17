import { describe, expect, it } from "vitest";

import { videoFrameFieldVisibility } from "./canvas-video-frame-visibility";

describe("videoFrameFieldVisibility", () => {
    it("LTX multimodal 只展示一张参考图，不展示尾帧", () => {
        expect(videoFrameFieldVisibility("multimodal", true)).toEqual({ showFields: true, showLastFrame: false });
    });

    it("显式首尾帧工作流才展示尾帧", () => {
        expect(videoFrameFieldVisibility("firstLastFrame")).toEqual({ showFields: true, showLastFrame: true });
        expect(videoFrameFieldVisibility("multimodal")).toEqual({ showFields: false, showLastFrame: false });
    });
});
