export type LtxInputAssetRole = "ingredient" | "firstFrame" | "lastFrame" | "audio";

export type LtxInputAssetDescriptor = {
    assetId: string;
    name: string;
    roles: LtxInputAssetRole[];
};

type LtxInputAssetEntry = {
    assetId: string;
    name: string;
    role: LtxInputAssetRole;
};

export function groupLtxInputAssets(entries: LtxInputAssetEntry[]) {
    const grouped = new Map<string, LtxInputAssetDescriptor>();
    for (const entry of entries) {
        const current = grouped.get(entry.assetId);
        if (!current) grouped.set(entry.assetId, { assetId: entry.assetId, name: entry.name, roles: [entry.role] });
        else if (!current.roles.includes(entry.role)) current.roles.push(entry.role);
    }
    const descriptors = [...grouped.values()];
    if (!descriptors.some((item) => item.roles.includes("ingredient"))) {
        const frameFallback = descriptors.find((item) => item.roles.includes("firstFrame") || item.roles.includes("lastFrame"));
        if (frameFallback) frameFallback.roles.unshift("ingredient");
    }
    return descriptors;
}
