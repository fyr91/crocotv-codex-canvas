import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoredResource } from "./types";

export const dataDir = path.resolve(process.env.CROCO_DATA_DIR || "./data");
export const projectsDir = path.join(dataDir, "projects");
export const resourcesDir = path.join(dataDir, "resources");
export const trashDir = path.join(dataDir, ".trash");
const resourceIndexPath = path.join(resourcesDir, "index.json");
const projectQueues = new Map<string, Promise<void>>();

export class ProjectVersionConflictError extends Error {
  statusCode = 409;
  constructor(public readonly currentVersion: number) {
    super(`画布已更新，请基于版本 ${currentVersion} 重新提交`);
  }
}

export async function ensureStorage() {
  await Promise.all([
    mkdir(projectsDir, { recursive: true }),
    mkdir(path.join(resourcesDir, "user"), { recursive: true }),
    mkdir(path.join(resourcesDir, "generated", "runware"), { recursive: true }),
    mkdir(path.join(resourcesDir, "generated", "canvas"), { recursive: true }),
    mkdir(path.join(resourcesDir, "generated", "speech"), { recursive: true }),
    mkdir(path.join(resourcesDir, "generated", "h3"), { recursive: true }),
    mkdir(path.join(resourcesDir, "generated", "happyhorse"), { recursive: true }),
    mkdir(path.join(resourcesDir, "generated", "suno"), { recursive: true }),
    mkdir(path.join(resourcesDir, "characters"), { recursive: true }),
    mkdir(trashDir, { recursive: true }),
  ]);
  if (!await exists(resourceIndexPath)) await atomicJson(resourceIndexPath, []);
}

export async function listProjects() {
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const projects = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      const project = await readJson<Record<string, unknown>>(path.join(projectsDir, entry.name, "project.json"));
      return { id: project.id, name: project.title || project.name, title: project.title || project.name, createdAt: project.createdAt, updatedAt: project.updatedAt, nodeCount: Array.isArray(project.nodes) ? project.nodes.length : 0 };
    } catch { return null; }
  }));
  return projects.filter(Boolean).sort((a, b) => String(b!.updatedAt).localeCompare(String(a!.updatedAt)));
}

export async function createProject(name: string, requestedId?: string) {
  const id = requestedId && /^[a-f0-9-]{36}$/.test(requestedId) ? requestedId : randomUUID();
  const now = new Date().toISOString();
  const project = { id, ownerId: "local", ownerName: "本地用户", ownerUsername: "local", title: cleanName(name) || "未命名画布", createdAt: now, updatedAt: now, version: 1, nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } };
  const directory = projectPath(id);
  await mkdir(directory, { recursive: false });
  await atomicJson(path.join(directory, "project.json"), project);
  return project;
}

export async function readProject(id: string) {
  return readJson(projectJsonPath(id));
}

export async function saveProject(id: string, value: Record<string, unknown>, expectedVersion?: number) {
  return mutateProject(id, (current) => preserveRuntimeManagedNodes(current, value), expectedVersion);
}

