import { strToU8, zipSync } from "fflate";
import type { FactoryLayer, FactorySnapshot } from "@/types/content-factory";

const layers: FactoryLayer[] = ["script", "audio", "visual_prompt", "image", "video"];

export function contentFactoryExportManifest(snapshot: FactorySnapshot) {
    return {
        projectId: snapshot.project.id,
        title: snapshot.project.title,
        exportedAt: new Date().toISOString(),
        finalAssetId: snapshot.project.finalAssetId,
        sections: snapshot.sections.map((section) => ({
            id: section.id,
            position: section.position,
            layers: layers.map((layer) => section.artifacts[layer].find((item) => item.selected)).filter(Boolean).map((item) => ({ layer: item!.layer, version: item!.version, text: item!.text, assetId: item!.assetId, durationMs: item!.durationMs })),
        })),
    };
}

export async function createContentFactoryExport(snapshot: FactorySnapshot, resolveAsset: (assetId: string) => Promise<Blob>) {
    const manifest = contentFactoryExportManifest(snapshot);
    const files: Record<string, Uint8Array> = { "manifest.json": strToU8(JSON.stringify(manifest, null, 2)) };
    const assetFiles: Array<Promise<void>> = [];
    for (const section of snapshot.sections) {
        const prefix = `Sections/${String(section.position + 1).padStart(2, "0")}`;
        for (const layer of layers) {
            const item = section.artifacts[layer].find((artifact) => artifact.selected);
            if (!item) continue;
            if (item.text) files[`${prefix}/${layer}.txt`] = strToU8(item.text);
            if (item.assetId) {
                assetFiles.push(resolveAsset(item.assetId).then(async (blob) => { files[`${prefix}/${layer}.${extensionFor(layer, blob.type)}`] = new Uint8Array(await blob.arrayBuffer()); }));
            }
        }
    }
    if (snapshot.project.finalAssetId) assetFiles.push(resolveAsset(snapshot.project.finalAssetId).then(async (blob) => { files["Final/final.mp4"] = new Uint8Array(await blob.arrayBuffer()); }));
    await Promise.all(assetFiles);
    return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" });
}

function extensionFor(layer: FactoryLayer, mime: string) { return layer === "audio" ? mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "mp3" : layer === "image" ? mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png" : "mp4"; }
