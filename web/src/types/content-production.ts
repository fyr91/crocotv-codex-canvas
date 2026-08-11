export type ContentSourceType = "ai_planning" | "member" | "inspiration" | "api";
export type ContentTopicStatus = "pool" | "in_progress" | "completed";
export type ContentAttemptStatus = "active" | "abandoned" | "closed";
export type ContentNodeType =
    | "topic"
    | "angle"
    | "orientation"
    | "storyline"
    | "script"
    | "shot"
    | "resource_requirements"
    | "storyboard_prompt"
    | "image"
    | "tts"
    | "music"
    | "video"
    | "batch"
    | "text";
export type ContentNodeStatus = "idle" | "running" | "succeeded" | "failed" | "needs_owner_attention";
export type ContentStage =
    | "course_script"
    | "course_scene"
    | "course_video"
    | "koubo_script"
    | "research"
    | "inspiration_analysis"
    | "topic_factory"
    | "storyline_script"
    | "shot_breakdown"
    | "storyboard_prompt"
    | "storyboard_image"
    | "tts"
    | "music"
    | "ltx_multimodal"
    | "video";
export type ContentRunStatus = "queued" | "producer_running" | "reviewer_running" | "repairing" | "humanizing" | "accepted" | "needs_owner_attention" | "failed" | "canceled";

export type ContentGlobalSettings = {
    contentGoal: string;
    targetAudience: string;
    marketLanguage: string;
    primaryPlatforms: string[];
    contentFormat: string;
    defaultDurationSeconds: number;
    defaultAspectRatio: string;
    expressionStyle: string;
    version: number;
    updatedAt: string;
};

export type ContentTopicOrientation = {
    contentGoal: string;
    targetAudience: string;
    marketLanguage: string;
    primaryPlatforms: string[];
    contentFormat: string;
    defaultDurationSeconds: number;
    defaultAspectRatio: string;
    expressionStyle: string;
};

export type ContentTopicFactoryPhase =
    | "queued"
    | "generating"
    | "persisting"
    | "reviewing"
    | "revising"
    | "humanizing"
    | "ready_pass"
    | "ready_warning"
    | "error"
    | "canceled";

export type ContentTopicCitation = {
    text: string;
    url: string;
    title?: string;
    start_index?: number;
    end_index?: number;
};

export type ContentTopicFactoryCandidate = {
    title: string;
    core_hook: string;
    target_audience: { segment: string; need_or_anxiety: string };
    specific_situation: string;
    core_conflict: string;
    twist_or_gap: string;
    payoff: { type: "emotional" | "practical" | "identity" | "financial" | "social"; description: string };
    share_motivation: string;
    story_promise: string;
    evidence_requirements: Array<{ claim: string; evidence_type: string; priority: "required" | "recommended" }>;
    tags: string[];
};

export type ContentTopicFactoryReview = {
    verdict: "pass" | "revise";
    total_score: number;
    dimension_scores: {
        audience_relevance: number;
        specificity: number;
        conflict_or_information_gap: number;
        payoff: number;
        credibility: number;
        content_fit: number;
    };
    blocking_issues: string[];
    critical_information: Array<{
        claim: string;
        covered: boolean;
        citation_indexes: number[];
        issue: string;
    }>;
    feedback_to_gemini: {
        missing_critical_information: string[];
        revision_instructions: string[];
        require_google_search: boolean;
    };
};

export type ContentTopicFactorySnapshot = {
    batchId: string;
    laneNumber: number;
    laneStrategy: string;
    phase: ContentTopicFactoryPhase;
    reviewCycle: number;
    runId: string;
    latestGeminiInteractionId: string | null;
    candidate: ContentTopicFactoryCandidate | null;
    citations: ContentTopicCitation[];
    review: ContentTopicFactoryReview | null;
    score: number | null;
    warning: string | null;
    error: string | null;
};

export type ContentStorylinePhase =
    | "producer_running"
    | "reviewer_running"
    | "repairing"
    | "accepted"
    | "needs_owner_attention"
    | "failed";

export type ContentStorylineCandidate = {
    format: "crocotv.storyline";
    version: 2;
    positioning: {
        core_narrative_anchor: string;
        emotional_value: string;
        emotional_curve: string[];
        opening_visual_beats: Array<{
            order: number;
            visual_concept: string;
            narrative_function: string;
        }>;
    };
    five_act: {
        setup: {
            conflict: string;
            character_action: string;
            suspense: string;
        };
        escalation: {
            layers: Array<{
                order: number;
                pressure: string;
                character_action: string;
                consequence: string;
            }>;
            loss_of_control_point: string;
        };
        reveal: {
            truth_or_solution: string;
            unexpected_but_inevitable: string;
            anchor_connection: string;
        };
        payoff: {
            direct_result: string;
            emotional_release: string;
            audience_value: string;
        };
        cta_bridge: {
            transition: string;
            target_action: string;
            motivation: string;
        };
    };
};

export type ContentStorylineReviewDimension = {
    score: number;
    strengths: string[];
    issues: string[];
    deduction_reasons: string[];
};

