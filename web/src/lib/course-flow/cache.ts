import localforage from "localforage";

const cache = localforage.createInstance({ name: "crocotv", storeName: "course_flow_assets" });

export async function cacheCourseFlowAsset(assetId: string, blob: Blob) {
    await cache.setItem(assetId, blob);
    return blob;
}

export async function getCachedCourseFlowAsset(assetId: string) {
    return cache.getItem<Blob>(assetId);
}

export async function resolveCourseFlowAsset(assetId: string, fetchAsset: (id: string) => Promise<Blob>) {
    const cached = await getCachedCourseFlowAsset(assetId);
    if (cached) return cached;
    return cacheCourseFlowAsset(assetId, await fetchAsset(assetId));
}
