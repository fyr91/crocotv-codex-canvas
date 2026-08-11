import { supabase } from "@/lib/supabase/client";
import { withAssetUrl, type CloudAsset } from "./cloud-assets";

export type LtxDelivery = {
    mode: "ltx-direct-preview-v1";
    baseUrl: string;
    externalJobId: string;
    ticket: string;
    expiresAt: string;
};

export type LtxPreviewOutput = {
    outputIndex: number;
    url: string;
    mimeType: string;
    providerTaskId?: string;
};

export type LtxStage1ReviewReady = {
    outputIndex: number;
    url: string;
    mimeType: string;
    reviewVersion: number;
    expiresAt?: string;
};

type DeliveryEvent = {
    state?: "waiting" | "queued" | "running" | "ready" | "failed" | "canceled";
    outputIndex?: number;
    progress?: number;
    stage?: string;
    contentUrl?: string;
    mimeType?: string;
    providerTaskId?: string;
    errorMessage?: string;
};

type WatchOptions = {
    signal?: AbortSignal;
    expectedCount: number;
    onState?: (state: "queued" | "running") => void;
    onProgress?: (progress: number, stage?: string) => void;
    onReady?: (output: LtxPreviewOutput) => void;
    reviewEnabled?: boolean;
    onReviewReady?: (review: LtxStage1ReviewReady) => void;
};

