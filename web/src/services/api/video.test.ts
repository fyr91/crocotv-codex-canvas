import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createGeneration: vi.fn() }));

vi.mock("./generation-client", () => ({
    createGeneration: mocks.createGeneration,
    getGenerationJob: vi.fn(),
    waitForGeneration: vi.fn(),
}));
vi.mock("@/services/file-storage", () => ({ uploadMediaFile: vi.fn() }));
vi.mock("@/services/image-storage", () => ({ uploadImage: vi.fn() }));
vi.mock("./ltx-delivery-client", () => ({
    requestLtxPreviewTicket: vi.fn(),
    watchArchivedVideoAssets: vi.fn(),
    watchLtxDelivery: vi.fn(),
}));
vi.mock("@/stores/use-config-store", () => ({
    modelConfigForModel: () => ({
        videoSettingsByInputMode: {
            text: {
                qualities: [{ id: "720P", label: "720P", ratios: [{ label: "16:9", ratio: "16:9", size: "16:9", recommended: true }] }],
                durations: [5],
                counts: [1],
                supports: {},
            },
        },
    }),
    providerIdForModel: () => "happyhorse",
}));

import { createVideoGenerationTask } from "./video";

describe("createVideoGenerationTask", () => {
    beforeEach(() => {
        mocks.createGeneration.mockReset();
        mocks.createGeneration.mockResolvedValue({ job: { id: "job-1", status: "queued" } });
    });

    it("forwards the caller request id to the persisted video generation job", async () => {
        const clientRequestId = "11111111-1111-4111-8111-111111111111";

        await createVideoGenerationTask({
            model: "happyhorse-model",
            videoModel: "happyhorse-model",
            videoInputMode: "text",
            vquality: "720P",
            size: "16:9",
            videoSeconds: "5",
            videoCount: "1",
            videoPromptEnhance: "false",
            videoGenerateAudio: "false",
            videoWatermark: "false",
            videoAudioSetting: "auto",
            videoReturnLastFrame: "false",
            videoStage1Review: "false",
        } as never, "课程视频提示词", [], [], [], { clientRequestId } as never);

        expect(mocks.createGeneration).toHaveBeenCalledWith(expect.objectContaining({
            capability: "video",
            clientRequestId,
        }));
    });
});
