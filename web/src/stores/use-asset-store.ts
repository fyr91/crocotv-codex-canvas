import { create } from "zustand";

import { createTextCloudAsset, deleteCloudAssets, listCloudAssets, saveCloudAsset, setCloudAssetShared, updateCloudAsset, type CloudAsset } from "@/services/api/cloud-assets";

export type AssetKind = "text" | "image" | "video" | "audio";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string; durationMs?: number } };
export type AudioAsset = AssetBase<"audio"> & { data: { url: string; storageKey?: string; bytes: number; mimeType: string; durationMs?: number } };
export type Asset = TextAsset | ImageAsset | VideoAsset | AudioAsset;
type AssetBase<T extends AssetKind> = { id: string; kind: T; title: string; coverUrl: string; tags: string[]; source?: string; note?: string; createdAt: string; updatedAt: string; sharedAt: string | null; metadata?: Record<string, unknown> };

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    initialize: () => Promise<void>;
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt" | "sharedAt">) => Promise<string>;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    setAssetShared: (id: string, shared: boolean) => Promise<void>;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

export const useAssetStore = create<AssetStore>()((set, get) => ({
    hydrated: false,
    assets: [],
    initialize: async () => {
        try {
            const rows = await listCloudAssets();
            set({ assets: rows.filter((row) => row.kind === "text" || row.kind === "image" || row.kind === "video" || row.kind === "audio").map(assetFromCloudAsset), hydrated: true });
        } catch { set({ assets: [], hydrated: true }); }
    },
    addAsset: async (asset) => {
        const now = new Date().toISOString();
        const existingId = asset.kind === "text" ? "" : asset.data.storageKey || "";
        const id = existingId || crypto.randomUUID();
        const next = { ...asset, id, createdAt: now, updatedAt: now, sharedAt: null } as Asset;
        const row = await persistAsset(next, Boolean(existingId));
        const saved = assetFromCloudAsset(row);
        set((state) => ({ assets: [saved, ...state.assets.filter((item) => item.id !== saved.id && item.id !== existingId)] }));
        return saved.id;
    },
    updateAsset: (id, patch) => {
        set((state) => ({ assets: state.assets.map((asset) => asset.id === id ? { ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset : asset) }));
        const asset = get().assets.find((item) => item.id === id);
        if (asset) void updatePersistedAsset(asset);
    },
    removeAsset: (id) => {
        set((state) => ({ assets: state.assets.filter((asset) => asset.id !== id) }));
        void deleteCloudAssets([id]);
    },
    setAssetShared: async (id, shared) => {
        const row = await setCloudAssetShared(id, shared);
        const next = assetFromCloudAsset(row);
        set((state) => ({ assets: state.assets.map((asset) => asset.id === id ? next : asset) }));
    },
    replaceAssets: (assets) => set({ assets }),
    cleanupImages: () => {},
}));

export function assetFromCloudAsset(row: CloudAsset): Asset {
    const metadata = { ...(row.metadata || {}), ...(row.audio_kind ? { audioKind: row.audio_kind } : {}) };
    const coverUrl = String(metadata.coverUrl || row.coverUrl || (row.kind === "image" ? row.url : "") || "");
    const base = { id: row.id, title: row.title, coverUrl, tags: Array.isArray(metadata.tags) ? metadata.tags as string[] : [], source: String(metadata.source || ""), note: String(metadata.note || ""), createdAt: row.created_at || new Date().toISOString(), updatedAt: row.updated_at || row.created_at || new Date().toISOString(), sharedAt: row.shared_at || null, metadata };
    if (row.kind === "text") return { ...base, kind: "text", data: { content: row.content || "" } };
    if (row.kind === "video") return { ...base, kind: "video", data: { url: row.url || "", storageKey: row.id, width: row.width || 1280, height: row.height || 720, bytes: row.byte_size || 0, mimeType: row.mime_type || "video/mp4", durationMs: row.duration_seconds ? Number(row.duration_seconds) * 1000 : undefined } };
    if (row.kind === "audio") return { ...base, kind: "audio", data: { url: row.url || "", storageKey: row.id, bytes: row.byte_size || 0, mimeType: row.mime_type || "audio/mpeg", durationMs: row.duration_seconds ? Number(row.duration_seconds) * 1000 : undefined } };
    return { ...base, kind: "image", data: { dataUrl: row.url || "", storageKey: row.id, width: row.width || 1, height: row.height || 1, bytes: row.byte_size || 0, mimeType: row.mime_type || "image/png" } };
}

async function persistAsset(asset: Asset, exists: boolean) {
    const metadata = { ...(asset.metadata || {}), tags: asset.tags, source: asset.source, note: asset.note, coverUrl: asset.kind === "image" ? "" : asset.coverUrl };
    if (asset.kind === "text") return createTextCloudAsset({ title: asset.title, content: asset.data.content, metadata });
    const sourceUrl = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
    return saveCloudAsset({
        sourceAssetId: exists ? asset.id : undefined,
        sourceUrl,
        kind: asset.kind,
        title: asset.title,
        mimeType: asset.data.mimeType,
        width: asset.kind === "audio" ? undefined : asset.data.width,
        height: asset.kind === "audio" ? undefined : asset.data.height,
        duration_seconds: asset.kind === "image" ? undefined : asset.data.durationMs ? asset.data.durationMs / 1000 : undefined,
        audio_kind: asset.kind === "audio" && asset.metadata?.audioKind === "music" ? "music" : asset.kind === "audio" ? "speech" : undefined,
        metadata,
    });
}

async function updatePersistedAsset(asset: Asset) {
    const metadata = { ...(asset.metadata || {}), tags: asset.tags, source: asset.source, note: asset.note, coverUrl: asset.kind === "image" ? "" : asset.coverUrl };
    await updateCloudAsset(asset.id, { title: asset.title, ...(asset.kind === "text" ? { content: asset.data.content } : {}), metadata });
}
