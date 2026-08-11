import audioBufferToWav from "audiobuffer-to-wav";
import vadModelUrl from "@ricky0123/vad-web/dist/silero_vad_legacy.onnx?url";
import ortRuntimeUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";

const AUTOMATIC_SEGMENT_MIN_MS = 10_000;
const AUTOMATIC_SEGMENT_MAX_MS = 20_000;

export type AudioSegmentDraft = { startMs: number; endMs: number };
export type AudioSegmentationSubmit = {
    parentNodeId: string;
    segmentationRunId: string;
    segments: Array<AudioSegmentDraft & { index: number; blob: Blob }>;
};

export type BoundaryCommand =
    | { type: "move"; index: number; edge: "start" | "end"; deltaMs: number }
    | { type: "split"; index: number; atMs: number }
    | { type: "split-at"; atMs: number }
    | { type: "merge"; index: number }
    | { type: "merge-selected"; indexes: number[] }
    | { type: "delete"; index: number }
    | { type: "delete-selected"; indexes: number[] }
    | { type: "add"; startMs: number; endMs: number };

export function normalizeAudioSegments(segments: AudioSegmentDraft[], durationMs: number) {
    const duration = Math.max(0, Math.round(durationMs));
    const sorted = segments
        .map((segment) => ({
            startMs: Math.max(0, Math.min(duration, Math.round(segment.startMs))),
            endMs: Math.max(0, Math.min(duration, Math.round(segment.endMs))),
        }))
        .filter((segment) => segment.endMs > segment.startMs)
        .sort((a, b) => a.startMs - b.startMs);
    return sorted.reduce<AudioSegmentDraft[]>((result, segment) => {
        const previous = result.at(-1);
        if (previous && segment.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, segment.endMs);
        else result.push(segment);
        return result;
    }, []);
}

export function ensureAudioSegments(segments: AudioSegmentDraft[], durationMs: number) {
    const normalized = normalizeAudioSegments(segments, durationMs);
    return normalized.length || durationMs <= 0 ? normalized : [{ startMs: 0, endMs: Math.round(durationMs) }];
}

export function buildAutomaticAudioSegments(segments: AudioSegmentDraft[], durationMs: number) {
    const duration = Math.max(0, Math.round(durationMs));
    if (!duration) return [];
    if (duration <= 20_000) return [{ startMs: 0, endMs: duration }];
    const normalized = normalizeAudioSegments(segments, duration);
    if (!normalized.length) return splitAutomaticRange({ startMs: 0, endMs: duration });
    const result: AudioSegmentDraft[] = [];
    let current = { ...normalized[0] };
    for (const segment of normalized.slice(1)) {
        if (current.endMs - current.startMs <= AUTOMATIC_SEGMENT_MIN_MS) {
            current.endMs = segment.endMs;
            continue;
        }
        result.push(current);
        current = { ...segment };
    }
    if (current.endMs - current.startMs <= AUTOMATIC_SEGMENT_MIN_MS && result.length) {
        result[result.length - 1].endMs = current.endMs;
    } else if (current.endMs - current.startMs <= AUTOMATIC_SEGMENT_MIN_MS) {
        const missing = AUTOMATIC_SEGMENT_MIN_MS + 1 - (current.endMs - current.startMs);
        const before = Math.min(current.startMs, Math.ceil(missing / 2));
        current.startMs -= before;
        current.endMs = Math.min(duration, current.endMs + missing - before);
        current.startMs = Math.max(0, current.endMs - AUTOMATIC_SEGMENT_MIN_MS - 1);
        result.push(current);
    } else {
        result.push(current);
    }
    return result.flatMap(splitAutomaticRange);
}

function splitAutomaticRange(segment: AudioSegmentDraft) {
    const duration = segment.endMs - segment.startMs;
    if (duration > AUTOMATIC_SEGMENT_MIN_MS && duration < AUTOMATIC_SEGMENT_MAX_MS) return [segment];
    if (duration === AUTOMATIC_SEGMENT_MAX_MS) return [{ ...segment, endMs: segment.endMs - 1 }];
    const count = Math.floor(duration / AUTOMATIC_SEGMENT_MAX_MS) + 1;
    return Array.from({ length: count }, (_, index) => ({
        startMs: segment.startMs + duration * index / count,
        endMs: segment.startMs + duration * (index + 1) / count,
    }));
}