function preserveRuntimeManagedNodes(current: Record<string, unknown>, incoming: Record<string, unknown>) {
  const currentNodes = Array.isArray(current.nodes) ? current.nodes as Array<Record<string, unknown>> : [];
  const incomingNodes = Array.isArray(incoming.nodes) ? incoming.nodes as Array<Record<string, unknown>> : [];
  const currentById = new Map(currentNodes.map((node) => [String(node.id || ""), node]));
  const studioManagedIds = new Set(currentNodes.filter(isStudioManagedNode).map((node) => String(node.id || "")));
  const savedIds = new Set<string>();
  const nodes = incomingNodes.flatMap((node) => {
    const id = String(node.id || "");
    const existing = currentById.get(id);
    if (existing && isStudioManagedNode(existing)) {
      savedIds.add(id);
      return [preserveStudioManagedNode(existing, node)];
    }
    if (!existing && isStudioManagedNode(node)) return [];
    const incomingRemote = Boolean((node.metadata as Record<string, unknown> | undefined)?.remoteOperationActive);
    const existingRemote = Boolean((existing?.metadata as Record<string, unknown> | undefined)?.remoteOperationActive);
    if (incomingRemote || existingRemote) {
      if (!existing) return [];
      savedIds.add(id);
      return [existing];
    }
    savedIds.add(id);
    return [node];
  });
  for (const node of currentNodes) {
    const id = String(node.id || "");
    if (!savedIds.has(id) && (Boolean((node.metadata as Record<string, unknown> | undefined)?.remoteOperationActive) || isStudioManagedNode(node))) nodes.push(node);
  }
  const nodeIds = new Set(nodes.map((node) => String(node.id || "")));
  const incomingConnections = Array.isArray(incoming.connections) ? incoming.connections as Array<Record<string, unknown>> : [];
  const currentConnections = Array.isArray(current.connections) ? current.connections as Array<Record<string, unknown>> : [];
  const freeConnections = incomingConnections.filter((connection) => {
    const fromNodeId = String(connection.fromNodeId || "");
    const toNodeId = String(connection.toNodeId || "");
    return nodeIds.has(fromNodeId) && nodeIds.has(toNodeId) && !studioManagedIds.has(fromNodeId) && !studioManagedIds.has(toNodeId);
  });
  const managedConnections = currentConnections.filter((connection) => {
    const fromNodeId = String(connection.fromNodeId || "");
    const toNodeId = String(connection.toNodeId || "");
    return nodeIds.has(fromNodeId) && nodeIds.has(toNodeId) && (studioManagedIds.has(fromNodeId) || studioManagedIds.has(toNodeId));
  });
  const { studio: _ignoredStudio, ...safeIncoming } = incoming;
  return { ...safeIncoming, ...(current.studio ? { studio: current.studio } : {}), nodes, connections: [...freeConnections, ...managedConnections] };
}

function isStudioManagedNode(node: Record<string, unknown>) {
  return (node.metadata as Record<string, unknown> | undefined)?.studioManaged === true;
}

function preserveStudioManagedNode(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const position = incoming.position as { x?: unknown; y?: unknown } | undefined;
  const width = Number(incoming.width);
  const height = Number(incoming.height);
  return {
    ...existing,
    ...(position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y)) ? { position: { x: Number(position.x), y: Number(position.y) } } : {}),
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
  };
}

