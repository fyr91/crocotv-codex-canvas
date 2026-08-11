import { create } from "zustand";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { canvasProjectDocument } from "@/lib/canvas/canvas-project-document";
import { filterCanvasCommentConnections } from "@/lib/canvas/canvas-comment";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";
import { canvasClientId } from "@/services/canvas-live-sync";

export type CanvasSaveStatus = "saved" | "saving" | "retrying" | "paused" | "blocked";
export type CanvasSaveState = { status: CanvasSaveStatus; message: string };
export type CanvasProject = { id: string; ownerId: string; ownerName: string; ownerUsername: string; title: string; createdAt: string; updatedAt: string; version?: number; nodes: CanvasNodeData[]; connections: CanvasConnection[]; chatSessions: CanvasAssistantSession[]; activeChatId: string | null; backgroundMode: CanvasBackgroundMode; showImageInfo: boolean; viewport: ViewportTransform };
type ProjectPatch = Partial<Pick<CanvasProject, "title" | "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>;
type CanvasStore = { hydrated: boolean; projects: CanvasProject[]; saveStates: Record<string, CanvasSaveState>; initialize: () => Promise<void>; createProject: (title?: string) => string; importProject: (project: Partial<CanvasProject>) => string; copyProject: (id: string) => Promise<string>; loadTemplatePreview: (id: string) => Promise<void>; openProject: (id: string) => CanvasProject | null; renameProject: (id: string, title: string) => void; deleteProjects: (ids: string[]) => Promise<string[]>; replaceProjects: (projects: CanvasProject[]) => void; applyRemoteProject: (project: CanvasProject) => void; updateProject: (id: string, patch: ProjectPatch) => void };

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let initializationPromise: Promise<void> | null = null;

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
    hydrated: false,
    projects: [],
    saveStates: {},
    initialize: async () => {
        if (get().hydrated) return;
        if (!initializationPromise) initializationPromise = initializeWhenLocalServiceReady(set).finally(() => { initializationPromise = null; });
        await initializationPromise;
    },
    createProject: (title = "未命名画布") => {
        const project = emptyProject(title);
        set((state) => ({ projects: [project, ...state.projects], saveStates: { ...state.saveStates, [project.id]: { status: "saving", message: "正在创建本地文件夹" } } }));
        void localFetch("/api/projects", { method: "POST", body: JSON.stringify({ id: project.id, title }) }).then(() => setSaveState(project.id, "saved", "已保存到本地")).catch((error) => setSaveState(project.id, "blocked", error.message));
        return project.id;
    },
    importProject: (source) => {
        const project = { ...emptyProject(source.title || "导入画布"), ...source, id: crypto.randomUUID(), ownerId: "local", ownerName: "本地用户", ownerUsername: "local", updatedAt: new Date().toISOString(), version: 1 } as CanvasProject;
        project.connections = filterCanvasCommentConnections(project.nodes, project.connections || []);
        set((state) => ({ projects: [project, ...state.projects], saveStates: { ...state.saveStates, [project.id]: { status: "saving", message: "正在创建本地文件夹" } } }));
        void localFetch("/api/projects", { method: "POST", body: JSON.stringify({ id: project.id, title: project.title }) }).then(() => saveNow(project)).catch((error) => setSaveState(project.id, "blocked", error.message));
        return project.id;
    },
    copyProject: async (id) => {
        const source = get().projects.find((project) => project.id === id);
        if (!source) throw new Error("画布不存在");
        const copy = structuredClone(source); copy.id = crypto.randomUUID(); copy.title = `${source.title} - 副本`; copy.createdAt = copy.updatedAt = new Date().toISOString(); copy.version = 1;
        await localFetch("/api/projects", { method: "POST", body: JSON.stringify({ id: copy.id, title: copy.title }) }); await saveNow(copy);
        set((state) => ({ projects: [copy, ...state.projects], saveStates: { ...state.saveStates, [copy.id]: { status: "saved", message: "已保存到本地" } } }));
        return copy.id;
    },
    loadTemplatePreview: async () => {},
    openProject: (id) => get().projects.find((project) => project.id === id) || null,
    renameProject: (id, title) => { const value = title.trim() || "未命名画布"; set((state) => ({ projects: state.projects.map((project) => project.id === id ? { ...project, title: value, updatedAt: new Date().toISOString() } : project) })); scheduleSave(id); },
    deleteProjects: async (ids) => { await Promise.all(ids.map((id) => localFetch(`/api/projects/${id}`, { method: "DELETE" }))); set((state) => ({ projects: state.projects.filter((project) => !ids.includes(project.id)) })); return ids; },
    replaceProjects: (projects) => set({ projects }),
    applyRemoteProject: (rawProject) => {
        const previous = timers.get(rawProject.id);
        if (previous) clearTimeout(previous);
        timers.delete(rawProject.id);
        const project = hydrateProject(rawProject);
        set((state) => ({
            projects: state.projects.some((item) => item.id === project.id)
                ? state.projects.map((item) => item.id === project.id && (Number(project.version) || 0) >= (Number(item.version) || 0) ? project : item)
                : [project, ...state.projects],
            saveStates: { ...state.saveStates, [project.id]: { status: "saved", message: "已同步本地画布" } },
        }));
    },
    updateProject: (id, patch) => { set((state) => ({ projects: state.projects.map((project) => project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project) })); scheduleSave(id); },
}));

