import type { VideoInputMode } from "@/lib/video-input-mode";

export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Comment = "comment",
    Config = "config",
    Split = "split",
    Video = "video",
    Audio = "audio",
    Music = "music",
    Group = "group",
    WorkflowGroup = "workflow-group",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasWorkflowNodeState = "waiting" | "ready" | "running" | "success" | "error" | "stopped";
export type CanvasCommentColor = "default" | "yellow" | "green" | "blue" | "purple" | "pink";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio" | "music";
export type CanvasImageGenerationType = "generation" | "edit";

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    promptDraft?: string;
    promptPanelWidth?: number;
    promptPanelContentHeight?: number;
    promptPanelOffsetX?: number;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    commentColor?: CanvasCommentColor;
    commentModel?: string;
    commentBeautifying?: boolean;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    webSearch?: boolean;
    size?: string;
    optimizePrompt?: boolean;
    imageWebSearch?: boolean;
    imageSearch?: boolean;
    count?: number;
    videoCount?: string;
    splitCount?: "auto" | number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    returnLastFrame?: string;
    videoPromptEnhance?: string;
    videoStage1Review?: string;
    videoOutputIndex?: number;
    videoInputMode?: VideoInputMode;
    videoReferenceSizePolicy?: "match" | "max";
    videoFirstFrameNodeId?: string;
    videoLastFrameNodeId?: string;
    videoEditSourceNodeId?: string;
    videoReferenceImageNodeIds?: string[];
    videoAudioSetting?: "auto" | "origin";
    framePickerSourceNodeId?: string;
    framePickerTime?: number;
    sourceVideoNodeId?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioVolume?: string;
    audioPitch?: string;
    audioInstructions?: string;
    audioSourceType?: "generated" | "uploaded" | "recorded" | "segment";
    parentAudioNodeId?: string;
    segmentationRunId?: string;
    segmentIndex?: number;
    sourceStartMs?: number;
    sourceEndMs?: number;
    musicTitle?: string;
    musicDescription?: string;
    musicLyrics?: string;
    musicInstrumental?: boolean;
    musicStyles?: string[];
    musicNegativeTags?: string;
    musicVocalGender?: "m" | "f";
    musicStyleWeight?: number;
    musicWeirdnessConstraint?: number;
    musicBatchId?: string;
    musicOutputIndex?: number;
    musicCoverUrl?: string;
    generationJobId?: string;
    generationState?: "queued" | "running" | "ready" | "failed" | "canceled";
    remoteOperationActive?: boolean;
    remoteOperationLabel?: string;
    persistenceState?: "pending" | "uploading" | "saved" | "failed";
    deliveryMode?: "ltx-direct-preview-v1";
    isTemporaryPreview?: boolean;
    generationProgress?: number;
    generationStage?: string;
    stage1ReviewState?: "awaiting" | "approving" | "approved";
    stage1ReviewVersion?: number;
    stage1ReviewExpiresAt?: string;
    reasoningText?: string;
    reasoningState?: "streaming" | "complete";
    imageOutputIndex?: number;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryResultId?: string;
    batchExpanded?: boolean;
    storageKey?: string;
    h3SourceStorageKey?: string;
    h3SourceContent?: string;
    h3EnhancedAssetId?: string;
    uploadTaskId?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    groupId?: string;
    workflowState?: CanvasWorkflowNodeState;
    workflowRunId?: string;
    workflowResultOf?: string;
    workflowBatchIndex?: number;
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    locked?: boolean;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnectionPort = "node" | "workflow-input" | "workflow-output";

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    fromPort?: CanvasConnectionPort;
    toPort?: CanvasConnectionPort;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
    port?: CanvasConnectionPort;
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
          selectedText?: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
