export type FactoryLayer = "script" | "audio" | "visual_prompt" | "image" | "video";
export type FactoryStatus = "draft" | "automating" | "partial_failure" | "stale" | "ready" | "exporting" | "completed" | "failed";
export type FactoryArtifactStatus = "queued" | "running" | "ready" | "failed";

export type FactoryArtifactVersion = {
    id: string;
    layer: FactoryLayer;
    version: number;
    selected: boolean;
    stale: boolean;
    status: FactoryArtifactStatus;
    text: string;
    assetId: string | null;
    url: string;
    durationMs: number;
    errorMessage: string | null;
};

export type FactorySection = {
    id: string;
    position: number;
    artifacts: Record<FactoryLayer, FactoryArtifactVersion[]>;
};

export type FactoryProject = {
    id: string;
    title: string;
    status: FactoryStatus;
    currentStage: FactoryLayer | "export";
    roleId: string | null;
    roleName: string;
    topic: string;
    audience: string;
    extraPrompt: string;
    durationText: string;
    aspectRatio: "16:9" | "4:3" | "1:1" | "9:16";
    updatedAt: string;
    finalAssetId: string | null;
    finalUrl: string;
};

export type FactorySnapshot = { project: FactoryProject; sections: FactorySection[] };
export type FactoryTask = Pick<FactoryProject, "id" | "title" | "status" | "currentStage" | "roleName" | "updatedAt"> & { sectionCount: number; readyCount: number };
