import type { CanvasNodeMetadata } from "@/types/canvas";

export type MusicGenerationConfig = {
    title: string;
    description: string;
    lyrics: string;
    instrumental: boolean;
    styles: string[];
    negativeTags: string;
    vocalGender?: "m" | "f";
    styleWeight: number;
    weirdnessConstraint: number;
    maxDuration?: number;
    seed?: number;
    tiledDecode?: boolean;
    outputFormat?: "mp3" | "wav";
};

export const MUSIC_STYLE_GROUPS = [
    { label: "曲风", options: [{ label: "流行", value: "Pop" }, { label: "摇滚", value: "Rock" }, { label: "电子", value: "Electronic" }, { label: "嘻哈", value: "Hip Hop" }, { label: "R&B", value: "R&B" }, { label: "爵士", value: "Jazz" }, { label: "古典", value: "Classical" }, { label: "民谣", value: "Folk" }, { label: "国风", value: "Chinese Style" }, { label: "Lo-fi", value: "Lo-fi" }, { label: "氛围", value: "Ambient" }, { label: "电影配乐", value: "Cinematic" }] },
    { label: "情绪", options: [{ label: "欢快", value: "Upbeat" }, { label: "治愈", value: "Healing" }, { label: "浪漫", value: "Romantic" }, { label: "忧伤", value: "Melancholic" }, { label: "史诗", value: "Epic" }, { label: "神秘", value: "Mysterious" }] },
    { label: "节奏", options: [{ label: "舒缓", value: "Slow Tempo" }, { label: "中速", value: "Mid Tempo" }, { label: "强节奏", value: "Driving Rhythm" }] },
] as const;

export function musicConfigFromMetadata(metadata?: CanvasNodeMetadata): MusicGenerationConfig {
    return {
        title: metadata?.musicTitle || "",
        description: metadata?.musicDescription || "",
        lyrics: metadata?.musicLyrics || "",
        instrumental: Boolean(metadata?.musicInstrumental),
        styles: metadata?.musicStyles || [],
        negativeTags: metadata?.musicNegativeTags || "",
        vocalGender: metadata?.musicVocalGender,
        styleWeight: metadata?.musicStyleWeight ?? 0.65,
        weirdnessConstraint: metadata?.musicWeirdnessConstraint ?? 0.65,
        maxDuration: metadata?.musicMaxDuration ?? 120,
        seed: metadata?.musicSeed ?? 0,
        tiledDecode: Boolean(metadata?.musicTiledDecode),
        outputFormat: metadata?.musicOutputFormat || "mp3",
    };
}

export function musicStyleText(description: string, styles: string[]) {
    return Array.from(new Set([description.trim(), ...styles].filter(Boolean))).join(", ");
}

export function musicLimits(model: string) {
    const value = model.toUpperCase();
    if (value.includes("V4_5ALL")) return { title: 80, description: 1000, lyrics: 5000 };
    if (value.includes("V4_5") || value.includes("V5")) return { title: 100, description: 1000, lyrics: 5000 };
    return { title: 80, description: 200, lyrics: 3000 };
}

export function validateMusicGeneration(model: string, music: MusicGenerationConfig) {
    if (!music.title.trim()) return "请输入音乐标题";
    if (!music.description.trim()) return "请输入音乐描述";
    if (!music.instrumental && !music.lyrics.trim()) return "请输入歌词，或开启纯音乐";
    const limits = musicLimits(model);
    if (music.title.length > limits.title) return `音乐标题不能超过 ${limits.title} 个字符`;
    if (musicStyleText(music.description, music.styles).length > limits.description) return `音乐描述和风格不能超过 ${limits.description} 个字符`;
    if (!music.instrumental && music.lyrics.length > limits.lyrics) return `歌词不能超过 ${limits.lyrics} 个字符`;
    return null;
}
