import { beforeAll, describe, expect, it } from "vitest";

import {
    applyAudioSegmentCommand,
    buildAutomaticAudioSegments,
    ensureAudioSegments,
    normalizeAudioSegments,
    sliceAudioBuffer,
} from "./segmentation";

class TestAudioBuffer {
    readonly length: number;
    readonly sampleRate: number;
    readonly numberOfChannels: number;
    readonly duration: number;
    private readonly channels: Float32Array[];

    constructor({ length, sampleRate, numberOfChannels }: { length: number; sampleRate: number; numberOfChannels: number }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.numberOfChannels = numberOfChannels;
        this.duration = length / sampleRate;
        this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    }

    getChannelData(channel: number) {
        return this.channels[channel];
    }

    copyToChannel(source: Float32Array, channel: number) {
        this.channels[channel].set(source);
    }
}

beforeAll(() => {
    Object.defineProperty(globalThis, "AudioBuffer", { configurable: true, value: TestAudioBuffer });
});

describe("shared audio segmentation", () => {
    it("clamps, sorts, and merges overlapping ranges", () => {
        expect(normalizeAudioSegments([
            { startMs: 1200, endMs: 1600 },
            { startMs: -20, endMs: 400 },
            { startMs: 350, endMs: 900 },
        ], 1500)).toEqual([
            { startMs: 0, endMs: 900 },
            { startMs: 1200, endMs: 1500 },
        ]);
    });

    it("falls back to the complete audio when VAD returns no speech", () => {
        expect(ensureAudioSegments([], 2400)).toEqual([{ startMs: 0, endMs: 2400 }]);
        expect(ensureAudioSegments([], 0)).toEqual([]);
    });

    it("keeps every automatic VAD segment strictly between 10 and 20 seconds", () => {
        expect(buildAutomaticAudioSegments([], 60_000)).toEqual([
            { startMs: 0, endMs: 15_000 },
            { startMs: 15_000, endMs: 30_000 },
            { startMs: 30_000, endMs: 45_000 },
            { startMs: 45_000, endMs: 60_000 },
        ]);
    });

    it("adds a segment only in an uncovered range", () => {
        expect(applyAudioSegmentCommand(
            [{ startMs: 0, endMs: 1000 }, { startMs: 2000, endMs: 3000 }],
            { type: "add", startMs: 1200, endMs: 1800 },
            4000,
        )).toEqual([
            { startMs: 0, endMs: 1000 },
            { startMs: 1200, endMs: 1800 },
            { startMs: 2000, endMs: 3000 },
        ]);
    });

    it("splits an uncovered range into two segments at the playhead", () => {
        expect(applyAudioSegmentCommand(
            [{ startMs: 0, endMs: 8000 }, { startMs: 22000, endMs: 30000 }],
            { type: "split-at", atMs: 15000 },
            30000,
        )).toEqual([
            { startMs: 0, endMs: 8000 },
            { startMs: 8000, endMs: 15000 },
            { startMs: 15000, endMs: 22000 },
            { startMs: 22000, endMs: 30000 },
        ]);
    });

    it("splits the complete uncovered waveform when no segments exist", () => {
        expect(applyAudioSegmentCommand(
            [],
            { type: "split-at", atMs: 12000 },
            30000,
        )).toEqual([
            { startMs: 0, endMs: 12000 },
            { startMs: 12000, endMs: 30000 },
        ]);
    });

    it("deletes every selected segment in one command", () => {
        expect(applyAudioSegmentCommand(
            [{ startMs: 0, endMs: 8000 }, { startMs: 10000, endMs: 18000 }, { startMs: 20000, endMs: 28000 }],
            { type: "delete-selected", indexes: [0, 2] },
            30000,
        )).toEqual([{ startMs: 10000, endMs: 18000 }]);
    });

    it("keeps moved boundaries between adjacent segments", () => {
        expect(applyAudioSegmentCommand(
            [{ startMs: 0, endMs: 1000 }, { startMs: 1500, endMs: 2500 }],
            { type: "move", index: 1, edge: "start", deltaMs: -800 },
            3000,
        )).toEqual([
            { startMs: 0, endMs: 1000 },
            { startMs: 1000, endMs: 2500 },
        ]);
    });

    it("merges the complete range covered by multiple selected segments", () => {
        expect(applyAudioSegmentCommand(
            [{ startMs: 0, endMs: 800 }, { startMs: 1000, endMs: 1800 }, { startMs: 2200, endMs: 3000 }],
            { type: "merge-selected", indexes: [0, 2] },
            3000,
        )).toEqual([{ startMs: 0, endMs: 3000 }]);
    });

    it("physically copies only selected frames from every channel", () => {
        const source = new TestAudioBuffer({ length: 2000, sampleRate: 1000, numberOfChannels: 2 });
        source.getChannelData(0).set(Array.from({ length: 2000 }, (_, index) => index));
        source.getChannelData(1).set(Array.from({ length: 2000 }, (_, index) => index + 1000));

        const sliced = sliceAudioBuffer(source as unknown as AudioBuffer, { startMs: 250, endMs: 750 });

        expect(sliced.length).toBe(500);
        expect([...sliced.getChannelData(0).slice(0, 2)]).toEqual([250, 251]);
        expect([...sliced.getChannelData(1).slice(0, 2)]).toEqual([1250, 1251]);
    });
});
