import type { ReactNode } from "react";
import { useEffect } from "react";

import { useUserStore } from "@/stores/use-user-store";
import { getModelCatalog } from "@/services/api/model-catalog";
import { useConfigStore } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const initialize = useUserStore((state) => state.initialize);
    const status = useUserStore((state) => state.status);
    const setProviderCatalog = useConfigStore((state) => state.setProviderCatalog);

    useEffect(() => {
        void initialize();
    }, [initialize]);

    useEffect(() => {
        if (status === "anonymous") {
            useAssetStore.setState({ assets: [], hydrated: false });
            useCanvasStore.setState({ projects: [], hydrated: false });
            return;
        }
        if (status !== "authenticated") return;
        const refreshCatalog = () => void getModelCatalog().then(setProviderCatalog).catch(() => undefined);
        refreshCatalog();
        const refreshTimer = window.setInterval(refreshCatalog, 60_000);
        window.addEventListener("focus", refreshCatalog);
        void useAssetStore.getState().initialize();
        void useCanvasStore.getState().initialize();
        return () => {
            window.clearInterval(refreshTimer);
            window.removeEventListener("focus", refreshCatalog);
        };
    }, [setProviderCatalog, status]);

    return <>{children}</>;
}
