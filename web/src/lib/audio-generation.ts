export const audioVoiceOptions = [
    { value: "alloy", label: "Alloy" },
    { value: "ash", label: "Ash" },
    { value: "ballad", label: "Ballad" },
    { value: "coral", label: "Coral" },
    { value: "echo", label: "Echo" },
    { value: "fable", label: "Fable" },
    { value: "nova", label: "Nova" },
    { value: "onyx", label: "Onyx" },
    { value: "sage", label: "Sage" },
    { value: "shimmer", label: "Shimmer" },
    { value: "verse", label: "Verse" },
    { value: "marin", label: "Marin" },
    { value: "cedar", label: "Cedar" },
];

export const audioInstructionPresets = [
    { label: "轻松", value: "用轻松、放松、慢慢聊天的方式说，语速稍慢，停顿自然。" },
    { label: "开心", value: "用开心、明亮、有感染力的语气说。" },
    { label: "温柔", value: "用温柔、克制、亲近的语气说，保持自然停顿。" },
    { label: "严肃", value: "用严肃、沉稳、清晰的语气说。" },
    { label: "激动", value: "用激动、充满能量和情绪张力的语气说。" },
    { label: "旁白", value: "用自然、沉稳、适合叙事旁白的方式说。" },
];

export type SpeechVoiceOption = { value: string; label: string; disabled?: boolean };

export function speechVoiceOption(voice: { speakerId: string; alias: string; state: string }): SpeechVoiceOption {
    const stateLabels: Record<string, string> = { Training: "训练中", Expired: "已过期", Reclaimed: "已回收" };
    const disabled = ["Training", "Expired", "Reclaimed"].includes(voice.state);
    const label = voice.alias.trim() || `未命名音色 · ${voice.speakerId}`;
    return { value: voice.speakerId, label: disabled ? `${label} · ${stateLabels[voice.state] || voice.state}` : label, disabled };
}

export const audioFormatOptions = [
    { value: "mp3", label: "MP3" },
    { value: "wav", label: "WAV" },
    { value: "opus", label: "Opus" },
    { value: "aac", label: "AAC" },
    { value: "flac", label: "FLAC" },
    { value: "pcm", label: "PCM" },
];

export function normalizeAudioVoiceValue(value: string) {
    return value || "";
}

export function normalizeAudioFormatValue(value: string) {
    return audioFormatOptions.some((item) => item.value === value) ? value : "mp3";
}

export function normalizeAudioSpeedValue(value: string) {
    const speed = Number(value);
    if (!Number.isFinite(speed)) return "1";
    return String(Math.max(0.5, Math.min(1.5, Number(speed.toFixed(2)))));
}

export function normalizeAudioVolumeValue(value: string) {
    const volume = Number(value);
    if (!Number.isFinite(volume)) return "1";
    return String(Math.max(0.5, Math.min(2, Number(volume.toFixed(2)))));
}

export function normalizeAudioPitchValue(value: string) {
    const pitch = Number(value);
    if (!Number.isFinite(pitch)) return "0";
    return String(Math.max(-6, Math.min(6, Number(pitch.toFixed(2)))));
}

export function audioVoiceLabel(value: string, options: SpeechVoiceOption[] = audioVoiceOptions) {
    const voice = normalizeAudioVoiceValue(value);
    return options.find((item) => item.value === voice)?.label || voice || "请选择音色";
}

export function audioFormatLabel(value: string) {
    const format = normalizeAudioFormatValue(value);
    return audioFormatOptions.find((item) => item.value === format)?.label || format;
}

export function audioSpeedLabel(value: string) {
    return `${normalizeAudioSpeedValue(value)}x`;
}

export function audioMimeType(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "opus") return "audio/opus";
    if (format === "aac") return "audio/aac";
    if (format === "flac") return "audio/flac";
    if (format === "pcm") return "audio/pcm";
    return "audio/mpeg";
}
