import type { ContentDeliveryManifest } from "@/types/content-production";

type DeliveryClipInput = {
    artifactId: string;
    assetId: string;
    shotId: string;
    shotNumber: number;
    shotTitle: string;
    source: "ai" | "upload";
    mimeType: string;
    selectedAt: string;
};

type DeliveryManifestInput = {
    topic: { id: string; title: string };
    owner: { id: string; name: string };
    createdAt: string;
    clips: DeliveryClipInput[];
};

const extensions: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
};

function safeSegment(value: string) {
    return value.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 48) || "未命名";
}

export function buildDeliveryManifest(input: DeliveryManifestInput): ContentDeliveryManifest {
    const ordered = [...input.clips].sort((a, b) => a.shotNumber - b.shotNumber || a.selectedAt.localeCompare(b.selectedAt) || a.artifactId.localeCompare(b.artifactId));
    const takes = new Map<string, number>();
    const clips = ordered.map((clip) => {
        const take = (takes.get(clip.shotId) || 0) + 1;
        takes.set(clip.shotId, take);
        const shot = String(clip.shotNumber).padStart(2, "0");
        const takeNumber = String(take).padStart(2, "0");
        const extension = extensions[clip.mimeType] || "mp4";
        return {
            artifactId: clip.artifactId,
            assetId: clip.assetId,
            shotId: clip.shotId,
            shotNumber: clip.shotNumber,
            shotTitle: clip.shotTitle,
            take,
            source: clip.source,
            mimeType: clip.mimeType,
            fileName: `S${shot}-${safeSegment(clip.shotTitle)}-Take${takeNumber}.${extension}`,
        };
    });
    return {
        schemaVersion: "1.0",
        topic: input.topic,
        owner: input.owner,
        createdAt: input.createdAt,
        clipCount: clips.length,
        clips,
    };
}