export type ContentStorylineReview = {
    verdict: "pass" | "revise";
    total_score: number;
    core_assessment: string;
    dimension_scores: {
        opening_hook: ContentStorylineReviewDimension;
        narrative_tension: ContentStorylineReviewDimension;
        emotional_payoff: ContentStorylineReviewDimension;
        cta_naturalness: ContentStorylineReviewDimension;
        executability: ContentStorylineReviewDimension;
    };
    blocking_issues: string[];
    revision_instructions: Array<{
        target_path: string;
        problem: string;
        instruction: string;
        example: string;
    }>;
    restructured_storyline: ContentStorylineCandidate | null;
};

export type ContentStorylineSnapshot = {
    operation: "generate" | "optimize" | "rebuild";
    phase: ContentStorylinePhase;
    round: number;
    runId: string;
    sourceNodeId: string;
    upstreamAngleNodeId: string;
    parentInteractionId: string | null;
    latestGeminiInteractionId: string | null;
    optimizationDirection: string | null;
    candidate: ContentStorylineCandidate | null;
    review: ContentStorylineReview | null;
    lastError: string | null;
};

export type ContentStoryboardDialogueLine = {
    line_id: string;
    speaker: string;
    listener: string;
    text: string;
    emotion_tone: string;
    timing_offset: string;
    audio_tts_prompt: string;
};

export type ContentStoryboardNode = {
    node_id: string;
    scene_number: number;
    scene_id: string;
    characters_present: string[];
    narrative_function: string;
    transition_in: string;
    transition_out: string;
    cinematography: { shot_type: string; camera_movement: string; camera_angle: string };
    script_content: {
        visual_summary: string;
        dialogue_type: "none" | "narration" | "multi_character";
        dialogue_lines: ContentStoryboardDialogueLine[];
        audio_sfx: string;
        bgm_mood: string;
    };
    keyframes: Array<{
        frame_id: string;
        timestamp_or_action: string;
        associated_line_id: string;
        image_prompt: string;
        negative_prompt: string;
    }>;
};

export type ContentStoryboardMetadata = {
    defined_characters: Array<{ character_id: string; name: string; visual_summary: string; voice_style: string }>;
    defined_scenes: Array<{ scene_id: string; name: string; visual_summary: string }>;
};

export type ContentStoryboardHeader = {
    storyline_title: string;
    total_nodes: number;
    metadata: ContentStoryboardMetadata;
};

export type ContentStoryboardSnapshot = {
    operation: "generate" | "regenerate" | "optimize" | "optimize_node";
    phase: "producer_running" | "accepted" | "failed" | "canceled";
    runId: string;
    sourceNodeId: string;
    groupId: string;
    parentInteractionId: string | null;
    latestGeminiInteractionId: string | null;
    optimizationDirection: string | null;
    header: ContentStoryboardHeader | null;
    node: ContentStoryboardNode | null;
    lastError: string | null;
};

export type ContentStoryboardReference = {
    title: string;
    kind: "text" | "image" | "video" | "audio";
    content?: string;
    purpose?: string;
    assetId?: string;
};