export function applyAudioSegmentCommand(segments: AudioSegmentDraft[], command: BoundaryCommand, durationMs: number) {
    const result = segments.map((segment) => ({ ...segment }));
    if (command.type === "delete-selected") {
        const indexes = new Set(command.indexes);
        return result.filter((_, index) => !indexes.has(index));
    }
    if (command.type === "split-at") {
        const atMs = Math.round(command.atMs);
        if (atMs <= 0 || atMs >= durationMs) return result;
        const containingIndex = result.findIndex((segment) => atMs > segment.startMs && atMs < segment.endMs);
        if (containingIndex >= 0) {
            const target = result[containingIndex];
            return [...result.slice(0, containingIndex), { startMs: target.startMs, endMs: atMs }, { startMs: atMs, endMs: target.endMs }, ...result.slice(containingIndex + 1)];
        }
        const startMs = result.filter((segment) => segment.endMs <= atMs).at(-1)?.endMs || 0;
        const endMs = result.find((segment) => segment.startMs >= atMs)?.startMs || Math.round(durationMs);
        if (atMs <= startMs || atMs >= endMs) return result;
        return [...result, { startMs, endMs: atMs }, { startMs: atMs, endMs }].sort((a, b) => a.startMs - b.startMs);
    }
    if (command.type === "merge-selected") {
        const indexes = [...new Set(command.indexes)].filter((index) => result[index]).sort((a, b) => a - b);
        if (indexes.length < 2) return result;
        const first = indexes[0];
        const last = indexes.at(-1)!;
        return [...result.slice(0, first), { startMs: result[first].startMs, endMs: result[last].endMs }, ...result.slice(last + 1)];
    }
    if (command.type === "add") {
        const [candidate] = normalizeAudioSegments([{ startMs: command.startMs, endMs: command.endMs }], durationMs);
        if (!candidate || result.some((segment) => candidate.startMs < segment.endMs && candidate.endMs > segment.startMs)) return result;
        return [...result, candidate].sort((a, b) => a.startMs - b.startMs);
    }
    const target = result[command.index];
    if (!target) return result;
    if (command.type === "delete") return result.filter((_, index) => index !== command.index);
    if (command.type === "merge") {
        const next = result[command.index + 1];
        return next ? [...result.slice(0, command.index), { startMs: target.startMs, endMs: next.endMs }, ...result.slice(command.index + 2)] : result;
    }
    if (command.type === "split") {
        const atMs = Math.round(command.atMs);
        if (atMs <= target.startMs || atMs >= target.endMs) return result;
        return [...result.slice(0, command.index), { startMs: target.startMs, endMs: atMs }, { startMs: atMs, endMs: target.endMs }, ...result.slice(command.index + 1)];
    }
    const previous = result[command.index - 1];
    const next = result[command.index + 1];
    if (command.edge === "start") {
        target.startMs = Math.max(previous?.endMs || 0, Math.min(target.endMs - 10, Math.round(target.startMs + command.deltaMs)));
    } else {
        target.endMs = Math.min(next?.startMs || Math.round(durationMs), Math.max(target.startMs + 10, Math.round(target.endMs + command.deltaMs)));
    }
    return result;
}

export function buildWaveformPeaks(samples: Float32Array, bins: number) {
    return Array.from({ length: bins }, (_, index) => {
        const start = Math.floor(index * samples.length / bins);
        const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / bins));
        let peak = 0;
        for (let offset = start; offset < end; offset += 1) peak = Math.max(peak, Math.abs(samples[offset] || 0));
        return peak;
    });
}

export async function detectSpeechSegments(audio: AudioBuffer) {
    const { NonRealTimeVAD } = await import("@ricky0123/vad-web");
    const vad = await NonRealTimeVAD.new({
        positiveSpeechThreshold: 0.7,
        redemptionMs: 320,
        minSpeechMs: 160,
        modelURL: vadModelUrl,
        ortConfig: (ort) => {
            ort.env.wasm.wasmPaths = { mjs: ortRuntimeUrl, wasm: ortWasmUrl };
        },
    });
    const result: AudioSegmentDraft[] = [];
    for await (const message of vad.run(audio.getChannelData(0), audio.sampleRate)) {
        if (message.audio.length) result.push({
            startMs: message.start,
            endMs: message.end,
        });
    }
    return normalizeAudioSegments(result, audio.duration * 1000);
}

export function sliceAudioBuffer(audio: AudioBuffer, segment: AudioSegmentDraft) {
    const startFrame = Math.max(0, Math.round(segment.startMs / 1000 * audio.sampleRate));
    const endFrame = Math.min(audio.length, Math.round(segment.endMs / 1000 * audio.sampleRate));
    const slice = new AudioBuffer({
        length: Math.max(1, endFrame - startFrame),
        sampleRate: audio.sampleRate,
        numberOfChannels: audio.numberOfChannels,
    });
    for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
        slice.copyToChannel(audio.getChannelData(channel).slice(startFrame, endFrame), channel);
    }
    return slice;
}

export function audioSegmentWavBlob(audio: AudioBuffer, segment: AudioSegmentDraft) {
    return new Blob([audioBufferToWav(sliceAudioBuffer(audio, segment))], { type: "audio/wav" });
}
