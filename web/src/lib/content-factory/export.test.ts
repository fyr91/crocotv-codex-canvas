import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { contentFactoryExportManifest, createContentFactoryExport } from "./export";
import type { FactorySnapshot } from "@/types/content-factory";

describe("content factory export manifest", () => {
    it("contains every selected section layer and the final video", () => {
        const version = (layer: any, assetId: string | null = null) => ({ id: layer, layer, version: 1, selected: true, stale: false, status: "ready" as const, text: ["script", "visual_prompt"].includes(layer) ? `${layer}-text` : "", assetId, url: "", durationMs: 1000, errorMessage: null });
        const snapshot = { project: { id: "p", title: "测试", finalAssetId: "final" }, sections: [{ id: "s", position: 0, artifacts: { script: [version("script")], audio: [version("audio", "a")], visual_prompt: [version("visual_prompt")], image: [version("image", "i")], video: [version("video", "v")] } }] } as FactorySnapshot;
        const manifest = contentFactoryExportManifest(snapshot);
        expect(manifest.finalAssetId).toBe("final");
        expect(manifest.sections[0].layers.map((item) => item.layer)).toEqual(["script", "audio", "visual_prompt", "image", "video"]);
    });

    it("packages selected section files and the final composition", async () => {
        const version = (layer: any, assetId: string | null = null) => ({ id: layer, layer, version: 1, selected: true, stale: false, status: "ready" as const, text: ["script", "visual_prompt"].includes(layer) ? `${layer}-text` : "", assetId, url: "", durationMs: 1000, errorMessage: null });
        const snapshot = { project: { id: "p", title: "测试", finalAssetId: "final" }, sections: [{ id: "s", position: 0, artifacts: { script: [version("script")], audio: [version("audio", "a")], visual_prompt: [version("visual_prompt")], image: [version("image", "i")], video: [version("video", "v")] } }] } as FactorySnapshot;
        const mime = { a: "audio/mpeg", i: "image/webp", v: "video/mp4", final: "video/mp4" } as Record<string, string>;
        const zip = await createContentFactoryExport(snapshot, async (id) => new Blob([id], { type: mime[id] }));
        const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
        expect(Object.keys(files).sort()).toEqual(["Final/final.mp4", "Sections/01/audio.mp3", "Sections/01/image.webp", "Sections/01/script.txt", "Sections/01/video.mp4", "Sections/01/visual_prompt.txt", "manifest.json"].sort());
    });
});