export async function mutateProject(
  id: string,
  updater: (current: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>,
  expectedVersion?: number,
) {
  return withProjectQueue(id, async () => {
    const current = await readProject(id) as Record<string, unknown>;
    const currentVersion = Math.max(1, Number(current.version) || 1);
    if (expectedVersion != null && expectedVersion !== currentVersion) throw new ProjectVersionConflictError(currentVersion);
    const value = await updater(structuredClone(current));
    const project = {
      ...value,
      id,
      ownerId: "local",
      ownerName: "本地用户",
      ownerUsername: "local",
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      version: currentVersion + 1,
    };
    await atomicJson(projectJsonPath(id), project);
    return project;
  });
}

export async function renameProject(id: string, name: string) {
  const current = await readProject(id) as Record<string, unknown>;
  return saveProject(id, { ...current, title: cleanName(name) || current.title }, Math.max(1, Number(current.version) || 1));
}

export async function trashProject(id: string) {
  const source = projectPath(id);
  await stat(source);
  await mkdir(path.join(trashDir, "projects"), { recursive: true });
  await rename(source, path.join(trashDir, "projects", `${id}-${Date.now()}`));
}

export async function listResources(): Promise<StoredResource[]> {
  return readJson(resourceIndexPath, []);
}

export async function resourceById(id: string) {
  return (await listResources()).find((item) => item.id === id);
}

export async function updateResource(id: string, patch: { name?: string; metadata?: Record<string, unknown> }) {
  const items = await listResources();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("资源不存在");
  items[index] = { ...items[index], ...(patch.name ? { name: patch.name } : {}), ...(patch.metadata ? { metadata: patch.metadata } : {}) };
  await atomicJson(resourceIndexPath, items);
  return items[index];
}

export async function addResource(input: Omit<StoredResource, "url">): Promise<StoredResource> {
  const items = await listResources();
  const sha256 = await fileSha256(safeResourcePath(input.fileName));
  const matching = input.source === "character"
    ? undefined
    : await findContentDuplicate(items, input, sha256);
  if (matching) {
    if (matching.fileName !== input.fileName) await unlink(safeResourcePath(input.fileName)).catch(() => {});
    const resource = {
      ...matching,
      ...input,
      id: matching.id,
      fileName: matching.fileName,
      metadata: { ...(matching.metadata || {}), ...(input.metadata || {}), sha256 },
      url: `/files/by-id/${matching.id}`,
    };
    await atomicJson(resourceIndexPath, [resource, ...items.filter((item) => item.id !== matching.id && item.id !== input.id)]);
    return resource;
  }
  const resource = { ...input, metadata: { ...(input.metadata || {}), sha256 }, url: `/files/by-id/${input.id}` };
  const index = items.findIndex((item) => item.id === input.id);
  if (index >= 0) items[index] = resource; else items.unshift(resource);
  await atomicJson(resourceIndexPath, items);
  return resource;
}

export async function addResources(inputs: Omit<StoredResource, "url">[]) {
  const items = await listResources();
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const input of inputs) byId.set(input.id, { ...input, url: `/files/by-id/${input.id}` });
  await atomicJson(resourceIndexPath, [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function trashResource(id: string) {
  const items = await listResources();
  const resource = items.find((item) => item.id === id);
  if (!resource) throw new Error("资源不存在");
  if (resource.source === "character") throw new Error("角色资源由角色目录管理，请通过同步更新");
  const source = safeResourcePath(resource.fileName);
  await mkdir(path.join(trashDir, "resources"), { recursive: true });
  await rename(source, path.join(trashDir, "resources", `${id}-${path.basename(resource.fileName)}`));
  await atomicJson(resourceIndexPath, items.filter((item) => item.id !== id));
}

export function safeResourcePath(fileName: string) {
  const target = path.resolve(resourcesDir, fileName);
  if (!target.startsWith(`${resourcesDir}${path.sep}`)) throw new Error("非法资源路径");
  return target;
}

export async function writeGenerated(provider: "canvas" | "runware" | "speech" | "h3" | "happyhorse" | "suno", extension: string, bytes: Uint8Array) {
  const id = randomUUID();
  const fileName = path.posix.join("generated", provider, `${id}.${extension.replace(/^\./, "")}`);
  const target = safeResourcePath(fileName);
  await writeFile(target, bytes, { flag: "wx" });
  return { id, fileName, target };
}

export function typeFromMime(mime: string): StoredResource["type"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export async function fileSize(filePath: string) { return (await stat(filePath)).size; }

async function findContentDuplicate(items: StoredResource[], input: Omit<StoredResource, "url">, sha256: string) {
  for (const item of items) {
    if (item.id === input.id || item.source === "character" || item.size !== input.size) continue;
    const existingHash = typeof item.metadata?.sha256 === "string"
      ? item.metadata.sha256
      : await fileSha256(safeResourcePath(item.fileName)).catch(() => "");
    if (existingHash === sha256) return item;
  }
  return undefined;
}

async function fileSha256(target: string) {
  return createHash("sha256").update(await readFile(target)).digest("hex");
}

export async function atomicJson(target: string, value: unknown) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

export async function readJson<T = unknown>(target: string, fallback?: T): Promise<T> {
  try { return JSON.parse(await readFile(target, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" && fallback !== undefined) return fallback; throw error; }
}

async function exists(target: string) { try { await access(target); return true; } catch { return false; } }
async function withProjectQueue<T>(id: string, task: () => Promise<T>) {
  const previous = projectQueues.get(id) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  projectQueues.set(id, queued);
  await previous;
  try { return await task(); }
  finally {
    release();
    if (projectQueues.get(id) === queued) projectQueues.delete(id);
  }
}
function projectPath(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("非法项目 ID"); return path.join(projectsDir, id); }
function projectJsonPath(id: string) { return path.join(projectPath(id), "project.json"); }
function cleanName(value: string) { return String(value || "").trim().slice(0, 80); }
