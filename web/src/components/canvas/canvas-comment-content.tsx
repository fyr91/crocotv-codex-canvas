import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { CanvasNodeData } from "@/types/canvas";
import type { CanvasTheme } from "@/lib/canvas-theme";

export function CanvasCommentContent({ node, theme, readOnly, editing, onContentChange, onStopEditing }: { node: CanvasNodeData; theme: CanvasTheme; readOnly: boolean; editing: boolean; onContentChange: (nodeId: string, content: string) => void; onStopEditing: () => void }) {
    const [draft, setDraft] = useState(node.metadata?.content || "");
    const highContrastGreen = node.metadata?.commentColor === "green";
    const contentColor = highContrastGreen ? "#ffffff" : theme.node.text;
    const borderColor = highContrastGreen ? "rgba(255,255,255,.42)" : theme.node.stroke;
    const mutedColor = highContrastGreen ? "rgba(255,255,255,.72)" : theme.node.placeholder;
    const originalRef = useRef(draft);
    const wasEditingRef = useRef(false);
    const discardRef = useRef(false);

    useEffect(() => {
        if (editing && !wasEditingRef.current) {
            const content = node.metadata?.content || "";
            originalRef.current = content;
            setDraft(content);
        }
        if (!editing && wasEditingRef.current) {
            if (discardRef.current) discardRef.current = false;
            else if (draft !== originalRef.current) onContentChange(node.id, draft);
        }
        wasEditingRef.current = editing;
    }, [draft, editing, node.id, node.metadata?.content, onContentChange]);

    if (editing && !readOnly) return (
        <textarea
            autoFocus
            value={draft}
            className="thin-scrollbar h-full w-full resize-none border-0 bg-transparent p-5 font-mono text-sm leading-6 outline-none"
            style={{ color: contentColor }}
            placeholder="使用 Markdown 编写说明…"
            onChange={(event) => setDraft(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === "Escape") { discardRef.current = true; setDraft(originalRef.current); onStopEditing(); }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { onContentChange(node.id, draft); originalRef.current = draft; onStopEditing(); }
            }}
        />
    );

    return (
        <div data-canvas-scroll className="thin-scrollbar h-full w-full overflow-y-auto overscroll-contain p-5 text-sm leading-6" style={{ color: contentColor }} onWheel={(event) => event.stopPropagation()}>
            {node.metadata?.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold">{children}</h1>,
                h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-semibold">{children}</h2>,
                h3: ({ children }) => <h3 className="mb-2 mt-3 font-semibold">{children}</h3>,
                p: ({ children }) => <p className="my-2">{children}</p>,
                ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
                blockquote: ({ children }) => <blockquote className="my-3 border-l-2 pl-3 opacity-75" style={{ borderColor }}>{children}</blockquote>,
                table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-xs">{children}</table></div>,
                th: ({ children }) => <th className="border p-2 text-left" style={{ borderColor }}>{children}</th>,
                td: ({ children }) => <td className="border p-2" style={{ borderColor }}>{children}</td>,
                a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{children}</a>,
                code: ({ children }) => <code className="rounded px-1 py-0.5 font-mono text-[0.9em]" style={{ background: highContrastGreen ? "rgba(0,0,0,.2)" : `${theme.toolbar.panel}aa` }}>{children}</code>,
            }}>{node.metadata.content}</ReactMarkdown> : <span style={{ color: mutedColor }}>双击编辑 Markdown 注释</span>}
            {node.metadata?.commentBeautifying ? <span className="absolute bottom-3 right-4 rounded-full px-2 py-1 text-[10px]" style={{ background: `${theme.toolbar.panel}dd`, color: theme.node.muted }}>正在美化…</span> : null}
        </div>
    );
}
