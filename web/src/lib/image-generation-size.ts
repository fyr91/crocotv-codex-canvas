export type ImageSizePresets = Record<string, Record<string, string>>;
export type ImageSizeSelection = { resolution: string; ratio: string; size: string };

const fallbackImageSizePresets: ImageSizePresets = { "2K": { auto: "2K" } };

export function normalizeImageSizePresets(value: unknown): ImageSizePresets {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fallbackImageSizePresets;
    const entries = Object.entries(value).flatMap(([resolution, ratios]) => {
        if (!ratios || typeof ratios !== "object" || Array.isArray(ratios)) return [];
        const normalized = Object.fromEntries(Object.entries(ratios).filter(([ratio, size]) => ratio && typeof size === "string" && size.trim()).map(([ratio, size]) => [ratio, size.trim()]));
        return normalized.auto ? [[resolution, normalized] as const] : [];
    });
    return entries.length ? Object.fromEntries(entries) : fallbackImageSizePresets;
}

export function imageSizeValue(presets: ImageSizePresets, resolution: string, ratio: string) {
    return presets[resolution]?.[ratio] || presets[resolution]?.auto || firstSelection(presets).size;
}

export function resolveImageSizeSelection(presets: ImageSizePresets, size?: string): ImageSizeSelection {
    for (const [resolution, ratios] of Object.entries(presets)) {
        for (const [ratio, value] of Object.entries(ratios)) {
            if (value === size) return { resolution, ratio, size: value };
        }
    }
    return firstSelection(presets);
}

function firstSelection(presets: ImageSizePresets): ImageSizeSelection {
    const resolution = Object.keys(presets)[0] || "2K";
    return { resolution, ratio: "auto", size: presets[resolution]?.auto || resolution };
}
