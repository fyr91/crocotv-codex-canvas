export const DEFAULT_PROMPT_PANEL_WIDTH = 500;
export const MIN_PROMPT_PANEL_WIDTH = 420;
export const MAX_PROMPT_PANEL_WIDTH = 960;
export const MIN_PROMPT_PANEL_CONTENT_HEIGHT = 112;
export const MAX_PROMPT_PANEL_CONTENT_HEIGHT = 600;

export type PromptPanelResizeEdge = "left" | "right" | "bottom" | "bottom-left" | "bottom-right";
export type PromptPanelLayout = { width: number; contentHeight: number; offsetX: number };

export function resizePromptPanel(start: PromptPanelLayout, edge: PromptPanelResizeEdge, clientDx: number, clientDy: number, scale: number): PromptPanelLayout {
    const dx = clientDx / Math.max(scale, 0.01);
    const dy = clientDy / Math.max(scale, 0.01);
    const fromLeft = edge.includes("left");
    const changesWidth = edge !== "bottom";
    const width = changesWidth ? clamp(start.width + (fromLeft ? -dx : dx), MIN_PROMPT_PANEL_WIDTH, MAX_PROMPT_PANEL_WIDTH) : start.width;
    const contentHeight = edge.includes("bottom") ? clamp(start.contentHeight + dy, MIN_PROMPT_PANEL_CONTENT_HEIGHT, MAX_PROMPT_PANEL_CONTENT_HEIGHT) : start.contentHeight;
    const widthDelta = width - start.width;
    return { width, contentHeight, offsetX: changesWidth ? start.offsetX + (fromLeft ? -widthDelta / 2 : widthDelta / 2) : start.offsetX };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}
