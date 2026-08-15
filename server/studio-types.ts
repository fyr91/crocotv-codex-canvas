export const STUDIO_SCHEMA_VERSION = 2 as const;
export const STUDIO_MAPPING_VERSION = 2 as const;

export type StudioWorkflowMode = "r2v" | "i2v_legacy";

export type StudioImageVariant = {
  id: string;
  url: string;
  created_at: number;
  prompt_used?: string;
  resource_id?: string;
  is_favorited?: boolean;
};

export type StudioImageAsset = {
  selected_id: string | null;
  variants: StudioImageVariant[];
};

export type StudioNamedEntity = Record<string, unknown> & {
  id: string;
  name: string;
  description: string;
  image_url?: string;
  image_asset?: StudioImageAsset;
  locked?: boolean;
  starred?: boolean;
  status?: string;
};

export type StudioVideoTask = Record<string, unknown> & {
  id: string;
  project_id: string;
  status: string;
  prompt: string;
  image_url: string;
  created_at: number;
  frame_id?: string;
  asset_id?: string;
  video_url?: string;
  resource_id?: string;
  selected?: boolean;
};

export type StudioStoryboardFrame = Record<string, unknown> & {
  id: string;
  title: string;
  prompt: string;
  order: number;
  scene_id?: string;
  image_url?: string;
  image_asset?: StudioImageAsset;
  selectedTakeId?: string;
  selected_video_id?: string;
  audio_url?: string;
  audio_resource_id?: string;
  locked?: boolean;
  status?: string;
};

export type StudioArtDirection = Record<string, unknown> & {
  selected_style_id: string;
  style_config: Record<string, unknown>;
  custom_styles: Array<Record<string, unknown>>;
  ai_recommendations: Array<Record<string, unknown>>;
};

export type StudioDocumentState = {
  content: Record<string, unknown> | null;
  updatedAt?: string;
  snapshots: Array<{ timestamp: number; label?: string; content: Record<string, unknown> }>;
};

export type StudioAssemblyState = {
  orderedFrameIds: string[];
  mergedVideoNodeId?: string;
  mergedVideoUrl?: string;
  mergedVideoResourceId?: string;
  bgmUrl?: string | null;
  bgmResourceId?: string;
  mixSettings?: Record<string, number>;
};

export type StudioPromptBindingSource = "builtin" | "legacy-studio-migration";

export type StudioPromptBinding = {
  templateKey: string;
  templateVersion?: string;
  source: StudioPromptBindingSource;
};

export type StudioProjectPromptVersion = {
  templateKey: string;
  templateVersion: string;
  systemPrompt: string;
  systemPromptSha256: string;
  source: "legacy-studio-migration";
  createdAt: string;
};

export type StudioGenerationExecution = {
  id: string;
  operation: string;
  templateKey: string;
  templateVersion: string;
  systemPromptSha256: string;
  systemPromptNodeIds: string[];
  model: string;
  sourceNodeIds: string[];
  imageResourceIds: string[];
  videoResourceIds: string[];
  audioResourceIds: string[];
  outputNodeIds: string[];
  createdAt: string;
};

export type StudioProjectState = {
  schemaVersion: typeof STUDIO_SCHEMA_VERSION;
  mappingVersion: typeof STUDIO_MAPPING_VERSION;
  source: "lumenx-studio";
  projectKind: "episode" | "series" | "playground";
  originalText: string;
  workflowMode: StudioWorkflowMode;
  status: string;
  starred: boolean;
  seriesId?: string;
  episodeNumber?: number;
  aspectRatio?: string;
  stylePreset?: string;
  stylePrompt?: string;
  artDirection?: StudioArtDirection;
  modelSettings: Record<string, unknown>;
  promptConfig: Record<string, string>;
  promptBindings: Record<string, StudioPromptBinding>;
  projectPromptVersions: StudioProjectPromptVersion[];
  generationExecutions: StudioGenerationExecution[];
  characters: StudioNamedEntity[];
  scenes: StudioNamedEntity[];
  props: StudioNamedEntity[];
  frames: StudioStoryboardFrame[];
  videoTasks: StudioVideoTask[];
  assembly: StudioAssemblyState;
  document: StudioDocumentState;
  nextHook?: string | null;
  lastEpisodeSummary?: string | null;
  metadata: Record<string, unknown>;
};

export type StudioMappingEntityType = "script" | "art-direction" | "character" | "scene" | "prop" | "frame" | "take" | "audio" | "assembly";

export type StudioMappingMetadata = {
  studioManaged: true;
  studioEntityType: StudioMappingEntityType;
  studioEntityId: string;
  studioRole: string;
  studioMappingVersion: typeof STUDIO_MAPPING_VERSION;
};

export type StudioBackedProject = Record<string, unknown> & {
  id: string;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  nodes: Array<{ id: string; type: string; title?: string; position?: { x: number; y: number }; width?: number; height?: number; metadata?: Record<string, unknown> }>;
  connections: Array<{ id: string; fromNodeId: string; toNodeId: string; fromPort?: string; toPort?: string }>;
  studio?: StudioProjectState;
};
