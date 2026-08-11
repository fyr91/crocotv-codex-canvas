import { useEffect } from "react";
import type { ReactNode } from "react";
import { Copy, Download, Fingerprint, Group, Trash2, Type } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContextMenuState } from "@/types/canvas";

export function CanvasNodeContextMenu({ menu, canCreateGroup, canDelete, canExportSelected, canCopySelectedNodeIds, selectedExportCount, selectedNodeCount, onClose, onDuplicate, onDuplicateSelectedText, onCopySelectedNodeIds, onCreateGroup, onExportSelected, onDelete }: { menu: ContextMenuState; canCreateGroup: boolean; canDelete: boolean; canExportSelected: boolean; canCopySelectedNodeIds: boolean; selectedExportCount: number; selectedNodeCount: number; onClose: () => void; onDuplicate: () => void; onDuplicateSelectedText: () => void; onCopySelectedNodeIds: () => void; onCreateGroup: () => void; onExportSelected: () => void; onDelete: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {menu.type === "node" ? <MenuButton icon={<Copy className="size-4" />} label="复制节点" onClick={onDuplicate} /> : null}
            {menu.type === "node" && menu.selectedText ? <MenuButton icon={<Type className="size-4" />} label="复制选中文本" onClick={onDuplicateSelectedText} /> : null}
            {canCopySelectedNodeIds ? <MenuButton icon={<Fingerprint className="size-4" />} label={`复制所选节点 ID（${selectedNodeCount}）`} onClick={onCopySelectedNodeIds} /> : null}
            {canExportSelected ? <MenuButton icon={<Download className="size-4" />} label={`打包下载（${selectedExportCount}）`} onClick={onExportSelected} /> : null}
            {canCreateGroup ? <MenuButton icon={<Group className="size-4" />} label="快捷成组" onClick={onCreateGroup} /> : null}
            {canDelete ? <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger /> : null}
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80" style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}
