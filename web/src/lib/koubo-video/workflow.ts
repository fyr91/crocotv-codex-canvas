import type { KouboItemStatus, KouboProjectStatus, KouboSegment, KouboWorkspace } from "@/types/koubo-video";

export function summarizeKouboGroup(items: Array<{ status: KouboItemStatus | Exclude<KouboItemStatus, "draft"> }>) {
    return {
        completed: items.filter((item) => item.status === "ready").length,
        total: items.length,
        running: items.filter((item) => item.status === "queued" || item.status === "running").length,
        failed: items.filter((item) => item.status === "failed").length,
    };
}

export function kouboVisibleStages(workspace: KouboWorkspace): Array<"start" | "script" | "audio" | "video"> {
    if (!workspace.segments.length) return ["start"];
    const audioEntry = workspace.segments.every((segment) => segment.voiceDirection === "原始音频");
    return audioEntry ? ["start", "audio"] : ["start", "script", "audio"];
}

export function segmentsNeedingTts(workspace: KouboWorkspace) {
    return workspace.segments.filter((segment) => !workspace.audioNodes.some((audio) =>
        audio.segmentId === segment.id
        && !audio.parentAudioNodeId
        && audio.sourceSegmentRevision === segment.revision
        && audio.status === "ready"
        && audio.assetId
        && audio.durationMs !== null
    ));
}

export function segmentsNeedingVideo(_workspace: KouboWorkspace) {
    return [];
}

export function deriveKouboStatus(workspace: KouboWorkspace): KouboProjectStatus {
    if (workspace.exportedAt) return "exported";
    const items = workspace.audioNodes;
    if (items.some((item) => item.status === "queued" || item.status === "running")) return "generating";
    if (items.some((item) => item.status === "failed")) return "partial_failure";
    if (!workspace.segments.length) return "draft";
    return segmentsNeedingTts(workspace).length ? "preparing_assets" : "adjusting_segments";
}

export function kouboRefetchInterval(workspace?: KouboWorkspace | null) {
    if (!workspace) return 15_000;
    const pending = [...workspace.audioNodes, ...workspace.imageResults, ...workspace.videoCandidates, ...workspace.compositions]
        .some((item) => item.status === "queued" || item.status === "running");
    return pending ? 3_000 : 15_000;
}

export function sortedSegments(segments: KouboSegment[]) {
    return [...segments].sort((a, b) => a.position - b.position);
}
