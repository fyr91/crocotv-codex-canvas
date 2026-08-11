export const ASSET_EXPORT_BATCH_SIZE = 20;

export function nextAssetExportLimit(current: number, total: number) {
    return Math.min(current + ASSET_EXPORT_BATCH_SIZE, total);
}

export function selectedAssetsInOrder<T extends { id: string }>(assets: T[], selectedIds: ReadonlySet<string>) {
    return assets.filter((asset) => selectedIds.has(asset.id));
}
