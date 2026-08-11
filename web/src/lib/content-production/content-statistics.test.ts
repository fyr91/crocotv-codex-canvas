import { describe, expect, it } from "vitest";

import { contentStatisticsRange } from "./content-statistics";

describe("content statistics ranges", () => {
    const now = "2026-07-24T12:00:00+08:00";

    it("builds calendar day, week, and month ranges", () => {
        expect(contentStatisticsRange("day", now).start).toContain("2026-07-24");
        expect(contentStatisticsRange("week", now).start).toContain("2026-07-20");
        expect(contentStatisticsRange("month", now).start).toContain("2026-07-01");
    });
});
