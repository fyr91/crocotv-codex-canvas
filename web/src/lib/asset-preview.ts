import type { Asset } from "@/stores/use-asset-store";

export type AssetCardPreview = { type: "image" | "video"; url: string } | null;

export function assetCardPreview(asset: Asset): AssetCardPreview {
    if (asset.kind === "image") return asset.data.dataUrl ? { type: "image", url: asset.data.dataUrl } : null;
    if (asset.kind === "video") return asset.data.url ? { type: "video", url: asset.data.url } : null;
    return asset.coverUrl ? { type: "image", url: asset.coverUrl } : null;
}
