import { createZip } from "@/lib/zip";
import type { CourseFlowExportSnapshot } from "@/types/course-flow";

export async function createCourseFlowExport(snapshot: CourseFlowExportSnapshot, resolveAsset: (assetId: string) => Promise<Blob>) {
    const files: Array<{ name: string; data: BlobPart }> = [];
    const ordered = [...snapshot.segments].sort((a, b) => a.position - b.position);
    files.push({
        name: "Script/课程文案.txt",
        data: ordered.map((segment) => `片段 ${number(segment.position)}\n${segment.text}\n语气指导：${segment.voiceDirection}`).join("\n\n"),
    });
    if (snapshot.scene) {
        const scene = await resolveAsset(snapshot.scene.assetId);
        files.push({ name: `Scene/场景.${extension(scene.type, "png")}`, data: scene });
        files.push({ name: "Scene/场景.txt", data: snapshot.scene.prompt });
    }
    for (const segment of ordered) {
        const segmentNumber = number(segment.position);
        if (segment.selectedAudio) {
            const audio = await resolveAsset(segment.selectedAudio.assetId);
            files.push({ name: `Audio/片段-${segmentNumber}.${extension(audio.type, "mp3")}`, data: audio });
        }
        if (segment.ltx) {
            const video = await resolveAsset(segment.ltx.assetId);
            files.push({ name: `LTX/片段-${segmentNumber}.${extension(video.type, "mp4")}`, data: video });
            files.push({ name: `LTX/片段-${segmentNumber}.txt`, data: segment.ltx.prompt });
        }
        for (const shot of [...segment.shots].sort((a, b) => a.position - b.position)) {
            const shotNumber = number(shot.position);
            if (shot.assetId) {
                const video = await resolveAsset(shot.assetId);
                files.push({ name: `Material/片段-${segmentNumber}-画面-${shotNumber}.${extension(video.type, "mp4")}`, data: video });
            }
            files.push({ name: `Material/片段-${segmentNumber}-画面-${shotNumber}.txt`, data: shot.prompt });
        }
    }
    return createZip(files);
}

function number(position: number) { return String(position + 1).padStart(2, "0"); }

function extension(mimeType: string, fallback: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("audio")) return "mp3";
    if (mimeType.includes("video")) return "mp4";
    return fallback;
}
