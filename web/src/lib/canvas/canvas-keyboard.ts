type CanvasKeyboardTarget = EventTarget & Pick<Element, "closest" | "matches">;

export function shouldIgnoreCanvasKeyboardShortcut(target: EventTarget | null, key: string) {
    if (!isCanvasKeyboardTarget(target)) return false;
    if (target.matches("input, textarea, select") || target.closest("[contenteditable='true']")) return true;
    if (!target.closest("[data-canvas-no-zoom]")) return false;
    return !((key === "Delete" || key === "Backspace") && target.closest("video, audio"));
}

function isCanvasKeyboardTarget(target: EventTarget | null): target is CanvasKeyboardTarget {
    return Boolean(target && "matches" in target && "closest" in target);
}