export type ContentTopic = {
    id: string;
    workflowType: "social_media_video_v1" | string;
    title: string;
    originalTopic: string;
    creationNotes: string;
    tags: string[];
    sourceType: ContentSourceType;
    sourceAssetId: string | null;
    sourceInspirationId: string | null;
    parentTopicId: string | null;
    createdBy: string;
    ownerId: string | null;
    currentAttemptId: string | null;
    status: ContentTopicStatus;
    backgroundSnapshot: Record<string, unknown>;
    latestCompletionVersion: number;
    hasPostCompletionChanges: boolean;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type VideoWorkflowType = "koubo-video" | "course-video";
export type ContentVideoWorkflowType = VideoWorkflowType | "course-flow";

export type ContentWorkflowProject =
    | {
          id: string;
          workflowType: "topic_content_v1";
          title: string;
          ownerId: string;
          topicId: string;
          topic: ContentTopic;
          createdAt: string;
          updatedAt: string;
      }
    | {
          id: string;
          workflowType: ContentVideoWorkflowType;
          title: string;
          ownerId: string;
          topicId: null;
          createdAt: string;
          updatedAt: string;
      };

export type ContentAttempt = {
    id: string;
    topicId: string;
    ownerId: string;
    status: ContentAttemptStatus;
    abandonReason: string | null;
    startedAt: string;
    endedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ContentNode = {
    id: string;
    topicId: string;
    attemptId: string;
    parentId: string | null;
    nodeType: ContentNodeType;
    title: string;
    summary: string;
    sortOrder: number;
    data: Record<string, unknown>;
    status: ContentNodeStatus;
    noticeKind?: "success" | "attention" | "failure" | null;
    noticeUnread?: boolean;
    noticeAt?: string | null;
    revision: number;
    createdBy: string;
    hiddenAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ContentNodeReference = {
    id: string;
    topicId: string;
    attemptId: string;
    nodeId: string;
    assetId: string | null;
    referencedNodeId: string | null;
    referenceKind: "asset" | "node" | "voice" | "frame" | "audio" | "context";
    purpose: string;
    createdBy: string;
    createdAt: string;
};

export type ContentModelPromptBinding = {
    promptId: string;
    stage: ContentStage;
    purposeKey: string;
    purposeLabel: string;
    modelId: string;
    version: number;
};

export type ContentModelPromptVersion = {
    promptId: string;
    stage: ContentStage;
    purposeKey: string;
    purposeLabel: string;
    version: number;
    systemPrompt: string;
    active: boolean;
    createdBy: string | null;
    createdAt: string;
    activatedBy: string | null;
    activatedAt: string | null;
};

export type ContentGenerationRun = {
    id: string;
    topicId: string;
    attemptId: string;
    ownerId: string;
    rootNodeId: string;
    resultNodeId: string | null;
    stage: ContentStage;
    mode: "automatic" | "manual";
    status: ContentRunStatus;
    round: number;
    maxRounds: number;
    producerModelId: string | null;
    reviewerModelId: string | null;
    fallbackModelId: string | null;
    currentJobId: string | null;
    generationJobIds: string[];
    outputAssetIds: string[];
    policySnapshot: Record<string, unknown>;
    promptVersion: string | null;
    schemaVersion: string | null;
    modelPromptBindings: ContentModelPromptBinding[];
    inputSnapshot: Record<string, unknown>;
    output: Record<string, unknown>;
    reviews: Array<Record<string, unknown>>;
    hardFail: boolean;
    mediaRetryCount: number;
    mediaRetryLimit: number;
    errorMessage: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    updatedAt: string;
};

export type ContentMediaArtifact = {
    id: string;
    topicId: string;
    attemptId: string;
    nodeId: string;
    runId: string | null;
    assetId: string;
    ownerId: string;
    kind: "image" | "video" | "audio" | "music" | "file";
    source: "ai" | "upload";
    outputIndex: number | null;
    metadata: Record<string, unknown>;
    createdAt: string;
};

export type ContentClipSelection = {
    id: string;
    topicId: string;
    attemptId: string;
    shotNodeId: string;
    artifactId: string;
    selectedBy: string;
    selectedAt: string;
};

export type ContentDeliverySnapshot = {
    id: string;
    topicId: string;
    attemptId: string;
    ownerId: string;
    version: number;
    artifactIds: string[];
    manifest: ContentDeliveryManifest;
    createdAt: string;
};

export type ContentDeliveryManifestClip = {
    artifactId: string;
    assetId: string;
    shotId: string;
    shotNumber: number;
    shotTitle: string;
    take: number;
    source: "ai" | "upload";
    mimeType: string;
    fileName: string;
};

export type ContentDeliveryManifest = {
    schemaVersion: "1.0";
    topic: { id: string; title: string };
    owner: { id: string; name: string };
    createdAt: string;
    clipCount: number;
    clips: ContentDeliveryManifestClip[];
};

export type ContentCompletionVersion = {
    id: string;
    topicId: string;
    attemptId: string;
    ownerId: string;
    version: number;
    finalAssetIds: string[];
    notes: string;
    nodeVersions: Record<string, unknown>;
    selectedArtifactIds: string[];
    deliverySnapshotId: string | null;
    statsSnapshot: Record<string, unknown>;
    createdAt: string;
};

export type ContentInspiration = {
    id: string;
    sourceAssetId: string;
    markedBy: string;
    notes: string;
    analysis: Record<string, unknown>;
    promptVersion: string | null;
    schemaVersion: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ContentActivityEvent = {
    id: number;
    topicId: string | null;
    attemptId: string | null;
    actorId: string;
    eventType: string;
    subjectType: string;
    subjectId: string;
    details: Record<string, unknown>;
    createdAt: string;
};

export type ContentMember = {
    id: string;
    displayName: string;
    username: string;
};

export type ContentStagePolicy = {
    stage: ContentStage;
    capability: "llm" | "image" | "video" | "speech" | "music";
    producerModelId: string | null;
    reviewerModelId: string | null;
    fallbackModelId: string | null;
    validationEnabled: boolean;
    acceptanceRule: Record<string, unknown>;
    maxRounds: number;
    mediaRetryLimit: number;
    promptKey: string;
    promptVersion: string;
    schemaVersion: string;
    updatedBy: string | null;
    updatedAt: string;
};

export type ContentProductionStats = {
    topics: { created: number; currentOwned: number; claimed: number; abandoned: number; completed: number; completionVersions: number; bySource: Record<string, number>; byWorkflow: Record<string, number>; topTags: Record<string, number> };
    generation: { total: number; accepted: number; failed: number; byStage: Record<string, number> };
    media: { total: number; aiClips: number; uploadedClips: number; distribution: Record<string, number> };
    clips: { selected: number; utilization: number };
    efficiency: { averageRuns: number; minimumRuns: number; maximumRuns: number; averageClips: number; minimumClips: number; maximumClips: number };
};
