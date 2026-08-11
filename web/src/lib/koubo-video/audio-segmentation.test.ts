import { describe, expect, it } from "vitest";
import { applyBoundaryCommand, buildAutomaticAudioSegments, buildWaveformPeaks, normalizeSpeechSegments } from "./audio-segmentation";

describe("koubo audio segmentation", () => {
    it("normalizes overlapping VAD ranges and clamps them to audio duration", () => {
        expect(normalizeSpeechSegments([{ startMs: -20, endMs: 400 }, { startMs: 350, endMs: 900 }, { startMs: 1200, endMs: 1600 }], 1500))
            .toEqual([{ startMs: 0, endMs: 900 }, { startMs: 1200, endMs: 1500 }]);
    });
    it("supports keyboard boundary movement, split, merge and delete", () => {
        const draft = [{ startMs: 0, endMs: 1000 }, { startMs: 1000, endMs: 2000 }];
        expect(applyBoundaryCommand(draft, { type: "move", index: 0, edge: "end", deltaMs: -10 })[0].endMs).toBe(990);
        expect(applyBoundaryCommand(draft, { type: "split", index: 0, atMs: 500 })).toHaveLength(3);
        expect(applyBoundaryCommand(draft, { type: "merge", index: 0 })).toEqual([{ startMs: 0, endMs: 2000 }]);
        expect(applyBoundaryCommand(draft, { type: "delete", index: 1 })).toEqual([{ startMs: 0, endMs: 1000 }]);
    });
    it("builds stable absolute waveform peaks", () => {
        expect(buildWaveformPeaks(new Float32Array([-1, .5, -.25, 0]), 2)).toEqual([1, .25]);
    });
    it("keeps audio at or below twenty seconds as one automatic segment", () => {
        expect(buildAutomaticAudioSegments([{ startMs: 2_000, endMs: 4_000 }], 20_000))
            .toEqual([{ startMs: 0, endMs: 20_000 }]);
    });
    it("merges VAD ranges so every automatic segment is at least ten seconds", () => {
        expect(buildAutomaticAudioSegments([
            { startMs: 0, endMs: 6_000 },
            { startMs: 7_000, endMs: 12_000 },
            { startMs: 18_000, endMs: 23_000 },
            { startMs: 24_000, endMs: 31_000 },
        ], 31_000)).toEqual([
            { startMs: 0, endMs: 12_000 },
            { startMs: 18_000, endMs: 31_000 },
        ]);
    });
    it("merges a short automatic tail into the preceding segment", () => {
        expect(buildAutomaticAudioSegments([
            { startMs: 0, endMs: 12_000 },
            { startMs: 20_000, endMs: 25_000 },
        ], 25_000)).toEqual([
            { startMs: 0, endMs: 12_500 },
            { startMs: 12_500, endMs: 25_000 },
        ]);
    });
    it("splits long automatic ranges into segments between ten and twenty seconds", () => {
        const result = buildAutomaticAudioSegments([], 45_000);
        expect(result).toHaveLength(3);
        expect(result.every((segment) => segment.endMs - segment.startMs >= 10_000)).toBe(true);
        expect(result.every((segment) => segment.endMs - segment.startMs <= 20_000)).toBe(true);
    });
});
