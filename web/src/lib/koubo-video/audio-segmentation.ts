import {
    applyAudioSegmentCommand,
    buildAutomaticAudioSegments,
    buildWaveformPeaks,
    normalizeAudioSegments,
    type AudioSegmentDraft,
    type BoundaryCommand,
} from "@/lib/audio/segmentation";

export type { AudioSegmentDraft, BoundaryCommand };
export { buildAutomaticAudioSegments, buildWaveformPeaks };
export const normalizeSpeechSegments = normalizeAudioSegments;
export function applyBoundaryCommand(segments: AudioSegmentDraft[], command: BoundaryCommand) {
    return applyAudioSegmentCommand(segments, command, Math.max(0, ...segments.map((segment) => segment.endMs)));
}