export async function watchLtxDelivery(delivery: LtxDelivery, options: WatchOptions) {
    rememberTicket(delivery);
    const ready = new Map<number, LtxPreviewOutput>();
    const failed = new Map<number, string>();
    const progress = new Map<number, number>();
    let eventSource: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    let lastJobCheckAt = 0;
    const reviewLoading = new Set<number>();
    const reviewReady = new Set<number>();
    const reviewUrls = new Set<string>();
    let resolveResult!: (value: LtxPreviewOutput[]) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<LtxPreviewOutput[]>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    const cleanup = () => {
        eventSource?.close();
        if (pollTimer) clearInterval(pollTimer);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        options.signal?.removeEventListener("abort", abort);
        reviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    const finishIfComplete = () => {
        if (settled || ready.size + failed.size < options.expectedCount) return;
        settled = true;
        cleanup();
        const outputs = [...ready.values()].sort((a, b) => a.outputIndex - b.outputIndex);
        if (outputs.length) resolveResult(outputs);
        else rejectResult(new Error([...failed.values()][0] || "LTX 视频生成失败"));
    };
    const refreshReview = async (outputIndex: number) => {
        if (!options.reviewEnabled || reviewLoading.has(outputIndex) || reviewReady.has(outputIndex) || settled) return;
        reviewLoading.add(outputIndex);
        try {
            const status = await requestLtxStage1ReviewStatus(delivery.externalJobId, outputIndex);
            if (!status.ready || !status.reviewVersion || settled) return;
            const preview = await requestLtxStage1Preview(delivery.externalJobId, outputIndex);
            if (settled) return;
            const url = URL.createObjectURL(preview);
            reviewUrls.add(url);
            reviewReady.add(outputIndex);
            options.onReviewReady?.({
                outputIndex,
                url,
                mimeType: preview.type || "video/mp4",
                reviewVersion: status.reviewVersion,
                expiresAt: status.expiresAt,
            });
        } catch {
            // Stage 1 may still be transitioning; the next delivery poll retries.
        } finally {
            reviewLoading.delete(outputIndex);
        }
    };
    const consume = (event: DeliveryEvent) => {
        const outputIndex = Math.max(0, Number(event.outputIndex || 0));
        if (event.state === "ready" && event.contentUrl) {
            if (!ready.has(outputIndex)) {
                const output = {
                    outputIndex,
                    url: absoluteUrl(delivery.baseUrl, event.contentUrl),
                    mimeType: event.mimeType || "video/mp4",
                    providerTaskId: event.providerTaskId,
                };
                ready.set(outputIndex, output);
                failed.delete(outputIndex);
                options.onReady?.(output);
            }
        } else if (event.state === "failed" || event.state === "canceled") {
            if (!ready.has(outputIndex)) failed.set(outputIndex, event.errorMessage || "LTX 视频生成失败");
        } else if (event.state === "running") {
            options.onState?.("running");
            if (event.stage === "stage1_review") void refreshReview(outputIndex);
        } else if (event.state === "queued" || event.state === "waiting") {
            options.onState?.("queued");
        }
        if (Number.isFinite(Number(event.progress))) {
            progress.set(outputIndex, Math.max(0, Math.min(100, Number(event.progress))));
            const average = [...progress.values()].reduce((sum, value) => sum + value, 0) / options.expectedCount;
            options.onProgress?.(average, event.stage);
        }
        finishIfComplete();
    };
    const checkPersistedJob = async () => {
        const checkedAt = Date.now();
        if (settled || checkedAt - lastJobCheckAt < 3000) return;
        lastJobCheckAt = checkedAt;
        const { data, error } = await supabase.from("generation_jobs").select("status,error_message").eq("id", delivery.externalJobId).maybeSingle();
        if (error || !data || (data.status !== "failed" && data.status !== "canceled")) return;
        for (let outputIndex = 0; outputIndex < options.expectedCount; outputIndex += 1) {
            consume({ state: data.status, outputIndex, errorMessage: data.error_message || "LTX 视频生成失败" });
        }
    };
    const poll = async () => {
        try {
            const response = await fetch(clientUrl(delivery, ""), { signal: options.signal, cache: "no-store", referrerPolicy: "no-referrer" });
            if (!response.ok) throw new Error(`LTX status ${response.status}`);
            const snapshot = await response.json() as { state?: string; outputs?: DeliveryEvent[] };
            if (!snapshot.outputs?.length && snapshot.state === "waiting") {
                options.onState?.("queued");
                await checkPersistedJob();
            }
            if (settled) return;
            snapshot.outputs?.forEach(consume);
            if (options.reviewEnabled) {
                snapshot.outputs?.filter((item) => item.stage === "stage1_review").forEach((item) => void refreshReview(Math.max(0, Number(item.outputIndex || 0))));
            }
        } catch (error) {
            if (options.signal?.aborted) abort();
            else if (!eventSource && !settled) rejectResult(error);
        }
    };
    const startPolling = () => {
        if (pollTimer || settled) return;
        void poll();
        pollTimer = setInterval(() => void poll(), 1000);
    };
    const abort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectResult(new DOMException("Aborted", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    else {
        void poll();
        try {
            eventSource = new EventSource(clientUrl(delivery, "/events"));
            eventSource.addEventListener("state", (raw) => consume(JSON.parse((raw as MessageEvent).data)));
            eventSource.addEventListener("ready", (raw) => consume(JSON.parse((raw as MessageEvent).data)));
            eventSource.onerror = () => startPolling();
            fallbackTimer = setTimeout(() => {
                if (!settled && ready.size + failed.size === 0) startPolling();
            }, 5000);
        } catch {
            eventSource = null;
            startPolling();
        }
    }
    return result;
}

export async function requestLtxPreviewTicket(jobId: string) {
    const { data, error } = await supabase.functions.invoke("ltx-preview-ticket", { body: { jobId } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error.message || "LTX 预览恢复失败");
    if (data?.delivery) rememberTicket(data.delivery as LtxDelivery);
    const assets = await Promise.all(((data?.assets || []) as CloudAsset[]).map(withAssetUrl));
    return { job: data?.job, delivery: data?.delivery as LtxDelivery | undefined, assets, outputs: data?.outputs || [] };
}

export async function requestLtxStage1ReviewStatus(jobId: string, outputIndex: number) {
    const { data, error } = await supabase.functions.invoke("ltx-stage1-review", { body: { action: "status", jobId, outputIndex } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error.message || "Stage 1 审核状态读取失败");
    return data as { ready: boolean; state: string; outputIndex: number; reviewVersion?: number; expiresAt?: string };
}

export async function requestLtxStage1Preview(jobId: string, outputIndex: number) {
    const { data, error } = await supabase.functions.invoke("ltx-stage1-review", { body: { action: "preview", jobId, outputIndex } });
    if (error) throw error;
    if (!(data instanceof Blob)) throw new Error("Stage 1 预览格式无效");
    return data;
}

export async function approveLtxStage1(jobId: string, outputIndex: number, expectedVersion: number) {
    const { data, error } = await supabase.functions.invoke("ltx-stage1-review", { body: { action: "approve", jobId, outputIndex, expectedVersion } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error.message || "Stage 2 启动失败");
}

export async function watchArchivedVideoAssets(
    jobId: string,
    expectedCount: number,
    onAsset: (asset: CloudAsset) => void,
    signal?: AbortSignal,
) {
    const delivered = new Set<number>();
    while (!signal?.aborted && delivered.size < expectedCount) {
        const [{ data, error }, { data: outputs }] = await Promise.all([
            supabase.from("assets").select("*").eq("source_generation_id", jobId).eq("kind", "video").order("output_index"),
            supabase.from("generation_outputs").select("generation_state,archive_state").eq("job_id", jobId),
        ]);
        if (!error) {
            for (const item of data || []) {
                const outputIndex = Number(item.output_index || 0);
                if (delivered.has(outputIndex)) continue;
                delivered.add(outputIndex);
                onAsset(await withAssetUrl(item as CloudAsset));
            }
        }
        const terminalCount = (outputs || []).filter((item) =>
            item.archive_state === "saved"
            || item.archive_state === "failed"
            || item.generation_state === "failed"
            || item.generation_state === "canceled"
        ).length;
        if (terminalCount >= expectedCount) return;
        if (delivered.size < expectedCount) await delay(3000, signal);
    }
}

function clientUrl(delivery: LtxDelivery, suffix: string) {
    const url = new URL(`/api/v1/client/jobs/${delivery.externalJobId}${suffix}`, delivery.baseUrl);
    url.searchParams.set("ticket", delivery.ticket);
    return url.toString();
}

function absoluteUrl(baseUrl: string, value: string) {
    return new URL(value, baseUrl).toString();
}

function rememberTicket(delivery: LtxDelivery) {
    try {
        sessionStorage.setItem(`ltx-preview:${delivery.externalJobId}`, JSON.stringify(delivery));
    } catch {
        // The ticket endpoint can renew it after a refresh.
    }
}

function delay(milliseconds: number, signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}
