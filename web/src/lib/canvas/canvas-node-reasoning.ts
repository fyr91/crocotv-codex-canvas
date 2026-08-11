import type { CanvasNodeMetadata } from "@/types/canvas";

export function reasoningDisplayState(metadata: Pick<CanvasNodeMetadata, "status" | "reasoningState" | "reasoningText">) {
    if (metadata.status === "error") return { visible: false, running: false };
    const running = metadata.status === "loading" && metadata.reasoningState === "streaming";
    return { visible: running || metadata.reasoningState === "complete" && Boolean(metadata.reasoningText?.trim()), running };
}
