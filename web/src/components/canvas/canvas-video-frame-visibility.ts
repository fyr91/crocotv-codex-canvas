import type { VideoInputMode } from "@/lib/video-input-mode";

export function videoFrameFieldVisibility(mode: VideoInputMode, allowMultimodalFrames = false) {
    return {
        showFields: ["firstFrame", "firstLastFrame"].includes(mode) || (mode === "multimodal" && allowMultimodalFrames),
        // Multimodal enables a single reference/ingredients frame for LTX.
        // A second frame is valid only for the explicit first/last-frame workflow.
        showLastFrame: mode === "firstLastFrame",
    };
}
