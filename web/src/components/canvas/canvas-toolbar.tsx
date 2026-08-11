import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useRef, useState } from "react";
import { Button } from "antd";
import { AudioLines, Blocks, BookOpen, Download, Eraser, FolderOpen, Group, Hand, Image as ImageIcon, MessageSquareText, Music2, Redo2, Split, Trash2, Type, Undo2, Upload, Video } from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasFloatingDock } from "@/components/canvas/canvas-floating-dock";

export function CanvasToolbar({
    selectedCount,
    selectedResultCount,
    exportingSelectedResults,
    canUndo,
    canRedo,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddMusic,
    onAddText,
    onAddComment,
    onAddConfig,
    onAddSplit,
    onAddGroup,
    onExportSelectedResults,
    onUndo,
    onRedo,
    onUpload,
    onDelete,
    onClear,
    onDeselect,
    onOpenMyAssets,
    onOpenPrompts,
}: {
    selectedCount: number;
    selectedResultCount: number;
    exportingSelectedResults: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddMusic: () => void;
    onAddText: () => void;
    onAddComment: () => void;
    onAddConfig: () => void;
    onAddSplit: () => void;
    onAddGroup: () => void;
    onExportSelectedResults: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onDelete: () => void;
    onClear: () => void;
    onDeselect: () => void;
    onOpenMyAssets: () => void;
    onOpenPrompts: () => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [hovered, setHovered] = useState<string | null>(null);
    const [tipX, setTipX] = useState(0);
    const hoverStyle = { background: theme.toolbar.itemHover, color: theme.toolbar.activeText };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const tip = hovered ? toolLabel(hovered) : "";

    return (
        <div className="pointer-events-none absolute bottom-5 z-50 flex justify-center" style={{ left: 300, right: 16 }}>
            {tip ? <DockTip label={tip} x={tipX} theme={theme} /> : null}
            <CanvasFloatingDock ref={wrapRef} className="thin-scrollbar pointer-events-auto max-w-full">
                <ToolbarButton id="tool-hand" label="移动/选择" active={!selectedCount} hovered={hovered} activeStyle={activeStyle} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onDeselect}>
                    <Hand className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-undo" label="撤销" disabled={!canUndo} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onUndo}>
                    <Undo2 className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-redo" label="重做" disabled={!canRedo} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onRedo}>
                    <Redo2 className="size-4.5" />
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton id="tool-text" label="文本" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddText}>
                    <Type className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-comment" label="注释" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddComment}>
                    <MessageSquareText className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-image" label="图片" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddImage}>
                    <ImageIcon className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-video" label="视频" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddVideo}>
                    <Video className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-audio" label="音频" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddAudio}>
                    <AudioLines className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-music" label="音乐" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddMusic}>
                    <Music2 className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-config" label="生成模组" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddConfig}>
                    <Blocks className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-split" label="拆分" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddSplit}>
                    <Split className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-group" label="组" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onAddGroup}>
                    <Group className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-upload" label="上传素材" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onUpload}>
                    <Upload className="size-4.5" />
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton id="tool-assets" label="素材" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onOpenMyAssets}>
                    <FolderOpen className="size-4.5" />
                </ToolbarButton>
                {selectedCount ? (
                    <>
                        <Divider theme={theme} />
                        {selectedResultCount ? (
                            <ToolbarButton id="tool-export-results" label={`导出已选结果（${selectedResultCount}）`} disabled={exportingSelectedResults} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onExportSelectedResults}>
                                <Download className="size-4.5" />
                            </ToolbarButton>
                        ) : null}
                        <ToolbarButton id="tool-delete" label="删除选中" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onDelete} danger>
                            <Trash2 className="size-4.5" />
                        </ToolbarButton>
                    </>
                ) : null}
                <Divider theme={theme} />
                <ToolbarButton id="tool-clear" label="清空画布" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onClear} danger>
                    <Eraser className="size-4.5" />
                </ToolbarButton>
            </CanvasFloatingDock>

        </div>
    );
}

function ToolbarButton({
    id,
    label,
    active,
    hovered,
    activeStyle,
    hoverStyle,
    wrapRef,
    onTipX,
    onHover,
    onClick,
    disabled = false,
    danger = false,
    children,
}: {
    id: string;
    label: string;
    active?: boolean;
    hovered: string | null;
    activeStyle?: CSSProperties;
    hoverStyle: CSSProperties;
    wrapRef: RefObject<HTMLDivElement | null>;
    onTipX: (x: number) => void;
    onHover: (id: string | null) => void;
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    disabled?: boolean;
    danger?: boolean;
    children: ReactNode;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <Button
            type="text"
            aria-label={label}
            className="!h-8 !w-8 !min-w-8 !p-0"
            disabled={disabled}
            style={active ? activeStyle : hovered === id && !disabled ? hoverStyle : { color: danger ? "#f87171" : theme.toolbar.item, opacity: disabled ? 0.35 : 1 }}
            icon={children}
            onMouseEnter={(event) => {
                onHover(id);
                onTipX(getTipX(wrapRef.current, event.currentTarget));
            }}
            onMouseLeave={() => onHover(null)}
            onClick={onClick}
        />
    );
}

function Divider({ theme }: { theme: CanvasTheme }) {
    return <div className="mx-1 h-6 w-px" style={{ background: theme.toolbar.border }} />;
}

function DockTip({ label, x, theme }: { label: string; x: number; theme: CanvasTheme }) {
    return (
        <span className="absolute bottom-[calc(100%+8px)] -translate-x-1/2 rounded-md px-2 py-1 text-xs shadow-lg" style={{ left: x, background: theme.node.text, color: theme.node.panel }}>
            {label}
        </span>
    );
}

function toolLabel(id: string) {
    if (id === "tool-hand") return "移动/选择";
    if (id === "tool-undo") return "撤销";
    if (id === "tool-redo") return "重做";
    if (id === "tool-text") return "文本";
    if (id === "tool-comment") return "注释";
    if (id === "tool-image") return "图片";
    if (id === "tool-video") return "视频";
    if (id === "tool-audio") return "音频";
    if (id === "tool-music") return "音乐";
    if (id === "tool-config") return "生成模组";
    if (id === "tool-split") return "拆分";
    if (id === "tool-group") return "组";
    if (id === "tool-upload") return "上传素材";
    if (id === "tool-assets") return "素材";
    if (id === "tool-prompts") return "提示词";
    if (id === "tool-export-results") return "导出已选结果";
    if (id === "tool-delete") return "删除选中";
    if (id === "tool-clear") return "清空画布";
    return "";
}

function getTipX(wrap: HTMLDivElement | null, target: HTMLElement) {
    if (!wrap) return 0;
    const wrapBox = wrap.parentElement?.getBoundingClientRect() || wrap.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.left - wrapBox.left + box.width / 2;
}
