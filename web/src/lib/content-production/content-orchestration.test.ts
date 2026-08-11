import { describe, expect, it } from "vitest";

import { composeContentPrompt, contentReviewAccepted, nextOrchestrationAction } from "./content-orchestration";

describe("content orchestration", () => {
    it("injects topic orientation and immutable schema into the producer request", () => {
        const prompt = composeContentPrompt({
            systemPrompt: "SYSTEM",
            schema: { type: "object", required: ["script"] },
            input: { topic: "Topic", orientation: "给家长看" },
        });
        expect(prompt).toContain("SYSTEM");
        expect(prompt).toContain("给家长看");
        expect(prompt).toContain('"required":["script"]');
    });

    it("accepts only a passing review that satisfies configured score and blockers", () => {
        const rule = { minimumScore: 80, blockingIssuesMustBeEmpty: true };
        expect(contentReviewAccepted({ verdict: "accept", score: 85, blocking_issues: [] }, rule)).toBe(true);
        expect(contentReviewAccepted({ verdict: "accept", score: 90, blocking_issues: ["事实未核实"] }, rule)).toBe(false);
        expect(contentReviewAccepted({ verdict: "revise", score: 95, blocking_issues: [] }, rule)).toBe(false);
    });

    it("repairs until max rounds, then requires owner attention", () => {
        expect(nextOrchestrationAction({ accepted: false, round: 1, maxRounds: 3 })).toBe("repair");
        expect(nextOrchestrationAction({ accepted: false, round: 3, maxRounds: 3 })).toBe("owner_attention");
        expect(nextOrchestrationAction({ accepted: true, round: 1, maxRounds: 3 })).toBe("accept");
    });
});
