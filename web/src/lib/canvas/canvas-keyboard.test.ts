import { describe, expect, it } from "vitest";

import { shouldIgnoreCanvasKeyboardShortcut } from "./canvas-keyboard";

describe("画布键盘快捷键目标判定", () => {
    it.each(["Delete", "Backspace"])("完成态媒体播放器获得焦点时不拦截 %s", (key) => {
        expect(shouldIgnoreCanvasKeyboardShortcut(elementTarget("VIDEO", { noZoom: true }), key)).toBe(false);
    });

    it("媒体播放器仍拦截播放相关按键", () => {
        expect(shouldIgnoreCanvasKeyboardShortcut(elementTarget("VIDEO", { noZoom: true }), "ArrowLeft")).toBe(true);
    });

    it.each(["INPUT", "TEXTAREA", "SELECT"])("%s 获得焦点时继续拦截删除键", (tagName) => {
        expect(shouldIgnoreCanvasKeyboardShortcut(elementTarget(tagName), "Delete")).toBe(true);
    });

    it("可编辑文本获得焦点时继续拦截删除键", () => {
        expect(shouldIgnoreCanvasKeyboardShortcut(elementTarget("DIV", { contentEditable: true }), "Backspace")).toBe(true);
    });
});

function elementTarget(tagName: string, options: { noZoom?: boolean; contentEditable?: boolean } = {}) {
    return {
        tagName,
        matches: (selector: string) => selector.split(",").some((item) => item.trim().toUpperCase() === tagName),
        closest: (selector: string) => {
            if (selector.includes("[data-canvas-no-zoom]") && options.noZoom) return {};
            if (selector.includes("[contenteditable='true']") && options.contentEditable) return {};
            if (selector.includes("video") && ["VIDEO", "AUDIO"].includes(tagName)) return {};
            return null;
        },
    } as unknown as EventTarget;
}
