import { LOCAL_MODELS } from "@/components/layout/app-providers";
import type { ProviderCatalogModel } from "@/stores/use-config-store";

export async function getModelCatalog() {
    return LOCAL_MODELS.map((model) => ({ ...model, config: { ...(model.config || {}) } })) as ProviderCatalogModel[];
}
