import { supabase } from "@/lib/supabase/client";
import type { ProviderCatalogModel } from "@/stores/use-config-store";

export async function getModelCatalog() {
    const { data, error } = await supabase.functions.invoke("generate", { method: "GET" });
    if (error) throw error;
    if (data?.error) throw new Error(data.error.message);
    return (data?.models || []) as ProviderCatalogModel[];
}
