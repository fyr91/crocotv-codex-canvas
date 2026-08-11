import type { CanvasConnection } from "@/types/canvas";
import type { KouboWorkspace } from "@/types/koubo-video";
import { sortedSegments } from "./workflow";

export function kouboCascadeSelectionIds(selectedNodeIds: ReadonlySet<string>, connections: readonly CanvasConnection[]) {
    const result = new Set(selectedNodeIds);
    const queue = [...selectedNodeIds];
    const outgoing = new Map<string, string[]>();
    for (const connection of connections) {
        const targets = outgoing.get(connection.fromNodeId) || [];
        targets.push(connection.toNodeId);
        outgoing.set(connection.fromNodeId, targets);
    }
    while (queue.length) {
        for (const targetId of outgoing.get(queue.shift()!) || []) {
            if (result.has(targetId)) continue;
            result.add(targetId);
            queue.push(targetId);
        }
    }
    return result;
}

export function kouboGroupSelectionIds(workspace: KouboWorkspace, groupId: string) {
    const segmentIds = new Set(workspace.segments.filter((segment) => segment.scriptGroupId === groupId).map((segment) => segment.id));
    return new Set([
        `koubo-script-group-${groupId}`,
        ...[...segmentIds].map((id) => `koubo-segment-${id}`),
        ...workspace.audioNodes.filter((audio) => audio.segmentId && segmentIds.has(audio.segmentId)).map((audio) => `koubo-audio-${audio.id}`),
        ...workspace.videoCandidates.filter((video) => segmentIds.has(video.segmentId)).map((video) => `koubo-video-${video.id}`),
    ]);
}

export function kouboDownloadSelection(workspace: KouboWorkspace, selectedNodeIds: ReadonlySet<string>) {
    const segments = sortedSegments(workspace.segments);
    return {
        texts: segments.flatMap((segment) => selectedNodeIds.has(`koubo-segment-${segment.id}`) ? [{
            id: segment.id,
            title: `文案 ${segment.position + 1}`,
            text: segment.text,
        }] : []),
        audios: workspace.audioNodes.flatMap((audio) => {
            if (!selectedNodeIds.has(`koubo-audio-${audio.id}`) || audio.status !== "ready" || !audio.assetId) return [];
            const segment = segments.find((item) => item.id === audio.segmentId);
            const childLabel = audio.parentAudioNodeId ? ` · 片段 ${(audio.segmentIndex || 0) + 1}` : "";
            return [{ id: audio.id, title: `音频 ${(segment?.position || 0) + 1}${childLabel}`, assetId: audio.assetId }];
        }),
    };
}
