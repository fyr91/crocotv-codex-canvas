import { describe, expect, it } from "vitest";
import {
    assertConfirmedDuration,
    assertExactSegments,
    assertUniqueOrder,
    normalizeNewlines,
} from "../../supabase/functions/koubo-orchestrate/invariants";

describe("koubo server invariants", () => {
    it("normalizes only newline encodings", () => {
        expect(normalizeNewlines("甲\r\n乙\r丙")).toBe("甲\n乙\n丙");
    });

    it("accepts only a lossless ordered segmentation", () => {
        expect(() => assertExactSegments("你好，\r\n世界！", [
            { text: "你好，\n", voiceDirection: "自然停顿" },
            { text: "世界！", voiceDirection: "坚定" },
        ])).not.toThrow();
        for (const changed of ["你好。\n世界！", "你好， \n世界！", "你好，\n世界", "你好，世界！"]) {
            expect(() => assertExactSegments("你好，\n世界！", [{ text: changed, voiceDirection: "" }])).toThrow("SEGMENTATION_INVARIANT_FAILED");
        }
    });

    it("enforces audio duration and unique composition order boundaries", () => {
        expect(() => assertConfirmedDuration(19_999)).not.toThrow();
        expect(() => assertConfirmedDuration(20_000)).toThrow("AUDIO_TOO_LONG");
        expect(() => assertUniqueOrder(["a", "b"])).not.toThrow();
        expect(() => assertUniqueOrder(["a", "a"])).toThrow("INVALID_ORDER");
    });
});
