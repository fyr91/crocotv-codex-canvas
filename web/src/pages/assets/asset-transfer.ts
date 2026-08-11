import { saveAs } from "file-saver";

import { createZip, readZip } from "@/lib/zip";
import { createTextCloudAsset, uploadCloudAsset } from "@/services/api/cloud-assets";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import type { Asset, AssetKind } from "@/stores/use-asset-store";

type AssetPackageFile = { path: string; mimeType: string; width?: number; height?: number; durationSeconds?: number };
type AssetPackageItem = {
    kind: AssetKind;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    metadata?: Record<string, unknown>;
    content?: string;
    file?: AssetPackageFile;
};
type AssetPackageManifest = { app: "crocotv"; version: 2; exportedAt: string; assets: AssetPackageItem[] };

export async function exportAssets(assets: Asset[]) {
    const items: AssetPackageItem[] = [];
    const files: { name: string; data: BlobPart }[] = [];

    for (const [index, asset] of assets.entries()) {
        const base = { kind: asset.kind, title: asset.title, coverUrl: customCoverUrl(asset), tags: asset.tags || [], source: asset.source, note: asset.note, metadata: asset.metadata };
        if (asset.kind === "text") {
            items.push({ ...base, content: asset.data.content });
            continue;
        }
        const storageKey = asset.data.storageKey;
        if (!storageKey) throw new Error(`素材「${asset.title}」缺少云端文件`);
        const blob = asset.kind === "image" ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        if (!blob) throw new Error(`无法读取素材「${asset.title}」`);
        const path = `files/${index + 1}-${safeFileName(asset.title || asset.kind)}.${fileExtension(blob.type, asset.kind)}`;
        files.push({ name: path, data: blob });
        items.push({
            ...base,
            file: {
                path,
                mimeType: blob.type || asset.data.mimeType,
                ...(asset.kind !== "audio" ? { width: asset.data.width, height: asset.data.height } : {}),
                ...(asset.data.durationMs ? { durationSeconds: asset.data.durationMs / 1000 } : {}),
            },
        });
    }

    const manifest: AssetPackageManifest = { app: "crocotv", version: 2, exportedAt: new Date().toISOString(), assets: items };
    const zip = await createZip([{ name: "assets.json", data: JSON.stringify(manifest, null, 2) }, ...files]);
    saveAs(zip, "CrocoTV-我的素材.zip");
}

export async function restoreAssetPackage(file: File) {
    const zip = await readZip(file);
    const manifestFile = zip.get("assets.json");
    if (!manifestFile) throw new Error("压缩包中缺少 assets.json");
    const manifest = parseManifest(await manifestFile.text());
    let restored = 0;
    let failed = 0;

    for (const item of manifest.assets) {
        try {
            const metadata = { ...(item.metadata || {}), tags: item.tags, source: item.source, note: item.note, coverUrl: item.coverUrl };
            if (item.kind === "text") {
                await createTextCloudAsset({ title: item.title, content: item.content || "", metadata });
            } else {
                const archived = item.file ? zip.get(item.file.path) : undefined;
                if (!archived || !item.file) throw new Error(`缺少文件：${item.file?.path || item.title}`);
                const blob = archived.type ? archived : archived.slice(0, archived.size, item.file.mimeType);
                await uploadCloudAsset(blob, item.kind, item.title, { width: item.file.width, height: item.file.height, duration_seconds: item.file.durationSeconds, metadata });
            }
            restored += 1;
        } catch {
            failed += 1;
        }
    }
    return { restored, failed };
}

function parseManifest(text: string): AssetPackageManifest {
    const value = JSON.parse(text) as Partial<AssetPackageManifest>;
    if (value.app !== "crocotv") throw new Error("这不是 CrocoTV 素材包");
    if (value.version !== 2) throw new Error("素材包版本不受支持");
    if (!Array.isArray(value.assets) || !value.assets.every(isPackageItem)) throw new Error("素材清单格式无效");
    return value as AssetPackageManifest;
}

function isPackageItem(value: unknown): value is AssetPackageItem {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<AssetPackageItem>;
    if (!(["text", "image", "video", "audio"] as unknown[]).includes(item.kind) || typeof item.title !== "string" || !Array.isArray(item.tags)) return false;
    if (item.kind === "text") return typeof item.content === "string";
    return Boolean(item.file && typeof item.file.path === "string" && typeof item.file.mimeType === "string");
}

function customCoverUrl(asset: Asset) {
    if (!asset.coverUrl || asset.kind === "text") return asset.coverUrl || "";
    const mediaUrl = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
    return asset.coverUrl === mediaUrl ? "" : asset.coverUrl;
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function fileExtension(mimeType: string, kind: AssetKind) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("quicktime")) return "mov";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mpeg")) return kind === "audio" ? "mp3" : "mp4";
    return kind === "image" ? "png" : kind === "video" ? "mp4" : "bin";
}
