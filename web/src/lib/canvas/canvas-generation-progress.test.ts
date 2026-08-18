import { describe, expect, it } from "vitest";

import { canvasGenerationProgressDisplay } from "./canvas-generation-progress";

describe("canvasGenerationProgressDisplay", () => {
    it("shows the real submit and queue stages without a fake percentage", () => {
        expect(canvasGenerationProgressDisplay({ generationState: "queued", generationStage: "submitting", remoteOperationLabel: "MiniMax H3 正在提交", generationProgress: 0 })).toEqual({
            label: "MiniMax H3 正在提交",
            showProgress: false,
        });
        expect(canvasGenerationProgressDisplay({ generationState: "queued", generationStage: "queued", remoteOperationLabel: "MiniMax H3 排队或准备中", generationProgress: 0 })).toEqual({
            label: "MiniMax H3 排队或准备中",
            showProgress: false,
        });
    });

    it("shows actual running progress and the saving stage", () => {
        expect(canvasGenerationProgressDisplay({ generationState: "running", generationStage: "running", remoteOperationLabel: "MiniMax H3 生成中", generationProgress: 24 })).toEqual({
            label: "MiniMax H3 生成中 · 24%",
            progress: 24,
            showProgress: true,
        });
        expect(canvasGenerationProgressDisplay({ generationState: "running", generationStage: "completed", remoteOperationLabel: "MiniMax H3 正在保存结果", generationProgress: 100 })).toEqual({
            label: "MiniMax H3 正在保存结果",
            progress: 100,
            showProgress: true,
        });
    });
});
