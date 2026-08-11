import { describe, expect, it } from "vitest";

import { readZip } from "@/lib/zip";
import { createCourseFlowExport } from "./export";

describe("Course Flow export", () => {
    it("creates the five approved folders with scripts next to both video tracks", async () => {
        const blob = await createCourseFlowExport({
            title: "生成式 AI 入门课",
            segments: [{
                id: "segment-1", position: 0, text: "欢迎开始学习。", voiceDirection: "亲切清晰",
                selectedAudio: { assetId: "audio-1", durationMs: 3000 },
                ltx: { assetId: "ltx-1", prompt: "自然口播" },
                shots: [{ position: 0, prompt: "抽象数据流动画", assetId: "material-1" }],
            }],
            scene: { assetId: "scene-1", prompt: "绿幕课程场景" },
        }, async (assetId) => new Blob([assetId], { type: assetId === "scene-1" ? "image/png" : assetId === "audio-1" ? "audio/mpeg" : "video/mp4" }));

        const files = await readZip(blob);
        expect([...files.keys()].sort()).toEqual([
            "Audio/片段-01.mp3",
            "Material/片段-01-画面-01.txt",
            "Material/片段-01-画面-01.mp4",
            "LTX/片段-01.txt",
            "LTX/片段-01.mp4",
            "Scene/场景.txt",
            "Scene/场景.png",
            "Script/课程文案.txt",
        ].sort());
        expect(await files.get("Script/课程文案.txt")?.text()).toContain("片段 01\n欢迎开始学习。");
        expect(await files.get("Material/片段-01-画面-01.txt")?.text()).toBe("抽象数据流动画");
    });
});
