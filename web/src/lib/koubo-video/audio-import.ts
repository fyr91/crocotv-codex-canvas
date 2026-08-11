import { ensureAudioSegments, type AudioSegmentDraft } from "@/lib/audio/segmentation";

export function ensureDetectedSpeechSegments(segments: AudioSegmentDraft[], durationMs: number) {
    return ensureAudioSegments(segments, durationMs);
}

export function audioImportValidation(audio: AudioBuffer | null, segments: AudioSegmentDraft[], expectedCount: number) {
    if (!audio) return { ready: false, message: "请先上传或录制音频" };
    if (!segments.length) return { ready: false, message: "没有可用音频段，请重新录制或上传" };
    const longIndex = segments.findIndex((segment) => segment.endMs - segment.startMs >= 20_000);
    if (longIndex >= 0) return { ready: false, message: `第 ${longIndex + 1} 段达到或超过 20 秒，请拆分后再使用` };
    if (expectedCount > 0 && segments.length !== expectedCount) {
        return { ready: false, message: `当前识别出 ${segments.length} 段，需要调整为与文案一致的 ${expectedCount} 段` };
    }
    return { ready: true, message: `VAD 已识别 ${segments.length} 个可用音频段` };
}
