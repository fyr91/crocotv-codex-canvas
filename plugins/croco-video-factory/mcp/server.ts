#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { avoidMcpNodeOverlaps } from "./node-placement";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = findPluginRoot(moduleDirectory);
const bundleManifest = JSON.parse(readFileSync(path.join(pluginRoot, "bundle-manifest.json"), "utf8"));
const workspaceRoot = path.resolve(process.env.CROCOTV_HOME || process.cwd());
const apiOrigin = process.env.CROCO_LOCAL_API_ORIGIN || "http://127.0.0.1:4399";
const webOrigin = process.env.CROCO_LOCAL_WEB_ORIGIN || "http://localhost:3000";
const studioOrigin = process.env.CROCO_LOCAL_STUDIO_ORIGIN || "http://localhost:3010";
const mcpClientId = `mcp-${process.pid}`;

const server = new McpServer({ name: "crocotv", version: bundleManifest.mcpVersion }, {
  instructions: "Croco Canvas is a local visual canvas. Read the project before editing it. Prefer canvas_apply_operations for atomic free-Canvas changes, use temporary refs to connect nodes created in the same call, and never edit project.json directly. Studio-backed projects retain their five-stage Studio workflow; use Studio domain tools or studio_apply_canvas_edits for Studio-managed nodes so changes translate through structured Studio state. Use canvas_create_project when a new free canvas is requested and studio_create_project for a Video Workshop project. For new Canvas-provider generation work, construct and connect generation-module nodes, then call canvas_run_nodes so the workflow remains visible and reproducible; do not bypass the graph with legacy direct generation tools. The bundled catalog is fixed in this code release and does not discover scheduler inventory at runtime. GPU-backed models are MiniMax H3 and LTX 2.5 for video, ERNIE Image Turbo for text-to-image, and FlashVSR for eligible H3 result enhancement. MiniMax H3 text, first-frame, ordered first/last-frame, and multimodal modes use the shared structured H3 prompt optimizer. LTX 2.5 supports text, one first frame, or one Ingredients reference sheet and does not use the H3 optimizer. Reference video and video editing are currently unavailable. When Codex built-in ImageGen has already produced a GPT image, use canvas_place_imagegen_result to import it and preserve Prompt/Reference provenance without fabricating a provider Config. Generated or imported files must enter the local resource library before being placed on a canvas.",
});

const positionSchema = z.object({ x: z.number(), y: z.number() });
const metadataSchema = z.record(z.string(), z.unknown());
const generationParamsSchema = z.object({
  duration: z.number().int().min(3).max(20).optional(),
  quality: z.string().max(40).optional(),
  ratio: z.string().max(20).optional(),
  imageResourceIds: z.array(z.string().min(1).max(180)).max(9).optional(),
  videoResourceIds: z.array(z.string().min(1).max(180)).max(1).optional(),
  audioResourceIds: z.array(z.string().min(1).max(180)).max(3).optional(),
  inputMode: z.enum(["text", "firstFrame", "firstLastFrame", "multimodal"]).optional(),
  optimizePrompt: z.boolean().optional().describe("Defaults to true. For H3 this controls structured prompt optimization; for LTX it maps to enhance_prompt."),
  referenceStrength: z.number().min(0.1).max(1.5).optional(),
  seed: z.number().int().nonnegative().optional(),
}).catchall(z.unknown());
const connectionPortSchema = z.enum(["node", "workflow-input", "workflow-output"]);
const generationCapabilitySchema = z.enum(["text", "image", "video", "speech", "music"]);
const generationTaskSchema = z.object({
  taskId: z.string().min(1).max(80).optional(),
  targetNodeId: z.string().min(1).max(80).optional(),
  capability: generationCapabilitySchema,
  prompt: z.string().min(1),
  model: z.string().optional(),
  title: z.string().max(180).optional(),
  position: positionSchema.optional(),
  voiceId: z.string().optional(),
  params: generationParamsSchema.optional(),
});
const nodeSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  type: z.enum(["text", "image", "video", "audio", "music", "config", "split", "group", "comment"]),
  title: z.string().max(180).optional(),
  position: positionSchema.optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  locked: z.boolean().optional(),
  metadata: metadataSchema.optional(),
});
const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_node"), ref: z.string().min(1).max(80).optional(), node: nodeSchema }),
  z.object({ op: z.literal("update_node"), nodeId: z.string().min(1), patch: z.object({ title: z.string().max(180).optional(), position: positionSchema.optional(), width: z.number().positive().optional(), height: z.number().positive().optional(), locked: z.boolean().optional(), metadata: metadataSchema.optional() }) }),
  z.object({ op: z.literal("delete_node"), nodeId: z.string().min(1) }),
  z.object({ op: z.literal("connect"), ref: z.string().min(1).max(80).optional(), from: z.string().min(1), to: z.string().min(1), fromPort: connectionPortSchema.optional(), toPort: connectionPortSchema.optional() }),
  z.object({ op: z.literal("disconnect"), connectionId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }),
  z.object({ op: z.literal("rename_project"), title: z.string().min(1).max(180) }),
  z.object({ op: z.literal("set_viewport"), viewport: z.object({ x: z.number(), y: z.number(), k: z.number().positive() }) }),
]);
const shotColumnLayoutSchema = z.object({
  origin: positionSchema.optional(),
  groupPadding: z.number().min(24).max(120).optional(),
  nodeGap: z.number().min(16).max(200).optional(),
  sectionGap: z.number().min(16).max(280).optional(),
  columnGap: z.number().min(48).max(400).optional(),
  preserveManualLayout: z.boolean().default(true),
});
const studioEntitySchema = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(180),
  description: z.string().max(100_000).default(""),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
const studioFrameSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(180).optional(),
  prompt: z.string().max(100_000),
  sceneId: z.string().min(1).max(80).optional(),
  duration: z.number().min(1).max(30).optional(),
  dialogue: z.string().max(20_000).optional(),
  characterIds: z.array(z.string().min(1).max(80)).max(100).optional(),
});
const studioCanvasEditSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update_node"), nodeId: z.string().min(1).max(80), content: z.string().max(1_000_000).optional(), title: z.string().max(180).optional(), metadata: metadataSchema.optional() }),
  z.object({ op: z.literal("delete_node"), nodeId: z.string().min(1).max(80) }),
  z.object({ op: z.literal("connect"), fromNodeId: z.string().min(1).max(80), toNodeId: z.string().min(1).max(80), fromPort: connectionPortSchema.optional(), toPort: connectionPortSchema.optional() }),
  z.object({ op: z.literal("disconnect"), connectionId: z.string().min(1).max(80) }),
]);
const studioPromptOperationSchema = z.enum(["entity_extraction", "style_analysis", "storyboard_extraction", "storyboard_polish", "video_polish", "r2v_polish"]);
const studioPromptResourceRoleSchema = z.object({
  resourceId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  role: z.string().min(1).max(80),
});

