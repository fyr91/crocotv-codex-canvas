import { supabase } from "@/lib/supabase/client";
import type { GenerationJob } from "./generation-client";

export type ReasoningJobRow = {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "canceled";
    reasoning_text?: string | null;
};

export function nextReasoningSnapshot(previous: string, job: ReasoningJobRow) {
    const next = job.status === "failed" || job.status === "canceled" ? "" : job.reasoning_text || "";
    return next === previous ? null : next;
}

function sameGenerationJob(current: GenerationJob, next: GenerationJob) {
    return current.id === next.id
        && current.status === next.status
        && current.output_text === next.output_text
        && current.reasoning_text === next.reasoning_text
        && current.error_message === next.error_message
        && JSON.stringify(current.metadata) === JSON.stringify(next.metadata);
}

export function mergeGenerationJobUpdate(current: GenerationJob[] | undefined, update: GenerationJob, allowedIds: ReadonlySet<string>) {
    if (!allowedIds.has(update.id)) return current;
    const index = current?.findIndex((job) => job.id === update.id) ?? -1;
    if (index < 0) return [...(current || []), update];
    if (sameGenerationJob(current![index], update)) return current;
    return current!.map((job, jobIndex) => jobIndex === index ? update : job);
}

function generationJobFromRow(row: Record<string, unknown>) {
    if (typeof row.id !== "string" || !["queued", "running", "succeeded", "failed", "canceled"].includes(String(row.status))) return null;
    const job: GenerationJob = { id: row.id, status: row.status as GenerationJob["status"] };
    for (const key of ["output_text", "reasoning_text", "error_message"] as const) {
        if (typeof row[key] === "string" || row[key] === null) job[key] = row[key];
    }
    if (row.metadata && typeof row.metadata === "object") job.metadata = row.metadata as GenerationJob["metadata"];
    return job;
}

export function watchGenerationJobs(jobIds: string[], onUpdate: (job: GenerationJob) => void) {
    const ids = [...new Set(jobIds)].filter(Boolean).sort();
    if (!ids.length) return () => undefined;
    const allowedIds = new Set(ids);
    const channel = supabase
        .channel(`generation-jobs-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "generation_jobs", filter: `id=in.(${ids.join(",")})` }, (payload) => {
            const job = generationJobFromRow(payload.new);
            if (job && allowedIds.has(job.id)) onUpdate(job);
        })
        .subscribe();
    let closed = false;
    return () => {
        if (closed) return;
        closed = true;
        void supabase.removeChannel(channel);
    };
}

export function watchGenerationJob(jobId: string, onUpdate: (job: ReasoningJobRow) => void) {
    return watchGenerationJobs([jobId], onUpdate);
}
