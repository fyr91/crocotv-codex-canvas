import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

export type ProviderChannel = { id: string; display_name: string; base_url: string; enabled: boolean; custom_voices: { name: string; speakerId: string }[]; credentialConfigured: boolean; credentialHint: string };
export type ProviderModel = { id: string; provider_id: string; capability: "llm" | "image" | "video" | "speech" | "music"; model_key: string; display_name: string; config: Record<string, unknown>; enabled: boolean; is_default: boolean; pricing: Record<string, number | null> | null };
export type ProviderCatalog = { channels: ProviderChannel[]; models: ProviderModel[] };

export async function getAdminProviders() {
    const { data, error } = await supabase.functions.invoke("admin-providers", { method: "GET" });
    if (error) throw error;
    if (data?.error) throw new Error(data.error.message);
    return data as ProviderCatalog;
}

export async function manageProvider(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("admin-providers", { body });
    if (error) throw new Error(await providerAdminErrorMessage(error));
    if (data?.error) throw new Error(data.error.message);
    return data;
}

export async function syncLtxCapabilities(modelId: string) {
    return manageProvider({ action: "sync-ltx-capabilities", modelId });
}

async function providerAdminErrorMessage(error: unknown) {
    if (error instanceof FunctionsHttpError) {
        try {
            const payload = await error.context.json() as { error?: { message?: string }; message?: string };
            return payload.error?.message || payload.message || error.message;
        } catch { /* response body is not JSON */ }
    }
    return error instanceof Error ? error.message : "服务配置保存失败";
}