server.registerTool("canvas_start_local_service", {
  description: "Start the local CrocoTV API and web app if they are not already running. Safe to call repeatedly.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => toolResult(await ensureLocalService(true)));

server.registerTool("canvas_get_service_status", {
  description: "Check whether the local CrocoTV API and web app are running.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => toolResult(await serviceStatus()));

server.registerTool("canvas_create_project", {
  description: "Create a new local CrocoTV canvas. Each canvas gets its own project folder.",
  inputSchema: { title: z.string().min(1).max(80).default("未命名画布") },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ title }) => {
  const project = await api<Record<string, unknown>>("/api/projects", { method: "POST", body: { title } });
  return toolResult({ project, canvasUrl: `${webOrigin}/canvas/${project.id}` });
});

server.registerTool("studio_create_project", {
  description: "Create one Studio-backed Croco project. The Studio structured state and its managed Canvas Script nodes share the same project ID, atomic version, storage folder, and live update stream.",
  inputSchema: {
    title: z.string().min(1).max(180),
    text: z.string().max(1_000_000).default(""),
    workflowMode: z.enum(["r2v", "i2v_legacy"]).default("r2v"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ title, text, workflowMode }) => {
  const project = await api<Record<string, unknown>>("/api/studio/projects", { method: "POST", body: { title, text, workflow_mode: workflowMode } });
  return toolResult({ project, canvasUrl: `${webOrigin}/canvas/${project.id}`, studioUrl: `${studioOrigin}/#/project/${project.id}` });
});

server.registerTool("studio_get_project", {
  description: "Read the structured Studio projection for a Studio-backed Canvas project, including its shared project version.",
  inputSchema: { projectId: z.string().uuid() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectId }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}`)));

server.registerTool("studio_list_asset_sources", {
  description: "List Studio character, scene, and prop records grouped by their Studio business source: series, standalone project, or episode. This does not filter the Canvas-wide local resource library.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => toolResult(await api("/api/studio/asset-sources")));

server.registerTool("studio_list_prompt_templates", {
  description: "List the authoritative versioned Croco Prompt Registry used by Video Workshop and Canvas runtimes. Returns metadata, hashes, model policy, and input modes without exposing or duplicating prompt bodies in browser storage.",
  inputSchema: { includeLegacy: z.boolean().default(false), includeInactive: z.boolean().default(false) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ includeLegacy, includeInactive }) => toolResult(await api(`/api/studio/prompt-registry?include_legacy=${includeLegacy}&include_inactive=${includeInactive}`)));

server.registerTool("studio_get_prompt_template", {
  description: "Read one exact immutable Prompt Registry version, including its complete System Prompt, SHA-256, model policy, and input/output contract. Omit templateVersion to read the currently active global version.",
  inputSchema: { templateKey: z.string().min(1).max(100).regex(/^croco\.[a-z0-9][a-z0-9.-]+$/), templateVersion: z.string().min(1).max(80).optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ templateKey, templateVersion }) => {
  const query = templateVersion ? `?version=${encodeURIComponent(templateVersion)}` : "";
  return toolResult(await api(`/api/studio/prompt-registry/${encodeURIComponent(templateKey)}${query}`));
});

server.registerTool("studio_create_global_prompt_version", {
  description: "Create a new immutable global Prompt Registry version from an existing version. Historical versions are never overwritten or deleted. Optionally activate the new version for future executions that follow global.",
  inputSchema: {
    templateKey: z.string().min(1).max(100).regex(/^croco\.[a-z0-9][a-z0-9.-]+$/),
    baseVersion: z.string().min(1).max(80).optional(),
    systemPrompt: z.string().min(1).max(250_000),
    defaultModel: z.string().min(1).max(100).optional(),
    activate: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ templateKey, ...body }) => toolResult(await api(`/api/studio/prompt-registry/${encodeURIComponent(templateKey)}/versions`, { method: "POST", body })));

server.registerTool("studio_activate_global_prompt_version", {
  description: "Switch the global active pointer to an existing immutable Prompt Registry version. No version is modified or deleted; in-flight executions and pinned projects remain unchanged.",
  inputSchema: { templateKey: z.string().min(1).max(100).regex(/^croco\.[a-z0-9][a-z0-9.-]+$/), templateVersion: z.string().min(1).max(80) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ templateKey, templateVersion }) => toolResult(await api(`/api/studio/prompt-registry/${encodeURIComponent(templateKey)}/activate`, { method: "POST", body: { templateVersion } })));

server.registerTool("studio_get_project_prompt_strategy", {
  description: "Read a Studio project's Prompt bindings, effective versions, global version history, and immutable project version history for all structured Prompt operations.",
  inputSchema: { projectId: z.string().uuid() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectId }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/prompt-strategy`)));

server.registerTool("studio_create_project_prompt_version", {
  description: "Create a new immutable project-scoped Prompt version for one Studio operation. Historical project versions remain available. By default the new version is activated only for this project.",
  inputSchema: {
    projectId: z.string().uuid(),
    operation: studioPromptOperationSchema,
    baseVersion: z.string().min(1).max(80).optional(),
    systemPrompt: z.string().min(1).max(250_000),
    activate: z.boolean().default(true),
    expectedVersion: z.number().int().positive().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, operation, ...body }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/prompt-strategy/${encodeURIComponent(operation)}/versions`, { method: "POST", body })));

server.registerTool("studio_set_project_prompt_binding", {
  description: "Atomically switch one Studio operation to follow the global active version, pin an exact immutable global version, or use an exact immutable project version. No historical version is deleted.",
  inputSchema: {
    projectId: z.string().uuid(),
    operation: studioPromptOperationSchema,
    mode: z.enum(["follow_global", "pin_global", "project"]),
    templateVersion: z.string().min(1).max(80).optional(),
    expectedVersion: z.number().int().positive().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectId, operation, ...body }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/prompt-strategy/${encodeURIComponent(operation)}/binding`, { method: "PUT", body })));

server.registerTool("studio_get_model_catalog", {
  description: "Read the authoritative fixed Croco model/provider catalog bundled with this release. It is not a live scheduler inventory. GPU models include MiniMax H3, LTX 2.5, ERNIE Image Turbo, and the FlashVSR enhancement capability, each with model-specific inputs and parameters.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => toolResult(await api("/api/studio/model-catalog")));

server.registerTool("studio_list_provider_status", {
  description: "Read masked local provider credential status for the shared Croco runtime. Never returns complete secrets.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => toolResult(await api("/api/studio/config/secrets")));

server.registerTool("studio_apply_canvas_edits", {
  description: "Atomically translate Canvas-side edits of Studio-managed nodes into structured Studio state, then regenerate the deterministic managed projection while preserving free Canvas nodes. Use this instead of canvas_apply_operations for Studio-managed content, titles, configuration, entity/frame deletion, or connections. Fixed five-stage workflow connections cannot be removed.",
  inputSchema: { projectId: z.string().uuid(), expectedVersion: z.number().int().positive().optional(), edits: z.array(studioCanvasEditSchema).min(1).max(100) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, expectedVersion, edits }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/canvas-edits`, { method: "POST", body: { expectedVersion, edits } })));

server.registerTool("studio_execute_prompt", {
  description: "Execute one structured Video Workshop Prompt Registry operation through its dedicated managed Canvas Config node and the shared Canvas runtime. Supports an explicit templateKey, feedback, previous Chinese version, target duration, and ordered local resource references. The call records immutable prompt/input snapshots and can invoke configured external providers and incur cost; use Studio domain tools separately when the returned text should update business state.",
  inputSchema: {
    projectId: z.string().uuid(),
    operation: studioPromptOperationSchema,
    templateKey: z.string().min(1).max(100).regex(/^[a-z0-9._-]+$/).optional(),
    draftPrompt: z.string().min(1).max(100_000),
    feedback: z.string().max(100_000).optional(),
    previousChinese: z.string().max(100_000).optional(),
    targetDurationSeconds: z.number().int().min(3).max(15).optional(),
    frameId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/).optional(),
    orderedResources: z.array(studioPromptResourceRoleSchema).max(16).default([]),
    requestedModel: z.string().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ projectId, operation, templateKey, draftPrompt, feedback, previousChinese, targetDurationSeconds, frameId, orderedResources, requestedModel }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/prompt-executions`, {
  method: "POST",
  body: {
    operation,
    templateKey,
    draftPrompt,
    feedback,
    prevCn: previousChinese,
    targetDurationSeconds,
    frameId,
    ordered_resource_ids: orderedResources.map((resource) => resource.resourceId),
    resource_roles: orderedResources,
    requestedModel,
  },
})));

server.registerTool("studio_list_prompt_executions", {
  description: "List immutable Video Workshop prompt execution records and their current Canvas result nodes, including prompt version/hash, model, ordered source/resource IDs, project version, status, local resource ID, and bounded text content.",
  inputSchema: {
    projectId: z.string().uuid(),
    executionId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/).optional(),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectId, executionId, limit }) => {
  const query = new URLSearchParams({ limit: String(limit) });
  if (executionId) query.set("execution_id", executionId);
  return toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/prompt-executions?${query}`));
});

server.registerTool("studio_set_script", {
  description: "Replace the Studio source script, regenerate its compatible structured editor document, and atomically update the stable managed Canvas Text node without touching free Canvas nodes.",
  inputSchema: { projectId: z.string().uuid(), text: z.string().max(1_000_000), expectedVersion: z.number().int().positive().optional() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ projectId, text, expectedVersion }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/text`, { method: "PUT", body: { text, expectedVersion } })));

server.registerTool("studio_get_script_document", {
  description: "Read the structured LumenX script document plus its compatible plain text and shared project version.",
  inputSchema: { projectId: z.string().uuid() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectId }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/document`)));

server.registerTool("studio_set_script_document", {
  description: "Atomically replace the structured LumenX script document and its compatible plain-text projection. This increments the shared project version and updates Studio-managed Canvas nodes.",
  inputSchema: {
    projectId: z.string().uuid(),
    content: z.record(z.string(), z.unknown()),
    plainText: z.string().max(1_000_000),
    createSnapshot: z.boolean().default(false),
    derivation: z.record(z.string(), z.unknown()).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ projectId, content, plainText, createSnapshot, derivation }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/document`, {
  method: "POST",
  body: { content, plain_text: plainText, create_snapshot: createSnapshot, derivation },
})));

server.registerTool("studio_set_art_direction", {
  description: "Atomically save the selected Studio Art Direction and update its managed Canvas projection. The style remains structured Studio state, not free-form Canvas metadata.",
  inputSchema: {
    projectId: z.string().uuid(),
    selectedStyleId: z.string().min(1).max(180),
    styleConfig: z.record(z.string(), z.unknown()),
    customStyles: z.array(z.record(z.string(), z.unknown())).max(100).default([]),
    recommendations: z.array(z.record(z.string(), z.unknown())).max(100).default([]),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ projectId, selectedStyleId, styleConfig, customStyles, recommendations }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/art_direction/save`, { method: "POST", body: { selected_style_id: selectedStyleId, style_config: styleConfig, custom_styles: customStyles, ai_recommendations: recommendations } })));

server.registerTool("studio_upsert_asset", {
  description: "Create or structurally update one Studio character, scene, or prop. Its deterministic managed Canvas nodes and stage connections are updated atomically.",
  inputSchema: { projectId: z.string().uuid(), assetType: z.enum(["character", "scene", "prop"]), asset: studioEntitySchema },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, assetType, asset }) => {
  const plural = assetType === "character" ? "characters" : assetType === "scene" ? "scenes" : "props";
  const path = asset.id
    ? `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${assetType}/${encodeURIComponent(asset.id)}`
    : `/api/studio/projects/${encodeURIComponent(projectId)}/${plural}`;
  return toolResult(await api(path, { method: asset.id ? "PUT" : "POST", body: { name: asset.name, description: asset.description, ...(asset.attributes || {}) } }));
});

server.registerTool("studio_set_storyboard", {
  description: "Atomically replace the structured Studio storyboard and project it into deterministic managed Canvas frame/config nodes while preserving free Canvas nodes.",
  inputSchema: { projectId: z.string().uuid(), frames: z.array(studioFrameSchema).max(2_000) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ projectId, frames }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/storyboard`, { method: "PUT", body: { frames: frames.map((frame, order) => ({ id: frame.id, title: frame.title || `镜头 ${order + 1}`, prompt: frame.prompt, scene_id: frame.sceneId, duration: frame.duration, dialogue: frame.dialogue, character_ids: frame.characterIds, order })) } })));

