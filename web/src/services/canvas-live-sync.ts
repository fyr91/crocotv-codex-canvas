import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

export type StudioCanvasEdit =
    | { op: "update_node"; nodeId: string; content?: string; title?: string; metadata?: Record<string, unknown> }
    | { op: "delete_node"; nodeId: string }
    | { op: "connect"; fromNodeId: string; toNodeId: string; fromPort?: string; toPort?: string }
    | { op: "disconnect"; connectionId: string };

const sessionKey = "croco-canvas-client-id";

export function canvasClientId() {
    let value = sessionStorage.getItem(sessionKey);
    if (!value) {
        value = crypto.randomUUID();
        sessionStorage.setItem(sessionKey, value);
    }
    return value;
}

export function subscribeCanvasProject(projectId: string, onProject: (project: CanvasProject) => void) {
    const source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/events`);
    let closed = false;
    let refreshPromise: Promise<void> | null = null;
    let latestVersion = 0;
    const applyLatest = (project: CanvasProject) => {
        const version = Math.max(0, Number(project.version) || 0);
        if (version && version <= latestVersion) return;
        if (version) latestVersion = version;
        onProject(project);
    };
    const refresh = () => {
        if (closed || refreshPromise) return refreshPromise;
        refreshPromise = fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
            headers: { "X-Croco-Client-Id": canvasClientId() },
        }).then(async (response) => {
            if (!response.ok) throw new Error(`读取画布最新版本失败（${response.status}）`);
            if (!closed) applyLatest(await response.json() as CanvasProject);
        }).catch(() => {
            // EventSource will reconnect; its next open event performs another refresh.
        }).finally(() => { refreshPromise = null; });
        return refreshPromise;
    };
    const onUpdate = (event: MessageEvent<string>) => {
        try {
            const payload = JSON.parse(event.data) as { project?: CanvasProject; originClientId?: string };
            if (!payload.project || payload.originClientId === canvasClientId()) return;
            applyLatest(payload.project);
        } catch {
            // Ignore malformed local events and wait for the next complete snapshot.
        }
    };
    source.addEventListener("project.updated", onUpdate as EventListener);
    source.addEventListener("open", refresh);
    source.addEventListener("error", refresh);
    void refresh();
    return () => {
        closed = true;
        source.close();
    };
}

export async function applyStudioCanvasEdits(projectId: string, edits: StudioCanvasEdit[]) {
    const response = await fetch(`/api/studio/projects/${encodeURIComponent(projectId)}/canvas-edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Croco-Client-Id": canvasClientId() },
        body: JSON.stringify({ edits }),
    });
    if (!response.ok) throw new Error(await responseError(response, "Studio 结构化修改失败"));
    return await response.json() as CanvasProject;
}

export async function readCanvasProject(projectId: string) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        headers: { "X-Croco-Client-Id": canvasClientId() },
    });
    if (!response.ok) throw new Error(await responseError(response, "读取画布最新版本失败"));
    return await response.json() as CanvasProject;
}

async function responseError(response: Response, fallback: string) {
    try {
        const payload = await response.json() as { error?: string; detail?: string };
        return payload.error || payload.detail || `${fallback}（${response.status}）`;
    } catch {
        return `${fallback}（${response.status}）`;
    }
}
