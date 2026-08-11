import { describe, expect, it } from "vitest";
import { clampPlayhead, sectionAtTime, timeFromTimelinePoint, timelineSections, wheelToHorizontalDelta } from "./timeline";

describe("content factory timeline", () => {
    const sections = timelineSections([
        { id: "a", durationMs: 4_000 },
        { id: "b", durationMs: 6_000 },
    ]);

    it("lays sections out from selected audio durations", () => {
        expect(sections).toEqual([
            { id: "a", startMs: 0, endMs: 4_000, durationMs: 4_000 },
            { id: "b", startMs: 4_000, endMs: 10_000, durationMs: 6_000 },
        ]);
    });

    it("maps blank timeline clicks to time and section", () => {
        expect(timeFromTimelinePoint(250, 50, 100, 40)).toBe(7_500);
        expect(sectionAtTime(sections, 8_000)?.id).toBe("b");
        expect(clampPlayhead(12_000, sections)).toBe(10_000);
    });

    it("uses vertical wheels for horizontal navigation", () => {
        expect(wheelToHorizontalDelta({ deltaX: 2, deltaY: 80, shiftKey: false })).toBe(80);
        expect(wheelToHorizontalDelta({ deltaX: 20, deltaY: 5, shiftKey: false })).toBe(20);
    });
});
