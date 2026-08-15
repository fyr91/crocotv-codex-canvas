import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { STUDIO_MAPPING_VERSION, STUDIO_SCHEMA_VERSION, type StudioProjectState, type StudioWorkflowMode } from "./studio-types";

const boundedId = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
const looseRecord = z.record(z.string(), z.unknown());
const imageVariantSchema = z.object({
  id: boundedId,
  url: z.string().max(20_000),
  created_at: z.number(),
  prompt_used: z.string().max(20_000).optional(),
  resource_id: boundedId.optional(),
  is_favorited: z.boolean().optional(),
}).passthrough();
const imageAssetSchema = z.object({ selected_id: boundedId.nullable(), variants: z.array(imageVariantSchema).max(1_000) }).passthrough();
const namedEntitySchema = z.object({
  id: boundedId,
  name: z.string().trim().min(1).max(180),
  description: z.string().max(100_000).default(""),
  image_url: z.string().max(20_000).optional(),
  image_asset: imageAssetSchema.optional(),
  locked: z.boolean().optional(),
  starred: z.boolean().optional(),
  status: z.string().max(80).optional(),
}).passthrough();
const storyboardFrameSchema = z.object({
  id: boundedId,
  title: z.string().trim().min(1).max(180),
  prompt: z.string().max(100_000).default(""),
  order: z.number().int().min(0).max(100_000),
  scene_id: boundedId.optional(),
  image_url: z.string().max(20_000).optional(),
  image_asset: imageAssetSchema.optional(),
  selectedTakeId: boundedId.optional(),
  selected_video_id: boundedId.optional(),
  audio_url: z.string().max(20_000).optional(),
  audio_resource_id: boundedId.optional(),
  locked: z.boolean().optional(),
  status: z.string().max(80).optional(),
}).passthrough();
const videoTaskSchema = z.object({
  id: boundedId,
  project_id: boundedId,
  status: z.string().max(80),
  prompt: z.string().max(100_000).default(""),
  image_url: z.string().max(20_000).default(""),
  created_at: z.number(),
  frame_id: boundedId.optional(),
  asset_id: boundedId.optional(),
  video_url: z.string().max(20_000).optional(),
  resource_id: boundedId.optional(),
  selected: z.boolean().optional(),
}).passthrough();
const artDirectionSchema = z.object({
  selected_style_id: z.string().max(180),
  style_config: looseRecord,
  custom_styles: z.array(looseRecord).max(1_000),
  ai_recommendations: z.array(looseRecord).max(1_000),
}).passthrough();
const assemblySchema = z.object({
  orderedFrameIds: z.array(boundedId).max(10_000),
  mergedVideoNodeId: boundedId.optional(),
  mergedVideoUrl: z.string().max(20_000).optional(),
  mergedVideoResourceId: boundedId.optional(),
  bgmUrl: z.string().max(20_000).nullable().optional(),
  bgmResourceId: boundedId.optional(),
  mixSettings: z.record(z.string(), z.number()).optional(),
}).passthrough();
const documentSchema = z.object({
  content: looseRecord.nullable(),
  updatedAt: z.string().optional(),
  snapshots: z.array(z.object({ timestamp: z.number(), label: z.string().max(180).optional(), content: looseRecord })).max(500),
}).strict();
const promptBindingSchema = z.object({
  templateKey: z.string().min(1).max(100),
  templateVersion: z.string().max(80).optional(),
  source: z.enum(["builtin", "legacy-studio-migration"]),
}).strict();
const projectPromptVersionSchema = z.object({
  templateKey: z.string().min(1).max(100),
  templateVersion: z.string().min(1).max(80),
  systemPrompt: z.string().min(1).max(250_000),
  systemPromptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.literal("legacy-studio-migration"),
  createdAt: z.string().min(1).max(80),
}).strict();
const generationExecutionSchema = z.object({
  id: boundedId,
  operation: z.string().min(1).max(100),
  templateKey: z.string().min(1).max(100),
  templateVersion: z.string().min(1).max(80),
  systemPromptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  systemPromptNodeIds: z.array(boundedId).max(10),
  model: z.string().min(1).max(100),
  sourceNodeIds: z.array(boundedId).max(100),
  imageResourceIds: z.array(boundedId).max(16),
  videoResourceIds: z.array(boundedId).max(16),
  audioResourceIds: z.array(boundedId).max(16),
  outputNodeIds: z.array(boundedId).max(20),
  createdAt: z.string().min(1).max(80),
}).strict();

