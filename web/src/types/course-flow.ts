export type CourseFlowStep = "role" | "script_scene" | "audio" | "video_plan" | "video" | "export";
export type CourseFlowStatus = "queued" | "running" | "ready" | "failed";
export type CourseFlowMode = "green_screen" | "general";
export type CourseSceneAspectRatio = "16:9" | "4:3" | "1:1" | "9:16";

export type CourseFlowRole = {
    id: string;
    creatorId: string;
    name: string;
    description: string;
    designSheetAssetId: string;
    designSheetUrl: string;
    frontAssetId: string;
    frontUrl: string;
    voiceId: string;
    voiceName: string;
    previewAssetId: string | null;
    previewUrl: string;
};

export type CourseFlowAudioVersion = {
    id: string;
    version: number;
    sourceSegmentRevision: number;
    assetId: string | null;
    url: string;
    durationMs: number;
    status: CourseFlowStatus;
    errorMessage: string | null;
    played: boolean;
};

export type CourseFlowMaterialShot = {
    id: string;
    position: number;
    prompt: string;
    durationSeconds: number;
    sourceSegmentRevision: number;
    sourceAudioVersionId: string;
    storyboardPrompt: string;
    storyboardSourcePrompt: string;
    storyboardAssetId: string | null;
    storyboardUrl: string;
    storyboardGenerationId: string | null;
    storyboardStatus: CourseFlowStatus;
    storyboardErrorMessage: string | null;
    storyboardClientRequestId: string | null;
    video: CourseFlowVideoOutput | null;
};

export type CourseFlowVideoOutput = {
    id: string;
    segmentId: string;
    shotId: string | null;
    track: "ltx" | "material";
    prompt: string;
    assetId: string | null;
    sourceAssetId?: string | null;
    enhancedAssetId?: string | null;
    url: string;
    status: CourseFlowStatus;
    errorMessage: string | null;
    clientRequestId: string;
};

export type CourseFlowSegment = {
    id: string;
    position: number;
    text: string;
    voiceDirection: string;
    revision: number;
    confirmedScriptRevision: number | null;
    confirmedPlanAudioId: string | null;
    selectedAudioId: string | null;
    audioVersions: CourseFlowAudioVersion[];
    ltxVideo: CourseFlowVideoOutput | null;
    materialShots: CourseFlowMaterialShot[];
};

export type CourseFlowScene = {
    prompt: string;
    assetId: string | null;
    url: string;
    status: CourseFlowStatus;
    errorMessage: string | null;
};

export type CourseFlowProject = {
    id: string;
    title: string;
    currentStep: CourseFlowStep;
    roleId: string | null;
    sourceType: "generated" | "pasted" | null;
    topic: string;
    audience: string;
    extraPrompt: string;
    sceneMode: CourseFlowMode | null;
    sceneAspectRatio: CourseSceneAspectRatio;
    materialStylePrompt: string;
    resolution: "720p";
};

export type CourseFlowSnapshot = {
    project: CourseFlowProject;
    role: CourseFlowRole | null;
    roles: CourseFlowRole[];
    segments: CourseFlowSegment[];
    scene: CourseFlowScene | null;
};

export type CourseFlowExportSnapshot = {
    title: string;
    segments: Array<{
        id: string;
        position: number;
        text: string;
        voiceDirection: string;
        selectedAudio: { assetId: string; durationMs: number } | null;
        ltx: { assetId: string; prompt: string } | null;
        shots: Array<{ position: number; prompt: string; assetId: string | null }>;
    }>;
    scene: { assetId: string; prompt: string } | null;
};
