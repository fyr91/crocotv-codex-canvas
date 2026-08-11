import { musicStyleText, type MusicGenerationConfig } from "@/lib/music-generation";
import type { AiConfig } from "@/stores/use-config-store";
import { createGeneration, waitForGeneration } from "./generation-client";

type RequestOptions = { signal?: AbortSignal; onJobCreated?: (jobId: string) => void };

export type GeneratedMusic = {
    url: string;
    storageKey: string;
    title: string;
    bytes: number;
    mimeType: string;
    durationMs?: number;
    coverUrl?: string;
};

export async function requestMusicGeneration(config: AiConfig, music: MusicGenerationConfig, options?: RequestOptions): Promise<GeneratedMusic[]> {
    const created = await createGeneration({
        capability: "music",
        model: config.model,
        prompt: music.instrumental ? "" : music.lyrics.trim(),
        params: {
            customMode: true,
            instrumental: music.instrumental,
            style: musicStyleText(music.description, music.styles),
            title: music.title.trim(),
            ...(music.negativeTags.trim() ? { negativeTags: music.negativeTags.trim() } : {}),
            ...(music.vocalGender && !music.instrumental ? { vocalGender: music.vocalGender } : {}),
            styleWeight: music.styleWeight,
            weirdnessConstraint: music.weirdnessConstraint,
        },
        signal: options?.signal,
    });
    options?.onJobCreated?.(created.job.id);
    const result = created.assets?.length ? created : await waitForGeneration(created.job.id, options?.signal);
    const musicItems = (result.assets || []).map((asset) => ({
        url: asset.url || "",
        storageKey: asset.id,
        title: asset.title || music.title,
        bytes: asset.byte_size || 0,
        mimeType: asset.mime_type || "audio/mpeg",
        durationMs: asset.duration_seconds ? Number(asset.duration_seconds) * 1000 : undefined,
        coverUrl: asset.coverUrl,
    })).filter((asset) => asset.url);
    if (!musicItems.length) throw new Error("音乐任务成功，但没有返回音乐文件");
    return musicItems;
}
