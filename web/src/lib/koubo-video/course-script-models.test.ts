import { beforeEach, describe, expect, it } from "vitest";

import { useConfigStore } from "@/stores/use-config-store";
import { courseScriptModelOption, courseScriptModels } from "./course-script-models";

describe("course script model catalog", () => {
    beforeEach(() => useConfigStore.getState().setProviderCatalog([
        { id: "gemini-lite", provider_id: "gemini", capability: "llm", model_key: "gemini-3.5-flash-lite", display_name: "Gemini 3.5 Flash Lite", config: {}, is_default: false },
        { id: "gemini-flash", provider_id: "gemini", capability: "llm", model_key: "gemini-3.6-flash", display_name: "Gemini 3.6 Flash", config: {}, is_default: true },
        { id: "ark-flash", provider_id: "ark", capability: "llm", model_key: "deepseek-v4-flash-ga-260731", display_name: "DeepSeek V4 Flash GA", config: {}, is_default: false },
        { id: "ark-pro", provider_id: "ark", capability: "llm", model_key: "deepseek-v4-pro-260425", display_name: "DeepSeek V4 Pro", config: {}, is_default: false },
        { id: "ark-image", provider_id: "ark", capability: "image", model_key: "doubao-seedream-5-0-260128", display_name: "Seedream 5.0", config: {}, is_default: false },
        { id: "bigmodel", provider_id: "bigmodel", capability: "llm", model_key: "glm-5.2", display_name: "GLM 5.2", config: {}, is_default: false },
    ]));

    it("exposes only Gemini and Ark LLM options for course scripts", () => {
        expect(courseScriptModels(useConfigStore.getState().config)).toEqual([
            "gemini-lite::gemini-3.5-flash-lite",
            "gemini-flash::gemini-3.6-flash",
            "ark-flash::deepseek-v4-flash-ga-260731",
            "ark-pro::deepseek-v4-pro-260425",
        ]);
    });

    it("resolves a persisted provider model ID to the catalog option", () => {
        expect(courseScriptModelOption(useConfigStore.getState().config, "ark-pro"))
            .toBe("ark-pro::deepseek-v4-pro-260425");
        expect(courseScriptModelOption(useConfigStore.getState().config, "missing-model")).toBe("");
    });
});
