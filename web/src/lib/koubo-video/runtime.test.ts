import { beforeEach, describe, expect, it } from "vitest";

import { useConfigStore } from "@/stores/use-config-store";
import { expressiveSpeechModels, isLtx23VideoModel, kouboImageModels } from "./runtime";

describe("koubo runtime selection", () => {
    beforeEach(() => useConfigStore.getState().setProviderCatalog([
        { id: "speech-expressive", provider_id: "doubao_speech", capability: "speech", model_key: "seed-tts-2.0-expressive", display_name: "Expressive 2.0", config: {}, is_default: true },
        { id: "speech-other", provider_id: "doubao_speech", capability: "speech", model_key: "seed-tts-1.0", display_name: "旧版 TTS", config: {}, is_default: false },
        { id: "ltx23", provider_id: "ltx", capability: "video", model_key: "ltx-2.3-distilled", display_name: "LTX-2.3", config: {}, is_default: true },
        { id: "video-other", provider_id: "ark", capability: "video", model_key: "seedance", display_name: "Seedance", config: {}, is_default: false },
        { id: "nano-banana-lite", provider_id: "runware", capability: "image", model_key: "google:nano-banana@2-lite", display_name: "Nano Banana 2 Lite", config: {}, is_default: false },
        { id: "seedream5", provider_id: "ark", capability: "image", model_key: "doubao-seedream-5-0-260128", display_name: "Seedream 5.0 Light", config: {}, is_default: true },
        { id: "image-other", provider_id: "ark", capability: "image", model_key: "doubao-seedream-4-5-251128", display_name: "Seedream 4.5", config: {}, is_default: false },
    ]));

    it("only exposes the existing Expressive 2.0 speech model", () => {
        expect(expressiveSpeechModels(useConfigStore.getState().config).map((item) => item.label)).toEqual(["Expressive 2.0"]);
    });

    it("rejects a non-LTX-2.3 video selection", () => {
        const { videoModels } = useConfigStore.getState().config;
        expect(videoModels.map(isLtx23VideoModel)).toEqual([true, false]);
    });

    it("defaults role images to Nano Banana 2 Lite and keeps Seedream selectable", () => {
        expect(kouboImageModels(useConfigStore.getState().config).map((item) => item.label)).toEqual([
            "Nano Banana 2 Lite",
            "Seedream 5.0 Light",
        ]);
    });
});
