export type KouboProjectStatus = "draft" | "preparing_assets" | "adjusting_segments" | "generating" | "review" | "partial_failure" | "exportable" | "exported";
export type KouboItemStatus = "draft" | "queued" | "running" | "ready" | "failed" | "stale";
export type KouboAudioGenerationStage = "queued" | "tone_optimizing" | "speech_generating";

export type KouboModelPromptBinding = {
    promptId?: string;
    stage?: string;
    purposeKey?: string;
    purposeLabel?: string;
    modelId?: string;
    version?: number;
};

export type KouboScriptGroup = {
    id: string;
    projectId: string;
    sourceType: "ai" | "pasted";
    sourceInput: string;
    promptVersion: string | null;
    revision: number;
    generationId: string | null;
    modelPromptBinding: KouboModelPromptBinding;
};

export type KouboSegment = {
    id: string;
    projectId: string;
    scriptGroupId: string;
    position: number;
    text: string;
    voiceDirection: string;
    revision: number;
    generationId: string | null;
    modelPromptBinding: KouboModelPromptBinding;
};

export type KouboAudioNode = {
    id: string;
    projectId: string;
    segmentId: string | null;
    parentAudioNodeId: string | null;
    segmentationRunId: string | null;
    segmentIndex: number | null;
    assetId: string | null;
    url?: string;
    mimeType?: string;
    durationMs: number | null;
    sourceType: "generated" | "uploaded" | "recorded" | "segment";
    sourceStartMs: number | null;
    sourceEndMs: number | null;
    sourceSegmentRevision: number | null;
    status: KouboItemStatus;
    imageResultId: string | null;
    generationId?: string | null;
    clientRequestId?: string | null;
    errorMessage?: string | null;
    generationStage?: KouboAudioGenerationStage | null;
};

export type KouboImageResult = {
    id: string;
    projectId: string;
    sourceType: "empty" | "asset" | "upload" | "generated";
    assetId: string | null;
    url?: string;
    mimeType?: string;
    prompt: string;
    aspectRatio: string;
    status: KouboItemStatus;
    personReferenceAssetId?: string | null;
    backgroundReferenceAssetId?: string | null;
    generationId?: string | null;
    clientRequestId?: string | null;
    errorMessage?: string | null;
};

export type KouboVideoCandidate = {
    id: string;
    projectId: string;
    segmentId: string | null;
    audioNodeId: string;
    imageResultId: string;
    assetId: string | null;
    url?: string;
    mimeType?: string;
    sourceSegmentRevision: number | null;
    status: Exclude<KouboItemStatus, "draft">;
    selected: boolean;
    generationId?: string | null;
    clientRequestId?: string | null;
    errorMessage?: string | null;
    progress?: number | null;
    generationStage?: string | null;
};
export type KouboComposition = { id: string; orderedCandidateIds: string[]; status: "queued" | "running" | "ready" | "failed" | "stale"; assetId: string | null };

export type KouboWorkspace = {
    projectId: string;
    title: string;
    courseScriptModelId: string | null;
    status: KouboProjectStatus;
    selectedImageResultId: string | null;
    exportedAt: string | null;
    noticeUnread: boolean;
    latestMessage: string | null;
    scriptGroups: KouboScriptGroup[];
    segments: KouboSegment[];
    audioNodes: KouboAudioNode[];
    imageResults: KouboImageResult[];
    videoCandidates: KouboVideoCandidate[];
    compositions: KouboComposition[];
};
