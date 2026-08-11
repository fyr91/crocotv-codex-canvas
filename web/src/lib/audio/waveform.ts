import { buildWaveformPeaks } from "./segmentation";

export async function analyzeAudioSource(source: Blob | string, bins = 120) {
    const context = new AudioContext();
    try {
        const data = typeof source === "string" ? await fetchAudio(source) : await source.arrayBuffer();
        const audio = await context.decodeAudioData(data);
        const channelPeaks = bins > 0
            ? Array.from({ length: audio.numberOfChannels }, (_, channel) => buildWaveformPeaks(audio.getChannelData(channel), bins))
            : [];
        return {
            durationMs: Math.round(audio.duration * 1000),
            peaks: bins > 0 ? Array.from({ length: bins }, (_, index) => Math.max(...channelPeaks.map((peaks) => peaks[index] || 0))) : [],
        };
    } finally {
        await context.close();
    }
}

async function fetchAudio(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("音频读取失败");
    return response.arrayBuffer();
}