async function initializeWhenLocalServiceReady(set: (partial: Partial<CanvasStore>) => void) {
    let retryDelay = 250;
    for (;;) {
        try {
            const summaries = await localFetch<Array<{ id: string }>>("/api/projects");
            const projects = await Promise.all(summaries.map((item) => localFetch<CanvasProject>(`/api/projects/${item.id}`).then(hydrateProject)));
            set({ projects, saveStates: Object.fromEntries(projects.map((project) => [project.id, { status: "saved", message: "已保存到本地" }])), hydrated: true });
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            retryDelay = Math.min(2_000, retryDelay * 2);
        }
    }
}

function emptyProject(title: string): CanvasProject { const now = new Date().toISOString(); return { id: crypto.randomUUID(), ownerId: "local", ownerName: "本地用户", ownerUsername: "local", title, createdAt: now, updatedAt: now, version: 1, nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: initialViewport }; }
function scheduleSave(id: string) { const previous = timers.get(id); if (previous) clearTimeout(previous); setSaveState(id, "saving", "保存中"); timers.set(id, setTimeout(async () => { timers.delete(id); const project = useCanvasStore.getState().projects.find((item) => item.id === id); if (!project) return; try { await saveNow(project); setSaveState(id, "saved", "已保存到本地"); } catch (error) { setSaveState(id, "retrying", error instanceof Error ? error.message : "本地保存失败"); } }, 500)); }
async function saveNow(project: CanvasProject) {
    try {
        const saved = await localFetch<CanvasProject>(`/api/projects/${project.id}`, { method: "PUT", body: JSON.stringify({ ...project, ...canvasProjectDocument(project), ownerId: "local", ownerName: "本地用户", ownerUsername: "local" }) });
        useCanvasStore.getState().applyRemoteProject(saved);
    } catch (error) {
        if (!(error instanceof LocalApiError) || error.status !== 409) throw error;
        const latest = await localFetch<CanvasProject>(`/api/projects/${project.id}`);
        useCanvasStore.getState().applyRemoteProject(latest);
    }
}
function setSaveState(id: string, status: CanvasSaveStatus, message: string) {
    useCanvasStore.setState((state) => ({ saveStates: { ...state.saveStates, [id]: { status, message } } }));
}

function hydrateProject(rawProject: CanvasProject & { name?: string; edges?: Array<{ id: string; from: string; to: string }>; viewport?: ViewportTransform & { zoom?: number } }) {
    const rawNodes = Array.isArray(rawProject.nodes) ? rawProject.nodes : [];
    const nodes = rawNodes.map((node) => isLegacyNode(node) ? migrateLegacyNode(node) : hydrateNode(node));
    const rawConnections = Array.isArray(rawProject.connections)
        ? rawProject.connections
        : (rawProject.edges || []).map((edge) => ({ id: edge.id, fromNodeId: edge.from, toNodeId: edge.to }));
    const viewport = rawProject.viewport?.k
        ? rawProject.viewport
        : { x: Number(rawProject.viewport?.x) || 0, y: Number(rawProject.viewport?.y) || 0, k: Number(rawProject.viewport?.zoom) || 1 };
    return {
        ...emptyProject(rawProject.title || rawProject.name || "未命名画布"),
        ...rawProject,
        title: rawProject.title || rawProject.name || "未命名画布",
        ownerId: "local",
        ownerName: "本地用户",
        ownerUsername: "local",
        nodes,
        connections: filterCanvasCommentConnections(nodes, rawConnections),
        viewport,
    } as CanvasProject;
}

function hydrateNode(node: CanvasNodeData): CanvasNodeData {
    return node.metadata?.storageKey ? { ...node, metadata: { ...node.metadata, content: `/files/by-id/${node.metadata.storageKey}` } } : node;
}

function isLegacyNode(node: CanvasNodeData): node is CanvasNodeData & { kind: string; x: number; y: number; content?: string; status?: string; resourceId?: string } {
    return typeof (node as CanvasNodeData & { kind?: unknown }).kind === "string";
}

function migrateLegacyNode(node: CanvasNodeData & { kind: string; x: number; y: number; content?: string; status?: string; resourceId?: string }): CanvasNodeData {
    const type = node.kind === "prompt" ? CanvasNodeType.Config : node.kind === "image" ? CanvasNodeType.Image : node.kind === "video" ? CanvasNodeType.Video : node.kind === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Text;
    const isText = type === CanvasNodeType.Text;
    const storageKey = node.resourceId;
    return {
        id: node.id,
        type,
        title: node.title || (type === CanvasNodeType.Config ? "生成模组" : "文本"),
        position: { x: Number(node.x) || 0, y: Number(node.y) || 0 },
        width: Number(node.width) || 320,
        height: Number(node.height) || (type === CanvasNodeType.Config ? 360 : 240),
        metadata: type === CanvasNodeType.Config
            ? { generationMode: "text", composerContent: node.content || "", status: "idle" }
            : { content: isText ? node.content || "" : storageKey ? `/files/by-id/${storageKey}` : undefined, prompt: isText ? undefined : node.content, storageKey, status: storageKey || isText ? "success" : "idle" },
    };
}
class LocalApiError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

async function localFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", "X-Croco-Client-Id": canvasClientId(), ...init?.headers } }); if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new LocalApiError(payload.error || `本地请求失败（${response.status}）`, response.status); } return response.status === 204 ? undefined as T : response.json(); }
