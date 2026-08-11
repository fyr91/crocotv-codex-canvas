import { describe, expect, it } from "vitest";

import { audioImportValidation, ensureDetectedSpeechSegments } from "./audio-import";

describe("koubo audio import", () => {
    it("uses the full recording when browser VAD finds no speech", () => {
        expect(ensureDetectedSpeechSegments([], 12_500)).toEqual([{ startMs: 0, endMs: 12_500 }]);
    });

    it("explains why a recorded or uploaded audio cannot be confirmed", () => {
        expect(audioImportValidation(null, [], 0)).toEqual({ ready: false, message: "请先上传或录制音频" });
        expect(audioImportValidation({} as AudioBuffer, [{ startMs: 0, endMs: 21_000 }], 0)).toEqual({ ready: false, message: "第 1 段达到或超过 20 秒，请拆分后再使用" });
        expect(audioImportValidation({} as AudioBuffer, [{ startMs: 0, endMs: 5_000 }], 2)).toEqual({ ready: false, message: "当前识别出 1 段，需要调整为与文案一致的 2 段" });
        expect(audioImportValidation({} as AudioBuffer, [{ startMs: 0, endMs: 5_000 }], 1)).toEqual({ ready: true, message: "VAD 已识别 1 个可用音频段" });
    });
});
