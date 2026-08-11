import { useEffect } from "react";
import { Download } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function KouboNodeContextMenu({
    x,
    y,
    downloadCount,
    downloading,
    onClose,
    onDownload,
}: {
    x: number;
    y: number;
    downloadCount: number;
    downloading: boolean;
    onClose: () => void;
    onDownload: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    useEffect(() => {
        window.addEventListener("pointerdown", onClose);
        return () => window.removeEventListener("pointerdown", onClose);
    }, [onClose]);
    return (
        <div
            className="fixed z-[80] min-w-48 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: x, top: y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!downloadCount || downloading}
                onClick={onDownload}
            >
                <Download className="size-4" />
                <span>{downloading ? "正在准备下载…" : `下载选中内容（${downloadCount}）`}</span>
            </button>
        </div>
    );
}
