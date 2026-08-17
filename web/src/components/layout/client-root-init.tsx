import type { ReactNode } from "react";
import { useEffect } from "react";

import { useUserStore } from "@/stores/use-user-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const initialize = useUserStore((state) => state.initialize);
    const status = useUserStore((state) => state.status);

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
        void useAssetStore.getState().initialize();
        void useCanvasStore.getState().initialize();
    }, [status]);

    return <>{children}</>;
}
