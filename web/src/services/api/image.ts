import { nanoid } from "nanoid";

import { modelOptionName, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export type AiTextContent = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | { type: "video_url"; video_url: { url: string } } | { type: "audio_url"; audio_url: { url: string } };
export type AiTextMessage = { role: "system" | "user" | "assistant"; content: string | AiTextContent[] };
type RequestOptions = { signal?: AbortSignal; webSearch?: boolean; clientRequestId?: string; systemPrompt?: string; systemPromptId?: string; systemPromptVersion?: number; onJobCreated?: (jobId: string) => void; onReasoning?: (value: string, jobId: string) => void };

export function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions) { return generateImages(config, prompt, [], options); }
export function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], _mask?: ReferenceImage, options?: RequestOptions) { return generateImages(config, prompt, references.map((item) => item.storageKey).filter(Boolean) as string[], options); }

async function generateImages(config: AiConfig, prompt: string, referenceResourceIds: string[], options?: RequestOptions) {
    const count = Math.max(1, Math.min(15, Number(config.count) || 1));
    return Promise.all(Array.from({ length: count }, async (_, outputIndex) => {
        const jobId = crypto.randomUUID(); options?.onJobCreated?.(jobId);
        const [width, height] = imageDimensions(config.size);
        const payload = await localRequest<{ resource: { id: string; url: string } }>("/api/generate/image", { prompt, model: modelOptionName(config.model || config.imageModel), width, height, referenceResourceIds }, options?.signal);
        return { id: payload.resource.id || nanoid(), dataUrl: payload.resource.url, storageKey: payload.resource.id, outputIndex };
    }));
}

export async function requestImageQuestion(_config: AiConfig, messages: AiTextMessage[], options?: RequestOptions) {
    const prompt = messages.map((message) => typeof message.content === "string" ? `${message.role}: ${message.content}` : `${message.role}: ${message.content.filter((item) => item.type === "text").map((item) => "text" in item ? item.text : "").join("\n")}`).join("\n\n");
    const inputResourceIds = Array.from(new Set(messages.flatMap((message) => typeof message.content === "string" ? [] : message.content.flatMap((item) => {
        if (item.type === "text") return [];
        const url = item.type === "image_url" ? item.image_url.url : item.type === "video_url" ? item.video_url.url : item.audio_url.url;
        const match = url.match(/\/files\/by-id\/([^/?#]+)/);
        return match ? [decodeURIComponent(match[1])] : [];
    }))));
    const jobId = crypto.randomUUID(); options?.onJobCreated?.(jobId);
    return (await localRequest<{ text: string }>("/api/generate/text", { prompt, model: modelOptionName(_config.textModel || _config.model), inputResourceIds }, options?.signal)).text;
}
export async function fetchImageModels() { return ["google:nano-banana@2-lite", "google:4@1", "openai:gpt-image@2"]; }
export async function fetchChannelModels(_channel: ModelChannel) { return fetchImageModels(); }
async function localRequest<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "本地生成失败"); return payload; }
function imageDimensions(size: string): [number, number] { const match = String(size || "").match(/^(\d+)x(\d+)$/i); return match ? [Number(match[1]), Number(match[2])] : [1024, 1024]; }
