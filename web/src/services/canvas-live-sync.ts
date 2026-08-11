import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

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
