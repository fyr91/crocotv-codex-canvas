export const IMAGE_GENERATION_MAX_COUNT = 3;

export const IMAGE_SIZE_OPTIONS = [
    { value: "2K", label: "自适应 2K", width: 24, height: 24 },
    { value: "2048x2048", label: "1:1", width: 24, height: 24 },
    { value: "2304x1728", label: "4:3", width: 24, height: 18 },
    { value: "1728x2304", label: "3:4", width: 18, height: 24 },
    { value: "2496x1664", label: "3:2", width: 24, height: 16 },
    { value: "1664x2496", label: "2:3", width: 16, height: 24 },
    { value: "2560x1440", label: "16:9", width: 24, height: 14 },
    { value: "1440x2560", label: "9:16", width: 14, height: 24 },
    { value: "4K", label: "自适应 4K", width: 30, height: 18 },
] as const;

export const IMAGE_SIZE_SELECT_OPTIONS = IMAGE_SIZE_OPTIONS.map(({ value, label }) => ({ value, label }));

const imageSizeValues = new Set<string>(IMAGE_SIZE_OPTIONS.map((item) => item.value));

export function normalizeImageSize(value: string | undefined, fallback = "2K") {
    if (value && imageSizeValues.has(value)) return value;
    return imageSizeValues.has(fallback) ? fallback : "2K";
}
