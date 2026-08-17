import { modelOptionName, providerIdForModel } from "@/stores/use-config-store";
import type { CloudAsset } from "./cloud-assets";

export type GenerationCapability = "llm" | "image" | "video" | "speech" | "music";
export type GenerationJob = { id: string; provider_id?: string; status: "queued" | "running" | "succeeded" | "failed" | "canceled"; output_text?: string | null; reasoning_text?: string | null; error_message?: string | null; metadata?: Record<string, unknown> };

export function modelId(value: string) { return modelOptionName(value); }
export async function createGeneration(input: { capability: GenerationCapability; model: string; prompt: string; params?: Record<string, unknown>; inputAssetIds?: string[]; inputImageOverrides?: Array<{ assetId: string; dataUrl: string }>; clientRequestId?: string; signal?: AbortSignal }): Promise<{ job: GenerationJob; assets?: CloudAsset[] }> {
    if (input.capability === "music") {
        const payload = await localRequest<{ resources: Array<{ id: string; name: string; url: string; mimeType: string; size: number; metadata?: Record<string, unknown> }> }>("/api/generate/music", { prompt: input.prompt, model: modelOptionName(input.model), params: input.params }, input.signal);
        return { job: { id: crypto.randomUUID(), provider_id: "suno", status: "succeeded" }, assets: payload.resources.map((resource, outputIndex) => ({ id: resource.id, kind: "audio", title: resource.name.replace(/\.mp3$/i, ""), url: resource.url, storage_path: null, byte_size: resource.size, mime_type: resource.mimeType, duration_seconds: Number(resource.metadata?.duration) || undefined, coverUrl: String(resource.metadata?.coverUrl || ""), output_index: outputIndex })) };
    }
    if (input.capability !== "llm") throw new Error(`本地模式未启用 ${input.capability} 通用任务入口`);
    const text = await localText(input.prompt, input.model, input.inputAssetIds, input.inputImageOverrides?.map((item) => item.dataUrl), input.signal);
    const providerId = providerIdForModel(input.model);
    return { job: { id: crypto.randomUUID(), provider_id: providerId === "runware" ? "runware" : providerId === "bigmodel" ? "bigmodel" : "coding_plan", status: "succeeded" as const, output_text: text }, assets: [] };
}
export async function requestTextGeneration(input: { model: string; prompt: string; params?: Record<string, unknown>; inputAssetIds?: string[]; inputImageOverrides?: Array<{ assetId: string; dataUrl: string }>; signal?: AbortSignal; onJobCreated?: (jobId: string) => void; onReasoning?: (value: string, jobId: string) => void }) {
    const id = crypto.randomUUID(); input.onJobCreated?.(id); return localText(input.prompt, input.model, input.inputAssetIds, input.inputImageOverrides?.map((item) => item.dataUrl), input.signal);
}
export function requestSplitGeneration(input: { model: string; prompt: string; systemPrompt: string; splitCount: "auto" | number; inputAssetIds: string[]; signal?: AbortSignal; onJobCreated?: (jobId: string) => void; onReasoning?: (value: string, jobId: string) => void }) { return requestTextGeneration({ ...input, prompt: `${input.systemPrompt}\n\n${input.prompt}` }); }
export async function getGenerationJob(id: string): Promise<GenerationJob> { return { id, status: "failed", error_message: "本地任务已中断，请重新生成" }; }
export async function waitForGeneration(id: string, _signal?: AbortSignal, _onStatus?: (status: GenerationJob["status"]) => void, _onReasoning?: (value: string, jobId: string) => void, _onUpdate?: (job: GenerationJob) => void): Promise<{ job: GenerationJob; assets: CloudAsset[] }> { throw new Error(`本地任务 ${id} 已中断，请重新生成`); }
export async function listGenerationRecords(_capability?: GenerationCapability): Promise<Array<GenerationJob & { assets: CloudAsset[] }>> { return []; }
export async function deleteGenerationJobs(_ids?: string[]) {}
export async function functionErrorMessage(error: unknown) { return error instanceof Error ? error.message : "本地生成失败"; }
async function localText(prompt: string, model: string, inputResourceIds: string[] = [], inputDataUrls: string[] = [], signal?: AbortSignal) { return (await localRequest<{ text: string }>("/api/generate/text", { prompt, model: modelOptionName(model), inputResourceIds, inputDataUrls }, signal)).text; }
async function localRequest<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "本地生成失败"); return payload; }