export const studioProjectStateSchema = z.object({
  schemaVersion: z.literal(STUDIO_SCHEMA_VERSION),
  mappingVersion: z.literal(STUDIO_MAPPING_VERSION),
  source: z.literal("lumenx-studio"),
  projectKind: z.enum(["episode", "series", "playground"]),
  originalText: z.string().max(1_000_000),
  workflowMode: z.enum(["r2v", "i2v_legacy"]),
  status: z.string().max(80),
  starred: z.boolean(),
  seriesId: boundedId.optional(),
  episodeNumber: z.number().int().positive().optional(),
  aspectRatio: z.string().max(40).optional(),
  stylePreset: z.string().max(180).optional(),
  stylePrompt: z.string().max(100_000).optional(),
  artDirection: artDirectionSchema.optional(),
  modelSettings: looseRecord,
  promptConfig: z.record(z.string(), z.string()),
  promptBindings: z.record(z.string(), promptBindingSchema).default({}),
  projectPromptVersions: z.array(projectPromptVersionSchema).max(100).default([]),
  generationExecutions: z.array(generationExecutionSchema).max(500).default([]),
  characters: z.array(namedEntitySchema).max(10_000),
  scenes: z.array(namedEntitySchema).max(10_000),
  props: z.array(namedEntitySchema).max(10_000),
  frames: z.array(storyboardFrameSchema).max(10_000),
  videoTasks: z.array(videoTaskSchema).max(10_000),
  assembly: assemblySchema,
  document: documentSchema,
  nextHook: z.string().max(100_000).nullable().optional(),
  lastEpisodeSummary: z.string().max(100_000).nullable().optional(),
  metadata: looseRecord,
}).strict();

