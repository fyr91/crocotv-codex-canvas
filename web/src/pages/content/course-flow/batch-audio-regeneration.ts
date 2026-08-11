import type { CourseAudioRegenerationInput, CourseAudioSettingsInput } from "./components/audio-regeneration-modal";

export async function runCourseBatchAudioRegeneration(
    segments: ReadonlyArray<{ id: string; voiceDirection: string }>,
    settings: CourseAudioSettingsInput,
    generate: (segmentId: string, settings: CourseAudioRegenerationInput) => Promise<void>,
) {
    await Promise.all(segments.map((segment) => generate(segment.id, { ...settings, voiceDirection: segment.voiceDirection })));
}
