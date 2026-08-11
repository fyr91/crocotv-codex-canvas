import type { VideoInputMode } from "@/lib/video-input-mode";
import type { CanvasNodeMetadata } from "@/types/canvas";

type VideoSelectionMetadata = Pick<CanvasNodeMetadata, "videoFirstFrameNodeId" | "videoEditSourceNodeId">;
type VideoSelectionInput = { nodeId: string; type: "text" | "image" | "video" | "audio" };

export function resolveHappyHorseVideoSelection(mode: VideoInputMode, metadata: VideoSelectionMetadata, inputs: VideoSelectionInput[], inlineImageNodeIds: string[] = []) {
    const typeById = new Map(inputs.map((item) => [item.nodeId, item.type]));
    if (mode === "firstFrame") {
        const imageNodeId = metadata.videoFirstFrameNodeId;
        return imageNodeId && typeById.get(imageNodeId) === "image" ? { imageNodeIds: [imageNodeId] } : { error: "请选择一张首帧图片" };
    }
    if (mode === "referenceImages") {
        const imageNodeIds = validImageIds(inlineImageNodeIds, typeById);
        return imageNodeIds.length >= 1 && imageNodeIds.length <= 9 ? { imageNodeIds } : { error: "参考图生视频需要在提示词中引用 1 至 9 张图片" };
    }
    if (mode === "videoEdit") {
        const videoNodeId = metadata.videoEditSourceNodeId;
        if (!videoNodeId || typeById.get(videoNodeId) !== "video") return { error: "请选择一条待编辑视频" };
        const imageNodeIds = validImageIds(inlineImageNodeIds, typeById);
        return imageNodeIds.length <= 5 ? { videoNodeId, imageNodeIds } : { error: "视频编辑最多支持 5 张参考图片" };
    }
    return { imageNodeIds: [] as string[] };
}

function validImageIds(nodeIds: string[] | undefined, typeById: Map<string, VideoSelectionInput["type"]>) {
    return Array.from(new Set(nodeIds || [])).filter((nodeId) => typeById.get(nodeId) === "image");
}