export const createStudioProjectSchema = z.object({
  title: z.string().trim().min(1).max(180),
  text: z.string().max(1_000_000).default(""),
  workflow_mode: z.enum(["r2v", "i2v_legacy"]).default("r2v"),
  series_id: boundedId.optional(),
  episode_number: z.number().int().positive().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const updateStudioScriptSchema = z.object({
  text: z.string().max(1_000_000),
  expectedVersion: z.number().int().positive().optional(),
}).passthrough();

export function newStudioProjectState(originalText = "", workflowMode: StudioWorkflowMode = "r2v"): StudioProjectState {
  return studioProjectStateSchema.parse({
    schemaVersion: STUDIO_SCHEMA_VERSION,
    mappingVersion: STUDIO_MAPPING_VERSION,
    source: "lumenx-studio",
    projectKind: "episode",
    originalText,
    workflowMode,
    status: "ready",
    starred: false,
    modelSettings: {},
    promptConfig: {},
    promptBindings: defaultPromptBindings(),
    projectPromptVersions: [],
    generationExecutions: [],
    characters: [],
    scenes: [],
    props: [],
    frames: [],
    videoTasks: [],
    assembly: { orderedFrameIds: [] },
    document: { content: null, snapshots: [] },
    metadata: {},
  });
}

export function parseStudioProjectState(value: unknown): StudioProjectState {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (input.schemaVersion === STUDIO_SCHEMA_VERSION) return studioProjectStateSchema.parse(migratePromptConfig(input));
  const legacy = input as Record<string, any>;
  return studioProjectStateSchema.parse(migratePromptConfig({
    ...newStudioProjectState(String(legacy.originalText || ""), legacy.workflowMode === "i2v_legacy" ? "i2v_legacy" : "r2v"),
    promptConfig: stringRecord(legacy.promptConfig),
    modelSettings: objectRecord(legacy.modelSettings),
    metadata: objectRecord(legacy.metadata),
    characters: normalizeLegacyEntities(legacy.characters),
    scenes: normalizeLegacyEntities(legacy.scenes),
    props: normalizeLegacyEntities(legacy.props),
    frames: Array.isArray(legacy.frames) ? legacy.frames.map((frame: any, index: number) => ({ ...frame, id: cleanId(frame?.id), title: String(frame?.title || `镜头 ${index + 1}`), prompt: String(frame?.prompt || ""), order: Number.isInteger(frame?.order) ? frame.order : index })) : [],
    assembly: { orderedFrameIds: Array.isArray(legacy.assembly?.orderedFrameIds) ? legacy.assembly.orderedFrameIds : [], ...(legacy.assembly?.mergedVideoNodeId ? { mergedVideoNodeId: legacy.assembly.mergedVideoNodeId } : {}) },
  }));
}

export const STUDIO_PROMPT_TEMPLATE_MAP = {
  entity_extraction: "croco.p3.production-design",
  style_analysis: "croco.p3.art-direction-options",
  storyboard_extraction: "croco.p4.director-planning",
  storyboard_polish: "croco.p4.shot-revision",
  video_polish: "croco.h3.universal-ref2va",
  r2v_polish: "croco.h3.universal-ref2va",
} as const;

function defaultPromptBindings() {
  return Object.fromEntries(Object.entries(STUDIO_PROMPT_TEMPLATE_MAP).map(([operation, templateKey]) => [operation, { templateKey, source: "builtin" as const }]));
}

function migratePromptConfig(input: Record<string, unknown>) {
  const promptConfig = input.promptConfig && typeof input.promptConfig === "object" && !Array.isArray(input.promptConfig) ? input.promptConfig as Record<string, unknown> : {};
  const bindings = { ...defaultPromptBindings(), ...(input.promptBindings && typeof input.promptBindings === "object" && !Array.isArray(input.promptBindings) ? input.promptBindings as Record<string, any> : {}) };
  const versions = Array.isArray(input.projectPromptVersions) ? [...input.projectPromptVersions] as Array<Record<string, unknown>> : [];
  for (const [operation, templateKey] of Object.entries(STUDIO_PROMPT_TEMPLATE_MAP)) {
    const custom = typeof promptConfig[operation] === "string" ? promptConfig[operation] as string : "";
    if (!custom) continue;
    const systemPromptSha256 = createHash("sha256").update(custom, "utf8").digest("hex");
    const templateVersion = `0.0.0-legacy.${systemPromptSha256.slice(0, 12)}`;
    if (!versions.some((version) => version.templateKey === templateKey && version.templateVersion === templateVersion)) {
      versions.push({ templateKey, templateVersion, systemPrompt: custom, systemPromptSha256, source: "legacy-studio-migration", createdAt: "legacy-studio-migration" });
    }
    bindings[operation] = { templateKey, templateVersion, source: "legacy-studio-migration" };
  }
  return { ...input, promptBindings: bindings, projectPromptVersions: versions, generationExecutions: Array.isArray(input.generationExecutions) ? input.generationExecutions : [] };
}

function normalizeLegacyEntities(value: unknown) {
  return Array.isArray(value) ? value.map((entity) => ({ ...entity, id: cleanId(entity?.id), name: String(entity?.name || "未命名"), description: String(entity?.description || "") })) : [];
}

function cleanId(value: unknown) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(text) ? text : randomUUID();
}

function objectRecord(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringRecord(value: unknown) { return Object.fromEntries(Object.entries(objectRecord(value)).filter(([, item]) => typeof item === "string")) as Record<string, string>; }
