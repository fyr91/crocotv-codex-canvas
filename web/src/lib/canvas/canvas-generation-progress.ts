import type { CanvasNodeMetadata } from "@/types/canvas";

export type CanvasGenerationProgressDisplay = {
    label: string;
    progress?: number;
    showProgress: boolean;
};

const queuedStages = new Set(["submitted", "queued", "dispatching"]);
const savingStages = new Set(["completed", "saving", "persisting"]);

export function canvasGenerationProgressDisplay(metadata: CanvasNodeMetadata = {}): CanvasGenerationProgressDisplay {
    const stage = String(metadata.generationStage || "").trim().toLowerCase();
    const operationLabel = String(metadata.remoteOperationLabel || "").trim();
    const numericProgress = Number(metadata.generationProgress);
    const progress = metadata.generationProgress != null && Number.isFinite(numericProgress)
        ? Math.max(0, Math.min(100, Math.round(numericProgress)))
        : undefined;

    if (stage === "submitting") return { label: operationLabel || "正在提交", showProgress: false };
    if (queuedStages.has(stage) || metadata.generationState === "queued") {
        return { label: operationLabel || "排队或准备中", showProgress: false };
    }
    if (savingStages.has(stage) && metadata.generationState !== "ready") {
        return { label: operationLabel || "正在保存结果", progress, showProgress: progress != null };
    }

    const label = operationLabel || "生成中";
    return {
        label: progress == null ? label : `${label} · ${progress}%`,
        progress,
        showProgress: progress != null,
    };
}
