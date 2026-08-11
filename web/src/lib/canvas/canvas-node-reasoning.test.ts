import { expect, test } from "vitest";

import { reasoningDisplayState } from "./canvas-node-reasoning.ts";

test("shows a running placeholder before the first reasoning fragment", () => {
    expect(reasoningDisplayState({ status: "loading", reasoningState: "streaming", reasoningText: "" })).toEqual({ visible: true, running: true });
});

test("shows completed reasoning and hides cleared states", () => {
    expect(reasoningDisplayState({ status: "success", reasoningState: "complete", reasoningText: "分析" })).toEqual({ visible: true, running: false });
    expect(reasoningDisplayState({ status: "error" })).toEqual({ visible: false, running: false });
    expect(reasoningDisplayState({ status: "success", reasoningText: "" })).toEqual({ visible: false, running: false });
});
