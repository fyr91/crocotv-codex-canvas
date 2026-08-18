export type DirectGenerationJobProgress = {
    stage: "submitted" | "queued" | "running" | "completed";
    jobId: string;
    outputIndex: number;
    progress?: number;
    label: string;
};

type DirectGenerationProgressSnapshot = {
    requestId: string;
    status: "pending" | "running" | "completed" | "failed";
    jobs: DirectGenerationJobProgress[];
    error?: string;
};

export type DirectGenerationProgressHandlers = {
    onJobCreated?: (jobId: string, outputIndex: number) => void;
    onStatusChange?: (status: "queued" | "running" | "succeeded" | "failed", outputIndex: number) => void;
    onProgress?: (progress: number, stage: string, outputIndex: number) => void;
};

const pollIntervalMs = 350;

export function watchDirectGenerationProgress(requestId: string, handlers: DirectGenerationProgressHandlers) {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activePoll: Promise<void> | undefined;
    const jobSignatures = new Map<number, string>();

    const poll = async () => {
        if (stopped) return;
        try {
            const response = await fetch(`/api/generate/progress/${encodeURIComponent(requestId)}`, { cache: "no-store" });
            if (response.status === 404) return;
            const snapshot = await response.json() as DirectGenerationProgressSnapshot & { error?: string };
            if (!response.ok) throw new Error(snapshot.error || "读取生成进度失败");
            for (const job of snapshot.jobs || []) {
                const signature = `${job.jobId}:${job.stage}:${job.progress ?? ""}:${job.label}`;
                if (jobSignatures.get(job.outputIndex) === signature) continue;
                const isNewJob = !jobSignatures.has(job.outputIndex);
                jobSignatures.set(job.outputIndex, signature);
                if (isNewJob) handlers.onJobCreated?.(job.jobId, job.outputIndex);
                handlers.onStatusChange?.(job.stage === "submitted" || job.stage === "queued" ? "queued" : job.stage === "completed" ? "succeeded" : "running", job.outputIndex);
                handlers.onProgress?.(Math.max(0, Math.min(100, Number(job.progress) || 0)), job.label, job.outputIndex);
            }
            if (snapshot.status === "failed") {
                const indexes = snapshot.jobs.length ? snapshot.jobs.map((job) => job.outputIndex) : [0];
                indexes.forEach((outputIndex) => handlers.onStatusChange?.("failed", outputIndex));
            }
        } catch {
            // The generation request remains authoritative. Progress polling is best effort.
        }
    };

    const schedule = () => {
        if (stopped) return;
        timer = setTimeout(() => {
            activePoll = poll().finally(schedule);
        }, pollIntervalMs);
    };

    activePoll = poll().finally(schedule);
    return {
        async finish() {
            if (timer) clearTimeout(timer);
            await activePoll;
            await poll();
            stopped = true;
            if (timer) clearTimeout(timer);
        },
        stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
        },
    };
}