server.registerTool("studio_run_stage", {
  description: "Run one high-level Studio stage through Croco Canvas generation-module nodes and the shared runtime. The extract_entities stage makes one DeepSeek V4 Flash call with thinking disabled and atomically saves that result. Other generation calls may use configured external providers and can incur cost. Read the project after each stage before deciding the next one.",
  inputSchema: { projectId: z.string().uuid(), stage: z.enum(["extract_entities", "analyze_art_direction", "analyze_storyboard", "generate_assets", "render_storyboard", "generate_videos", "generate_audio", "merge"]) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
}, async ({ projectId, stage }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/run-stage`, { method: "POST", body: { stage } })));

server.registerTool("studio_generate_asset_video", {
  description: "Queue a Cast character/scene/prop motion-reference video through the shared Canvas H3 runtime. Returns immediately with _task_id and _generation_job; poll studio_get_generation_job until it reaches a terminal state. This can call the configured external video provider and incur cost.",
  inputSchema: {
    projectId: z.string().uuid(),
    assetType: z.enum(["character", "scene", "prop"]),
    assetId: z.string().min(1).max(80),
    prompt: z.string().max(20_000).optional(),
    duration: z.number().int().min(3).max(15).default(5),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
}, async ({ projectId, assetType, assetId, prompt, duration }) => toolResult(await api(`/api/studio/projects/${encodeURIComponent(projectId)}/assets/generate_motion_ref`, { method: "POST", body: { asset_type: assetType, asset_id: assetId, prompt, duration, batch_size: 1 } })));

server.registerTool("studio_get_generation_job", {
  description: "Read the persisted status and result metadata of an asynchronous Studio generation job.",
  inputSchema: { jobId: z.string().uuid() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ jobId }) => toolResult(await api(`/api/studio/generation-jobs/${encodeURIComponent(jobId)}`)));

server.registerTool("studio_cancel_generation_job", {
  description: "Cancel a queued or running Studio generation job. Completed, failed, or already-cancelled jobs are returned unchanged.",
  inputSchema: { jobId: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ jobId }) => toolResult(await api(`/api/studio/generation-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" })));

server.registerTool("studio_control_workflow", {
  description: "Control local Studio storyboard and assembly decisions without UI clicks: select a take, extract a last frame, preview/apply/revert dialogue dub, choose local BGM and mix levels, or merge the project.",
  inputSchema: {
    projectId: z.string().uuid(),
    action: z.enum(["select_video", "auto_select_video", "extract_last_frame", "preview_dub", "apply_dub", "revert_dub", "set_audio_mix", "merge"]),
    frameId: z.string().min(1).max(80).optional(),
    videoTaskId: z.string().min(1).max(80).optional(),
    offsetMs: z.number().int().min(-60_000).max(60_000).default(0),
    bgmResourceId: z.string().min(1).max(80).nullable().optional(),
    dialogueVolume: z.number().min(0).max(200).optional(),
    bgmVolume: z.number().min(0).max(200).optional(),
    sfxVolume: z.number().min(0).max(200).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, action, frameId, videoTaskId, offsetMs, bgmResourceId, dialogueVolume, bgmVolume, sfxVolume }) => {
  const project = encodeURIComponent(projectId);
  const frame = frameId ? encodeURIComponent(frameId) : "";
  const requireFrame = () => { if (!frame) throw new Error(`${action} 需要 frameId`); return frame; };
  const requireTask = () => { if (!videoTaskId) throw new Error(`${action} 需要 videoTaskId`); return videoTaskId; };
  if (action === "select_video") return toolResult(await api(`/api/studio/projects/${project}/frames/${requireFrame()}/select_video`, { method: "POST", body: { video_id: requireTask() } }));
  if (action === "auto_select_video") return toolResult(await api(`/api/studio/projects/${project}/frames/${requireFrame()}/auto_select_latest_video`, { method: "POST", body: {} }));
  if (action === "extract_last_frame") return toolResult(await api(`/api/studio/projects/${project}/frames/${requireFrame()}/extract_last_frame`, { method: "POST", body: { video_task_id: requireTask() } }));
  if (action === "preview_dub") return toolResult(await api(`/api/studio/projects/${project}/frames/${requireFrame()}/dub/preview`, { method: "POST", body: { video_task_id: requireTask(), offset_ms: offsetMs } }));
  if (action === "apply_dub") return toolResult(await api(`/api/studio/projects/${project}/frames/${requireFrame()}/dub/apply`, { method: "POST", body: {} }));
  if (action === "revert_dub") return toolResult(await api(`/api/studio/projects/${project}/frames/${requireFrame()}/dub`, { method: "DELETE" }));
  if (action === "set_audio_mix") return toolResult(await api(`/api/studio/projects/${project}/audio_mix`, { method: "PUT", body: { bgm_url: bgmResourceId ? `/files/by-id/${bgmResourceId}` : bgmResourceId, dialogue_volume: dialogueVolume, bgm_volume: bgmVolume, sfx_volume: sfxVolume } }));
  return toolResult(await api(`/api/studio/projects/${project}/merge`, { method: "POST", body: {} }));
});

server.registerTool("canvas_list_projects", {
  description: "List all local CrocoTV canvases with IDs, names, update times, and node counts.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => toolResult(await api("/api/projects")));

server.registerTool("canvas_get_project", {
  description: "Read a complete local canvas snapshot before changing nodes or connections.",
  inputSchema: { projectId: z.string().uuid() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectId }) => toolResult(await api(`/api/projects/${encodeURIComponent(projectId)}`)));

server.registerTool("canvas_query_nodes", {
  description: "Read a bounded subset of Canvas nodes by ID, node type, artifactType, or production stage without loading the complete project document.",
  inputSchema: {
    projectId: z.string().uuid(), nodeIds: z.array(z.string().min(1).max(80)).max(100).optional(),
    types: z.array(z.enum(["text", "image", "video", "audio", "music", "config", "split", "group", "comment"])).max(9).optional(),
    artifactTypes: z.array(z.string().min(1).max(80)).max(30).optional(), stages: z.array(z.string().min(1).max(80)).max(30).optional(),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectId, ...filters }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/nodes/query`, { method: "POST", body: filters })));

server.registerTool("canvas_apply_operations", {
  description: "Atomically add, update, delete, connect, or disconnect canvas nodes. Temporary refs let one call create and connect a whole graph. New MCP-created nodes keep their requested anchor when possible and are minimally shifted when that anchor overlaps an existing node; existing nodes are never moved.",
  inputSchema: { projectId: z.string().uuid(), expectedVersion: z.number().int().positive().optional(), operations: z.array(operationSchema).min(1).max(100) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, expectedVersion, operations }) => {
  await assertOperationsDoNotTouchClaimedNodes(projectId, operations);
  return toolResult(await applyOperations(projectId, operations, expectedVersion));
});

server.registerTool("canvas_upsert_shot_column", {
  description: "Atomically create or update one Croco Video Factory shot as a vertical Group column, bind its nodes to the shot, and collision-free layout every shot column before one complete project update is published. Nodes never overlap; manually positioned nodes can be preserved.",
  inputSchema: {
    projectId: z.string().uuid(),
    factoryRunId: z.string().min(1).max(80),
    shotId: z.string().min(1).max(80),
    columnIndex: z.number().int().min(0).max(999),
    title: z.string().min(1).max(180).optional(),
    operations: z.array(operationSchema).max(100).default([]),
    layout: shotColumnLayoutSchema.optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, shotId, ...body }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/shot-columns/${encodeURIComponent(shotId)}`, { method: "POST", body })));

server.registerTool("canvas_relayout_shot_columns", {
  description: "Atomically reflow existing Croco Video Factory shot Groups into left-to-right columns with top-to-bottom non-overlapping nodes. Use after size changes, manual edits, inserting shots, or removing shots.",
  inputSchema: { projectId: z.string().uuid(), factoryRunId: z.string().min(1).max(80), shotIds: z.array(z.string().min(1).max(80)).max(100).optional(), layout: shotColumnLayoutSchema.optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectId, ...body }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/shot-columns/layout`, { method: "POST", body })));

server.registerTool("canvas_list_resources", {
  description: "List local user, generated, and pulled-character resources that can be placed on a canvas.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => toolResult(await api("/api/resources")));

server.registerTool("canvas_list_characters", {
  description: "List the synchronized pull-characters catalog, including character IDs, names, Voice IDs, and local assets.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => toolResult(await api("/api/characters")));

server.registerTool("canvas_sync_characters", {
  description: "Synchronize pull-characters and ingest its image, video, audio, and voice resources into the unified local resource library.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => toolResult(await api("/api/characters/sync", { method: "POST" })));

server.registerTool("canvas_import_resource", {
  description: "Copy a file from this repository into the unified local resource library. The source file must be inside the CrocoTV workspace.",
  inputSchema: { filePath: z.string().min(1), title: z.string().max(180).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ filePath, title }) => toolResult(await importWorkspaceResource(filePath, title)));

server.registerTool("canvas_place_imagegen_result", {
  description: "Place a GPT image already generated by Codex built-in ImageGen onto Canvas without pretending it came from a Canvas provider Config. Imports the workspace image, creates or reuses the exact Prompt Text node, creates one provenance-rich Image node, and atomically connects the Prompt plus ordered image references to that Image. Do not use this for P5 standard Storyboard generation or when the user explicitly requests generation on Canvas; build an openai:gpt-image@2 Config graph and call canvas_run_nodes instead.",
  inputSchema: {
    projectId: z.string().uuid(),
    imageFilePath: z.string().min(1),
    prompt: z.string().min(1).max(20_000),
    promptNodeId: z.string().min(1).max(80).optional(),
    referenceNodeIds: z.array(z.string().min(1).max(80)).max(8).default([]),
    title: z.string().min(1).max(180).optional(),
    position: positionSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
    factoryRunId: z.string().min(1).max(80).optional(),
    stage: z.string().min(1).max(20).optional(),
    shotId: z.string().min(1).max(80).optional(),
    artifactType: z.string().min(1).max(80).optional(),
    layoutSection: z.string().min(1).max(80).optional(),
    layoutOrder: z.number().finite().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, imageFilePath, prompt, promptNodeId: requestedPromptNodeId, referenceNodeIds, title, position, expectedVersion, artifactType, ...productionMetadata }) => {
  await ensureLocalService();
  const project = await api<{
    nodes: Array<{ id: string; type: string; title?: string; position: { x: number; y: number }; width: number; metadata?: Record<string, unknown> }>;
  }>(`/api/projects/${encodeURIComponent(projectId)}`);
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]));
  const normalizedPrompt = prompt.trim();

  if (requestedPromptNodeId) {
    const promptNode = nodesById.get(requestedPromptNodeId);
    if (!promptNode) throw new Error(`Prompt Text 节点不存在：${requestedPromptNodeId}`);
    if (promptNode.type !== "text") throw new Error(`Prompt 节点必须是 Text Node：${requestedPromptNodeId}`);
    const existingPrompt = String(promptNode.metadata?.content || "").trim();
    if (existingPrompt !== normalizedPrompt) throw new Error("promptNodeId 的 Text 内容与传入 prompt 不一致；请先确认或创建正确的 Prompt Text");
  }
  for (const referenceNodeId of referenceNodeIds) {
    const referenceNode = nodesById.get(referenceNodeId);
    if (!referenceNode) throw new Error(`参考图节点不存在：${referenceNodeId}`);
    if (referenceNode.type !== "image") throw new Error(`ImageGen 参考节点必须是 Image Node：${referenceNodeId}`);
  }

  const imageSource = await allowedWorkspaceFile(imageFilePath);
  const sourceMimeType = mimeFromPath(imageSource);
  if (!sourceMimeType.startsWith("image/")) throw new Error(`ImageGen 落图只接受图片文件，实际为 ${sourceMimeType}`);
  const resource = await importWorkspaceResource(imageFilePath, title);

  const promptNodeId = requestedPromptNodeId || randomUUID();
  const imageNodeId = randomUUID();
  const promptNode = requestedPromptNodeId ? nodesById.get(requestedPromptNodeId)! : undefined;
  const promptPosition = position || promptNode?.position || { x: 160, y: 160 };
  const imagePosition = {
    x: promptPosition.x + (promptNode?.width || 320) + 96,
    y: promptPosition.y,
  };
  const promptSha256 = createHash("sha256").update(normalizedPrompt).digest("hex");
  const sourceNodeIds = [promptNodeId, ...referenceNodeIds];
  const sharedMetadata = Object.fromEntries(Object.entries(productionMetadata).filter(([, value]) => value !== undefined));
  const imageTitle = title || path.parse(resource.name).name || "GPT ImageGen 图片";
  const operations: Array<Record<string, unknown>> = [];

  if (!requestedPromptNodeId) {
    operations.push({
      op: "add_node",
      node: {
        id: promptNodeId,
        type: "text",
        title: `${imageTitle} · Prompt`,
        position: promptPosition,
        metadata: {
          content: normalizedPrompt,
          contentSha256: promptSha256,
          status: "success",
          artifactType: "image-prompt",
          sourceNodeIds: referenceNodeIds,
          ...sharedMetadata,
        },
      },
    });
  }
  operations.push({
    op: "add_node",
    node: {
      id: imageNodeId,
      type: "image",
      title: imageTitle,
      position: imagePosition,
      metadata: {
        content: resource.url,
        storageKey: resource.id,
        mimeType: resource.mimeType,
        bytes: resource.size,
        status: "success",
        generationState: "ready",
        artifactType: artifactType || "imagegen-imported-image",
        generationRoute: "codex-built-in-imagegen",
        requestedRoute: "gpt",
        actualModel: "codex-imagegen",
        sourceKind: "imported-generation",
        sourcePromptNodeId: promptNodeId,
        sourceNodeIds,
        orderedReferenceNodeIds: referenceNodeIds,
        prompt: normalizedPrompt,
        promptSha256,
        inputSnapshot: {
          promptNodeId,
          promptSha256,
          orderedReferenceNodeIds: referenceNodeIds,
          route: "codex-built-in-imagegen",
        },
        ...sharedMetadata,
      },
    },
  });
  operations.push({ op: "connect", from: promptNodeId, to: imageNodeId });
  operations.push(...referenceNodeIds.map((referenceNodeId) => ({ op: "connect", from: referenceNodeId, to: imageNodeId })));

  const updated = await applyOperations(projectId, operations, expectedVersion);
  return toolResult({
    projectId,
    promptNodeId,
    imageNodeId,
    createdPromptNode: !requestedPromptNodeId,
    orderedReferenceNodeIds: referenceNodeIds,
    resource,
    projectVersion: (updated as any).project?.version,
  });
});

server.registerTool("canvas_run_nodes", {
  description: "Submit one or more existing Canvas generation-module nodes as an asynchronous run job through the same local execution path used by the UI. When concurrency is omitted, every selected node starts concurrently; pass a lower value only when the user explicitly requests throttling. Image config nodes support Nano Banana, GPT Image 02, and text-only ERNIE Image Turbo. Video config nodes support MiniMax H3 text/first-frame/first-last/multimodal image-audio modes and LTX 2.5 text/one-first-frame/one-Ingredients-reference modes. H3 uses its structured prompt optimizer; LTX uses its own enhance_prompt parameter. Connected videos are rejected because reference video and video editing are unavailable. The claimed config nodes are immediately locked while MCP owns them; generated results retain connections to their exact inputs. Poll canvas_get_run_status with the returned jobId.",
  inputSchema: {
    projectId: z.string().uuid(),
    nodeIds: z.array(z.string().min(1).max(80)).min(1).max(20),
    concurrency: z.number().int().min(1).max(20).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ projectId, nodeIds, concurrency }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/run-nodes`, {
  method: "POST",
  body: { nodeIds, concurrency, async: true },
})));

server.registerTool("canvas_get_run_status", {
  description: "Read an asynchronous canvas_run_nodes job. Completed results include every config node's output node IDs and final project version.",
  inputSchema: { jobId: z.string().uuid() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ jobId }) => toolResult(await api(`/api/canvas/run-jobs/${encodeURIComponent(jobId)}`)));

server.registerTool("canvas_cancel_run", {
  description: "Cancel a queued or running Canvas MCP job, abort remaining provider work when possible, and release claimed-node locks through the canonical runtime.",
  inputSchema: { jobId: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ jobId }) => toolResult(await api(`/api/canvas/run-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" })));

server.registerTool("canvas_rerun_outputs", {
  description: "Rerun existing generated result nodes in place through their original connected Config nodes. When concurrency is omitted, every independent selected output reruns concurrently. Node IDs and graph positions are preserved; poll canvas_get_run_status with the returned jobId.",
  inputSchema: { projectId: z.string().uuid(), outputNodeIds: z.array(z.string().min(1).max(80)).min(1).max(20), concurrency: z.number().int().min(1).max(20).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ projectId, outputNodeIds, concurrency }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/rerun-outputs`, { method: "POST", body: { outputNodeIds, concurrency } })));

server.registerTool("canvas_verify_video_asr", {
  description: "Verify a generated Canvas video against its expected storyboard narration with Volcano Engine BigModel ASR. The video is temporarily MCP-locked and glows green without changing its normal video UI; a nearby unconnected Comment node records transcript, similarity, threshold, and pass/fail for visible review. Comment nodes never participate in Canvas connections.",
  inputSchema: {
    projectId: z.string().uuid(),
    videoNodeId: z.string().min(1).max(80),
    expectedText: z.string().min(1).max(2000),
    threshold: z.number().min(0.5).max(1).optional(),
    title: z.string().max(180).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ projectId, videoNodeId, expectedText, threshold, title }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/verify-video-asr`, {
  method: "POST",
  body: { videoNodeId, expectedText, threshold, title },
})));

server.registerTool("canvas_use_video_frames", {
  description: "Use the Canvas video-frame shortcut runtime to materialize first, middle, and/or last frames as normal local Image nodes connected to the source Video. Middle uses the existing duration/2 picker behavior.",
  inputSchema: { projectId: z.string().uuid(), videoNodeId: z.string().min(1).max(80), frames: z.array(z.enum(["first", "middle", "last"])).min(1).max(3).default(["first", "middle", "last"]), replaceExisting: z.boolean().default(true) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, videoNodeId, frames, replaceExisting }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/video-frames`, { method: "POST", body: { videoNodeId, frames, replaceExisting } })));

server.registerTool("canvas_verify_video_visual", {
  description: "Record an evidence-backed H3 visual verdict after inspecting the current first/middle/last Image nodes. PASS requires every hard visual and continuity check. The result is an unconnected green Comment.",
  inputSchema: { projectId: z.string().uuid(), videoNodeId: z.string().min(1).max(80), verdict: z.enum(["pass", "fail"]), reviewer: z.string().min(1).max(120), checks: z.array(z.enum(["no-readable-text", "no-storyboard-marks", "style-consistent", "character-consistent", "clean-realistic-scenes", "scene-reference-consistent", "cross-shot-continuity"])).max(7).optional(), issues: z.array(z.string().min(1).max(500)).max(30).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, ...body }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/visual-review`, { method: "POST", body })));

server.registerTool("canvas_merge_videos", {
  description: "Merge ordered local Canvas Video nodes into one verified MP4 resource and Video node. By default every input must have current passing ASR and visual-review records.",
  inputSchema: { projectId: z.string().uuid(), videoNodeIds: z.array(z.string().min(1).max(80)).min(2).max(50), title: z.string().min(1).max(180).default("完整视频"), requireVerification: z.boolean().default(true) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ projectId, ...body }) => toolResult(await api(`/api/canvas/projects/${encodeURIComponent(projectId)}/merge-videos`, { method: "POST", body })));

server.registerTool("canvas_generate", {
  description: "Legacy direct generation that does not construct a reproducible generation-module graph. Prefer canvas_run_nodes. Uses the same fixed model adapters as Canvas, including ERNIE Image Turbo, MiniMax H3, and LTX 2.5.",
  inputSchema: {
    projectId: z.string().uuid(),
    targetNodeId: z.string().min(1).max(80).optional(),
    capability: generationCapabilitySchema,
    prompt: z.string().min(1),
    model: z.string().optional(),
    title: z.string().max(180).optional(),
    position: positionSchema.optional(),
    voiceId: z.string().optional(),
    params: generationParamsSchema.optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ projectId, targetNodeId, capability, prompt, model, title, position, voiceId, params }) => {
  const prepared = await prepareGenerationNodes(projectId, [{ targetNodeId, capability, prompt, model, title, position, voiceId, params: params || {} }]);
  const task = prepared.tasks[0];
  const nodeId = prepared.nodeIds[0];
  try {
    await markGenerationNodeRunning(projectId, nodeId, task, prepared.toneNodeIds[0]);
    const completed = await completeGenerationNode(projectId, nodeId, task, prepared.toneNodeIds[0]);
    return toolResult({ projectId, nodeId, toneNodeId: prepared.toneNodeIds[0], result: completed.generated, projectVersion: completed.projectVersion });
  } catch (error) {
    await failGenerationNode(projectId, nodeId, error);
    throw error;
  }
});

server.registerTool("canvas_generate_batch", {
  description: "Legacy direct batch generation that does not construct reproducible generation-module graphs. Prefer creating connected Config nodes and calling canvas_run_nodes. This tool remains only for compatibility with existing result-node regeneration.",
  inputSchema: {
    projectId: z.string().uuid(),
    concurrency: z.number().int().min(1).max(20).optional(),
    tasks: z.array(generationTaskSchema).min(1).max(20),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ projectId, concurrency, tasks }) => {
  const prepared = await prepareGenerationNodes(projectId, tasks);
  const limit = Math.min(prepared.tasks.length, concurrency || prepared.tasks.length);
  const results = await runWithConcurrency(prepared.tasks, limit, async (task, index) => {
    const nodeId = prepared.nodeIds[index];
    try {
      await markGenerationNodeRunning(projectId, nodeId, task, prepared.toneNodeIds[index]);
      const completed = await completeGenerationNode(projectId, nodeId, { ...task, params: task.params || {} }, prepared.toneNodeIds[index]);
      return { taskId: task.taskId || String(index + 1), nodeId, toneNodeId: prepared.toneNodeIds[index], status: "success", result: completed.generated, projectVersion: completed.projectVersion };
    } catch (error) {
      await failGenerationNode(projectId, nodeId, error);
      return { taskId: task.taskId || String(index + 1), nodeId, toneNodeId: prepared.toneNodeIds[index], status: "error", error: error instanceof Error ? error.message : "生成失败" };
    }
  });
  return toolResult({ projectId, concurrency: limit, results });
});

type GenerationTask = {
  taskId?: string;
  targetNodeId?: string;
  capability: "text" | "image" | "video" | "speech" | "music";
  prompt: string;
  model?: string;
  title?: string;
  position?: { x: number; y: number };
  voiceId?: string;
  params: Record<string, unknown>;
};

function generationRef(index: number) { return index === 0 ? "result" : `result-${index + 1}`; }

async function prepareGenerationNodes(projectId: string, inputTasks: Array<Omit<GenerationTask, "params"> & { params?: Record<string, unknown> }>) {
  const tasks: GenerationTask[] = inputTasks.map((task) => ({ ...task, params: task.params || {} }));
  const targetIds = tasks.flatMap((task) => task.targetNodeId ? [task.targetNodeId] : []);
  if (new Set(targetIds).size !== targetIds.length) throw new Error("同一批次不能重复重新生成同一个节点");

  if (targetIds.length) {
    const project = await api<{ nodes: Array<{ id: string; type: string; title: string }> }>(`/api/projects/${encodeURIComponent(projectId)}`);
    const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
    tasks.forEach((task) => {
      if (!task.targetNodeId) return;
      const node = nodeById.get(task.targetNodeId);
      if (!node) throw new Error(`节点不存在：${task.targetNodeId}`);
      const expectedType = task.capability === "speech" ? "audio" : task.capability;
      if (node.type !== expectedType) throw new Error(`节点 ${task.targetNodeId} 的类型是 ${node.type}，不能用 ${task.capability} 重新生成`);
      if (!task.title) task.title = node.title;
    });
  }

  const prepared = await applyOperations(projectId, tasks.map((task, index) => {
    const metadata = {
      prompt: task.prompt,
      ...(task.model ? { model: task.model } : {}),
      ...(task.taskId ? { batchTaskId: task.taskId } : {}),
      status: "loading",
      generationState: "queued",
      remoteOperationActive: true,
      remoteOperationLabel: "MCP · 排队中",
      batchQueuePosition: index + 1,
      errorDetails: "",
    };
    return task.targetNodeId
      ? { op: "update_node" as const, nodeId: task.targetNodeId, patch: { metadata } }
      : { op: "add_node" as const, ref: generationRef(index), node: { type: task.capability === "speech" ? "audio" : task.capability, title: task.title || task.prompt.slice(0, 32), position: task.position, metadata } };
}));

  const nodeIds = tasks.map((task, index) => task.targetNodeId || String((prepared as any).createdRefs?.[generationRef(index)] || ""));
  const preparedProject = (prepared as any).project as { nodes: Array<{ id: string; title: string; position: { x: number; y: number }; metadata?: Record<string, unknown> }> };
  const toneNodeIds: Array<string | undefined> = new Array(tasks.length).fill(undefined);
  const toneOperations: any[] = [];
  tasks.forEach((task, index) => {
    if (task.capability !== "speech") return;
    const audioNodeId = nodeIds[index];
    const audioNode = preparedProject.nodes.find((node) => node.id === audioNodeId);
    if (!audioNode) throw new Error(`语音节点不存在：${audioNodeId}`);
    const existing = preparedProject.nodes.find((node) => node.metadata?.artifactType === "speech-tone-plan" && node.metadata?.targetNodeId === audioNodeId);
    const toneRef = `speech-tone-${index + 1}`;
    const sourceNodeId = String(task.params.sourceNodeId || "").trim();
    const toneMetadata = {
      artifactType: "speech-tone-plan",
      targetNodeId: audioNodeId,
      model: speechToneModel(),
      prompt: JSON.stringify({ currentText: task.prompt, voiceDirection: String(task.params.direction || "") }, null, 2),
      content: "等待 DeepSeek 生成情景化语气分段…",
      status: "loading",
      generationState: "queued",
      remoteOperationActive: true,
      remoteOperationLabel: "MCP · 排队中",
      speechStage: "queued",
      errorDetails: "",
    };
    if (existing) {
      toneNodeIds[index] = existing.id;
      toneOperations.push({ op: "update_node", nodeId: existing.id, patch: { title: `语气优化 · ${task.title || audioNode.title}`, metadata: toneMetadata } });
      toneOperations.push({ op: "connect", from: existing.id, to: audioNodeId });
      if (sourceNodeId) toneOperations.push({ op: "connect", from: sourceNodeId, to: existing.id });
    } else {
      toneOperations.push({ op: "add_node", ref: toneRef, node: { type: "text", title: `语气优化 · ${task.title || audioNode.title}`, position: { x: audioNode.position.x - 440, y: audioNode.position.y }, width: 380, height: 300, metadata: toneMetadata } });
      toneOperations.push({ op: "connect", from: toneRef, to: audioNodeId });
      if (sourceNodeId) toneOperations.push({ op: "connect", from: sourceNodeId, to: toneRef });
    }
  });
  if (toneOperations.length) {
    const tonesPrepared = await applyOperations(projectId, toneOperations);
    tasks.forEach((task, index) => {
      if (task.capability === "speech" && !toneNodeIds[index]) toneNodeIds[index] = String((tonesPrepared as any).createdRefs?.[`speech-tone-${index + 1}`] || "");
    });
  }
  return { tasks, nodeIds, toneNodeIds };
}

async function markGenerationNodeRunning(projectId: string, nodeId: string, task: GenerationTask, toneNodeId?: string) {
  const providerLabel = task.capability === "text" && task.model
    ? `${task.model} 请求中`
    : task.capability === "speech"
      ? "等待 DeepSeek 语气优化"
      : "MCP 生成中";
  const operations: any[] = [{
    op: "update_node",
    nodeId,
    patch: {
      metadata: {
        status: "loading",
        generationState: "running",
        remoteOperationActive: true,
        remoteOperationLabel: providerLabel,
        batchQueuePosition: null,
        errorDetails: "",
      },
    },
  }];
  if (task.capability === "speech" && toneNodeId) {
    operations.push({
      op: "update_node",
      nodeId: toneNodeId,
      patch: {
        metadata: {
          status: "loading",
          generationState: "running",
          remoteOperationActive: true,
          remoteOperationLabel: "DeepSeek 正在优化语气",
          speechStage: "tone",
          errorDetails: "",
        },
      },
    });
  }
  await applyOperations(projectId, operations);
}

async function completeGenerationNode(projectId: string, nodeId: string, task: GenerationTask, toneNodeId?: string) {
  const generated = await runGeneration(task.capability, task.prompt, task.model, task.voiceId, task.params, { projectId, nodeId, toneNodeId });
  const metadata = "text" in generated
    ? { content: generated.text, status: "success", generationState: "ready", remoteOperationActive: false }
    : { content: generated.resource.url, storageKey: generated.resource.id, mimeType: generated.resource.mimeType, bytes: generated.resource.size, status: "success", generationState: "ready", remoteOperationActive: false, ...(generated.resource.metadata || {}) };
  const resource = "resource" in generated ? generated.resource : undefined;
  const resultTitle = task.title || (resource?.name ? String(resource.name).replace(/\.[^.]+$/, "") : task.prompt.slice(0, 32));
  const updated = await applyOperations(projectId, [{ op: "update_node", nodeId, patch: { title: resultTitle, metadata } }]);
  return { generated, projectVersion: (updated as any).project?.version };
}

async function failGenerationNode(projectId: string, nodeId: string, error: unknown) {
  await applyOperations(projectId, [{ op: "update_node", nodeId, patch: { metadata: { status: "error", generationState: "failed", remoteOperationActive: false, errorDetails: error instanceof Error ? error.message : "生成失败" } } }]).catch(() => undefined);
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function runGeneration(capability: string, prompt: string, model: string | undefined, voiceId: string | undefined, params: Record<string, unknown>, context?: { projectId: string; nodeId: string; toneNodeId?: string }) {
  if (capability === "text") {
    if (!model) throw new Error("文本生成必须指定 model");
    return { text: (await api<{ text: string }>("/api/generate/text", { method: "POST", body: { prompt, model, systemPrompt: params.systemPrompt || "", inputResourceIds: params.inputResourceIds || [] } })).text };
  }
  if (capability === "image") {
    if (!model) throw new Error("图片生成必须指定 model");
    return { resource: (await api<{ resource: Resource }>("/api/generate/image", { method: "POST", body: { prompt, model, width: params.width, height: params.height, referenceResourceIds: params.referenceResourceIds || [] } })).resource };
  }
  if (capability === "video") {
    const resources = (await api<{ resources: Resource[] }>("/api/generate/video", { method: "POST", body: { prompt, model: model || "minimax-h3", duration: params.duration || 5, quality: params.quality, ratio: params.ratio, count: 1, inputMode: params.inputMode, optimizePrompt: params.optimizePrompt !== false, referenceStrength: params.referenceStrength, seed: params.seed, imageResourceIds: params.imageResourceIds || [], videoResourceIds: params.videoResourceIds || [], audioResourceIds: params.audioResourceIds || [] } })).resources;
    if (!resources[0]) throw new Error("视频生成没有返回资源");
    return { resource: resources[0] };
  }
  if (capability === "speech") {
    if (!voiceId) throw new Error("语音生成必须指定 pull characters 中的 voiceId");
    return { resource: (await api<{ resource: Resource }>("/api/generate/speech", { method: "POST", body: { content: prompt, voiceId, direction: params.direction, projectId: context?.projectId, nodeId: context?.nodeId, toneNodeId: context?.toneNodeId } })).resource };
  }
  const resources = (await api<{ resources: Resource[] }>("/api/generate/music", { method: "POST", body: { prompt, model: model || "", params } })).resources;
  if (!resources[0]) throw new Error("音乐生成没有返回资源");
  return { resource: resources[0] };
}

type Resource = { id: string; name: string; url: string; mimeType: string; size: number; metadata?: Record<string, unknown> };

async function importWorkspaceResource(filePath: string, title?: string): Promise<Resource> {
  await ensureLocalService();
  const source = await allowedWorkspaceFile(filePath);
  const bytes = await readFile(source);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeFromPath(source) }), title || path.basename(source));
  const response = await fetch(`${apiOrigin}/api/resources`, { method: "POST", headers: { "X-Croco-Client-Id": mcpClientId }, body: form });
  const payload = await response.json().catch(() => ({})) as Partial<Resource> & { error?: unknown };
  if (!response.ok) throw new Error(String(payload.error || `资源导入失败（${response.status}）`));
  if (!payload.id || !payload.url || !payload.mimeType) throw new Error("资源导入响应缺少 id、url 或 mimeType");
  return payload as Resource;
}

async function applyOperations(projectId: string, operations: unknown[], expectedVersion?: number) {
  let positioned = operations;
  if ((operations as Array<{ op?: string }>).some((operation) => operation.op === "add_node")) {
    const project = await api<{ nodes: Array<{ id: string; type: string; position: { x: number; y: number }; width: number; height: number; metadata?: Record<string, unknown> }> }>(`/api/projects/${encodeURIComponent(projectId)}`);
    positioned = avoidMcpNodeOverlaps(project.nodes, operations);
  }
  return api(`/api/canvas/projects/${encodeURIComponent(projectId)}/operations`, { method: "POST", body: { operations: positioned, expectedVersion } });
}

async function assertOperationsDoNotTouchClaimedNodes(projectId: string, operations: Array<Record<string, any>>) {
  const project = await api<{ nodes: Array<{ id: string; metadata?: Record<string, unknown> }>; connections: Array<{ id: string; fromNodeId: string; toNodeId: string }> }>(`/api/projects/${encodeURIComponent(projectId)}`);
  const claimed = new Set(project.nodes.filter((node) => node.metadata?.remoteOperationActive).map((node) => node.id));
  if (!claimed.size) return;
  const connectionById = new Map(project.connections.map((connection) => [connection.id, connection]));
  for (const operation of operations) {
    let touched: string[] = [];
    if (operation.op === "update_node" || operation.op === "delete_node") touched = [String(operation.nodeId || "")];
    if (operation.op === "connect") touched = [String(operation.from || ""), String(operation.to || "")];
    if (operation.op === "disconnect") {
      if (operation.connectionId) {
        const connection = connectionById.get(String(operation.connectionId));
        if (connection) touched = [connection.fromNodeId, connection.toNodeId];
      } else touched = [String(operation.from || ""), String(operation.to || "")];
    }
    const lockedNodeId = touched.find((nodeId) => claimed.has(nodeId));
    if (lockedNodeId) throw new Error(`节点 ${lockedNodeId} 正由另一个 MCP 操作锁定，不能修改或重连`);
  }
}

async function api<T = unknown>(endpoint: string, input: { method?: string; body?: unknown } = {}): Promise<T> {
  await ensureLocalService();
  const response = await fetch(`${apiOrigin}${endpoint}`, {
    method: input.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Croco-Client-Id": mcpClientId,
      "X-Croco-Operation-Origin": "mcp",
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    signal: AbortSignal.timeout(15 * 60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((payload as any).error || `CrocoTV 请求失败（${response.status}）`));
  return payload as T;
}

async function ensureLocalService(forceStart = false) {
  const status = await serviceStatus();
  if (status.api && status.web && status.studio) return { ...status, started: false };
  const runtimeDir = path.join(workspaceRoot, "data", "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  const logPath = path.join(runtimeDir, "crocotv.log");
  const log = openSync(logPath, "a");
  const scripts = [
    ...(!status.api ? ["dev:server"] : []),
    ...(!status.web ? ["dev:canvas"] : []),
    ...(!status.studio ? ["dev:studio"] : []),
  ];
  try {
    for (const script of scripts) {
      const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], { cwd: workspaceRoot, detached: true, stdio: ["ignore", log, log], env: process.env });
      child.unref();
    }
  } finally { closeSync(log); }
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await wait(500);
    const current = await serviceStatus();
    if (current.api && current.web && current.studio) return { ...current, started: true, scripts, logPath };
  }
  throw new Error(`CrocoTV 完整套件启动超时（缺失：${scripts.join("、") || "未知"}），请查看 ${logPath}`);
}

async function serviceStatus() {
  const [app, webReady] = await Promise.all([readStatus(`${apiOrigin}/api/status`), reachable(webOrigin)]);
  return {
    api: Boolean(app),
    web: webReady,
    studio: await reachable(studioOrigin),
    apiOrigin,
    webOrigin,
    studioOrigin,
    app,
    pluginVersion: bundleManifest.pluginVersion,
    mcpVersion: bundleManifest.mcpVersion,
    skillsBundleVersion: bundleManifest.skillsBundleVersion,
  };
}
async function readStatus(url: string) { try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); return response.ok ? await response.json() : null; } catch { return null; } }
async function reachable(url: string) { try { const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }); return response.ok; } catch { return false; } }
async function allowedWorkspaceFile(filePath: string) {
  const resolved = await realpath(path.resolve(workspaceRoot, filePath));
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error("只允许导入 CrocoTV 工作区内的文件");
  return resolved;
}
function mimeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".json": "application/json", ".txt": "text/plain" } as Record<string, string>)[extension] || "application/octet-stream";
}
function toolResult(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: { result: value } }; }
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function speechToneModel() { const configured = process.env.TTS_TONE_MODEL || "deepseek-v4-flash-ga-260731"; return configured === "deepseek-v4-flash-260425" ? "deepseek-v4-flash-ga-260731" : configured; }

function findPluginRoot(start: string) {
  let current = path.resolve(start);
  while (true) {
    try {
      readFileSync(path.join(current, ".codex-plugin", "plugin.json"));
      return current;
    } catch {}
    const parent = path.dirname(current);
    if (parent === current) throw new Error("无法定位 Croco Video Factory Plugin 根目录");
    current = parent;
  }
}

void ensureLocalService(true).catch((error) => console.error(`[crocotv] ${error.message}`));
await server.connect(new StdioServerTransport());
