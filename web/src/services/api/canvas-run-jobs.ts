export type CanvasRunNodeResult = {
    configNodeId: string;
    outputNodeIds: string[];
    status: "success" | "error";
    error?: string;
};

export type CanvasRunJobSnapshot = {
    jobId: string;
    projectId: string;
    nodeIds: string[];
    concurrency: number;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    result?: {
        projectId: string;
        results: CanvasRunNodeResult[];
        projectVersion: number;
    };
    error?: string;
};

export async function startCanvasRunJob(projectId: string, nodeIds: string[], concurrency = 1) {
    return requestCanvasRunJob(`/api/canvas/projects/${encodeURIComponent(projectId)}/run-nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds, concurrency, async: true }),
    });
}

export async function readCanvasRunJob(jobId: string, signal?: AbortSignal) {
    return requestCanvasRunJob(`/api/canvas/run-jobs/${encodeURIComponent(jobId)}`, { cache: "no-store", signal });
}

export async function cancelCanvasRunJob(jobId: string) {
    return requestCanvasRunJob(`/api/canvas/run-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}

export async function waitForCanvasRunJob(jobId: string, options: { signal?: AbortSignal; pollIntervalMs?: number } = {}) {
    const interval = Math.max(10, options.pollIntervalMs ?? 350);
    while (true) {
        options.signal?.throwIfAborted();
        const snapshot = await readCanvasRunJob(jobId, options.signal);
        if (["completed", "failed", "cancelled"].includes(snapshot.status)) return snapshot;
        await abortableDelay(interval, options.signal);
    }
}

async function requestCanvasRunJob(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as CanvasRunJobSnapshot & { detail?: string };
    if (!response.ok) throw new Error(payload.error || payload.detail || `画布生成任务请求失败（${response.status}）`);
    return payload;
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, milliseconds);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
