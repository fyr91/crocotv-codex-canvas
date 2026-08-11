import { AudioLines, Blocks, Image as ImageIcon, Music2, Split, Video, Workflow } from "lucide-react";

import { canvasThemes, type CanvasColorTheme } from "@/lib/canvas-theme";
import { commentColorSurface } from "@/lib/canvas/canvas-comment";
import { canvasNodeImagePreviewUrl, type CanvasRenderDetail } from "@/lib/canvas/canvas-viewport-virtualization";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

type CanvasNodeLodProps = {
    node: CanvasNodeData;
    detail: Exclude<CanvasRenderDetail, "full">;
    selected: boolean;
    related: boolean;
    connectionTarget: boolean;
    readOnly: boolean;
    locked: boolean;
    themeKey: CanvasColorTheme;
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
    onViewImage?: (node: CanvasNodeData) => void;
};

export function CanvasNodeLod({ node, detail, selected, related, connectionTarget, readOnly, locked, themeKey, onMouseDown, onHoverStart, onHoverEnd, onContextMenu, onViewImage }: CanvasNodeLodProps) {
    const theme = canvasThemes[themeKey];
    const active = selected || connectionTarget;
    const isGroup = node.type === CanvasNodeType.Group || node.type === CanvasNodeType.WorkflowGroup;
    const commentSurface = node.type === CanvasNodeType.Comment ? commentColorSurface(node.metadata?.commentColor, themeKey === "dark") : null;
    const hasImage = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const hasVideo = node.type === CanvasNodeType.Video && Boolean(node.metadata?.content);
    const remoteOperationActive = Boolean(node.metadata?.remoteOperationActive);
    const fill = isGroup ? `${theme.toolbar.panel}66` : commentSurface?.background || (hasVideo ? "#000000" : theme.node.fill);
    const border = remoteOperationActive ? "#22c55e" : active ? theme.node.activeStroke : related ? theme.node.muted : commentSurface?.border || theme.node.stroke;
    const outlineImage = detail === "outline" && hasImage ? canvasNodeImagePreviewUrl(node, 64) : "";

    return (
        <div
            data-node-id={node.id}
            className={`node-element absolute select-none ${isGroup ? "z-[5]" : selected ? "z-50" : "z-10"}`}
            style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)`, width: node.width, height: node.height, contain: "strict" }}
            onMouseDown={(event) => onMouseDown(event, node.id)}
            onMouseEnter={() => onHoverStart(node.id)}
            onMouseLeave={() => onHoverEnd(node.id)}
            onContextMenu={(event) => {
                if (readOnly && !locked) {
                    event.preventDefault();
                    return;
                }
                onContextMenu(event, node.id);
            }}
            onDoubleClick={(event) => {
                if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return;
                event.stopPropagation();
                onViewImage?.(node);
            }}
        >
            {detail === "outline" ? (
                <div
                    className="h-full w-full rounded-[18px] border-2"
                    style={{
                        backgroundColor: hasImage ? theme.canvas.background : fill,
                        backgroundImage: outlineImage ? `url("${outlineImage}")` : undefined,
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "contain",
                        borderColor: border,
                        borderStyle: isGroup ? "dashed" : "solid",
                        boxShadow: remoteOperationActive ? "0 0 0 2px rgba(34,197,94,.72), 0 0 28px rgba(34,197,94,.55)" : active ? `0 0 0 2px ${theme.node.activeStroke}55` : undefined,
                    }}
                    title={node.title}
                />
            ) : (
                <div className="relative flex h-full w-full overflow-hidden rounded-3xl border-2" style={{ background: fill, borderColor: border, boxShadow: remoteOperationActive ? "0 0 0 2px rgba(34,197,94,.72), 0 0 28px rgba(34,197,94,.55)" : undefined }}>
                    <CompactNodeContent node={node} color={theme.node.text} />
                    <span className="pointer-events-none absolute inset-x-2 bottom-2 truncate rounded-md px-2 py-1 text-xs font-medium text-white" style={{ background: "rgba(0,0,0,.48)" }}>{node.title || "未命名节点"}</span>
                    {node.metadata?.status === "loading" && !remoteOperationActive ? <span className="absolute right-3 top-3 size-3 animate-pulse rounded-full" style={{ background: theme.node.activeStroke }} /> : null}
                </div>
            )}
        </div>
    );
}

function CompactNodeContent({ node, color }: { node: CanvasNodeData; color: string }) {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) {
        return <img src={canvasNodeImagePreviewUrl(node, 512)} alt="" loading="lazy" decoding="async" fetchPriority="low" draggable={false} className="pointer-events-none h-full w-full object-contain" />;
    }
    const Icon = node.type === CanvasNodeType.Video ? Video
        : node.type === CanvasNodeType.Audio ? AudioLines
            : node.type === CanvasNodeType.Music ? Music2
                : node.type === CanvasNodeType.Config ? Blocks
                    : node.type === CanvasNodeType.Split ? Split
                        : node.type === CanvasNodeType.WorkflowGroup ? Workflow
                            : ImageIcon;
    const text = node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Comment ? node.metadata?.content?.slice(0, 180) : "";
    return text ? <p className="line-clamp-5 h-full w-full overflow-hidden whitespace-pre-wrap p-5 text-sm leading-6" style={{ color }}>{text}</p> : <div className="grid h-full w-full place-items-center" style={{ color }}><Icon className="size-14 opacity-65" /></div>;
}
