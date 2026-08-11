// @vitest-environment jsdom

import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManagedCanvasVideo } from "./managed-canvas-video";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("ManagedCanvasVideo", () => {
    it("restores its source after Strict Mode cleanup and releases it on unmount", () => {
        const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
        const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
        const { container, rerender, unmount } = render(
            <StrictMode>
                <ManagedCanvasVideo src="/files/first.mp4" />
            </StrictMode>,
        );
        const video = container.querySelector("video");
        expect(video).not.toBeNull();
        expect(video?.getAttribute("src")).toBe("/files/first.mp4");

        rerender(
            <StrictMode>
                <ManagedCanvasVideo src="/files/second.mp4" />
            </StrictMode>,
        );
        expect(video?.getAttribute("src")).toBe("/files/second.mp4");

        unmount();
        expect(video?.getAttribute("src")).toBeNull();
        expect(pause).toHaveBeenCalled();
        expect(load).toHaveBeenCalled();
    });
});
