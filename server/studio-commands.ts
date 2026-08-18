import { createHash } from "node:crypto";
import { applyCanvasOperations, type CanvasOperation } from "./canvas-commands";
import { publishProjectUpdated } from "./canvas-events";
import { createStudioProjectSchema, newStudioProjectState, parseStudioProjectState, updateStudioScriptSchema } from "./studio-schemas";
import { studioMappingOperations } from "./studio-canvas-mapping";
import { studioTextToDocument } from "./studio-document";
import { createProject, listProjects, readProject, trashProject } from "./storage";
import type { StudioBackedProject, StudioProjectState } from "./studio-types";

export async function createStudioProject(raw: unknown, originClientId = "studio-api") {
  const input = createStudioProjectSchema.parse(raw);
  const base = await createProject(input.title, input.id);
  const state = {
    ...newStudioProjectState(input.text, input.workflow_mode),
    ...(input.series_id ? { seriesId: input.series_id } : {}),
    ...(input.episode_number ? { episodeNumber: input.episode_number } : {}),
  };
  try {
    const operations: CanvasOperation[] = [
      { op: "set_studio_state", state },
      ...studioMappingOperations({ projectId: String(base.id), state, nodes: [], connections: [] }),
    ];
    const result = await applyCanvasOperations(String(base.id), operations, Number(base.version), { allowStudioManagedWrites: true });
    publishProjectUpdated(result.project, originClientId);
    return studioProjectResponse(result.project as unknown as StudioBackedProject);
  } catch (error) {
    await trashProject(String(base.id)).catch(() => undefined);
    throw error;
  }
}

export async function updateStudioScript(projectId: string, raw: unknown, originClientId = "studio-api") {
  const input = updateStudioScriptSchema.parse(raw);
  const updatedAt = new Date().toISOString();
  return mutateStudioProject(projectId, (state) => ({
    ...state,
    originalText: input.text,
    document: {
      ...state.document,
      content: studioTextToDocument(input.text),
      updatedAt,
    },
  }), { expectedVersion: input.expectedVersion, originClientId });
}

export async function mutateStudioProject(
  projectId: string,
  updater: (state: StudioProjectState, project: StudioBackedProject) => StudioProjectState | Promise<StudioProjectState>,
  options: { expectedVersion?: number; originClientId?: string; title?: string } = {},
) {
  const project = asStudioProject(await readProject(projectId));
  const state = parseStudioProjectState(await updater(structuredClone(project.studio), project));
  const operations: CanvasOperation[] = [
    ...(options.title ? [{ op: "rename_project", title: options.title } as CanvasOperation] : []),
    { op: "set_studio_state", state },
    ...studioMappingOperations({ projectId, state, nodes: project.nodes, connections: project.connections }),
  ];
  const result = await applyCanvasOperations(projectId, operations, options.expectedVersion ?? project.version, { allowStudioManagedWrites: true });
  publishProjectUpdated(result.project, options.originClientId || "studio-api");
  return studioProjectResponse(result.project as unknown as StudioBackedProject);
}

export async function getStudioProject(projectId: string) {
  return studioProjectResponse(asStudioProject(await readProject(projectId)));
}

export async function getStudioBackedProject(projectId: string) {
  return asStudioProject(await readProject(projectId));
}

export async function listStudioProjectResponses(options: { kind?: "episode" | "series" | "playground" } = {}) {
  const projects = await listProjects();
  const responses = await Promise.all(projects.map(async (summary) => {
    try {
      const project = asStudioProject(await readProject(String(summary!.id)));
      if (options.kind && project.studio.projectKind !== options.kind) return null;
      return studioProjectResponse(project);
    } catch {
      return null;
    }
  }));
  return responses.filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function listStudioAssetSources() {
  const projects = await listStudioProjectResponses();
  return projects
    .filter((project) => project.project_kind !== "playground")
    .filter((project) => project.characters.length + project.scenes.length + project.props.length > 0)
    .map((project) => ({
      source_id: project.id,
      source_kind: project.project_kind === "series" ? "series" as const : project.series_id ? "episode" as const : "project" as const,
      title: project.title,
      series_id: project.series_id,
      episode_number: project.episode_number,
      characters: project.characters,
      scenes: project.scenes,
      props: project.props,
    }))
    .sort((left, right) => assetSourceOrder(left) - assetSourceOrder(right)
      || Number(left.episode_number || 0) - Number(right.episode_number || 0)
      || left.title.localeCompare(right.title, "zh-CN"));
}

export async function deleteStudioProject(projectId: string) {
  asStudioProject(await readProject(projectId));
  await trashProject(projectId);
}

export function asStudioProject(value: unknown) {
  const project = value as StudioBackedProject;
  if (!project?.id || !project.studio || !Array.isArray(project.nodes) || !Array.isArray(project.connections)) throw new Error("Studio 项目不存在");
  return { ...project, studio: parseStudioProjectState(project.studio) } as StudioBackedProject & { studio: StudioProjectState };
}

export function studioProjectResponse(project: StudioBackedProject) {
  const studio = parseStudioProjectState(project.studio);
  const currentScriptHash = createHash("sha256").update(studio.originalText).digest("hex");
  return {
    id: project.id,
    title: project.title,
    project_kind: studio.projectKind,
    original_text: studio.originalText,
    workflow_mode: studio.workflowMode,
    characters: studio.characters,
    scenes: studio.scenes,
    props: studio.props,
    frames: [...studio.frames].sort((a, b) => a.order - b.order),
    video_tasks: studio.videoTasks,
    status: studio.status,
    starred: studio.starred,
    series_id: studio.seriesId,
    episode_number: studio.episodeNumber,
    aspect_ratio: studio.aspectRatio,
    art_direction: studio.artDirection,
    model_settings: studio.modelSettings,
    prompt_config: studio.promptConfig,
    merged_video_url: studio.assembly.mergedVideoUrl,
    bgm_url: studio.assembly.bgmUrl,
    mix_settings: studio.assembly.mixSettings,
    next_hook: studio.nextHook,
    last_episode_summary: studio.lastEpisodeSummary,
    created_at: timestamp(project.createdAt),
    updated_at: timestamp(project.updatedAt),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    canvas_project_id: project.id,
    project_version: project.version,
    entity_extraction_stale: studio.derivationBaselines.entityExtraction?.sourceHash !== currentScriptHash,
    storyboard_stale: studio.frames.length > 0 && studio.derivationBaselines.storyboard?.sourceHash !== currentScriptHash,
    document: {
      content: studio.document.content || studioTextToDocument(studio.originalText),
      updated_at: studio.document.updatedAt || "",
    },
  };
}

function assetSourceOrder(source: { source_kind: "series" | "project" | "episode" }) {
  return source.source_kind === "series" ? 0 : source.source_kind === "project" ? 1 : 2;
}

function timestamp(value: string) {
  const milliseconds = Date.parse(String(value || ""));
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : 0;
}
