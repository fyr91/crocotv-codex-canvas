import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Image } from "antd";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { appendCanvasPromptBlock, isCanvasPromptValueAllowed, shouldRenderCanvasPromptValue, type CanvasPromptEditorToken } from "@/lib/canvas/prompt-editor-state";
import { isImeComposing, isPlainEnterKey } from "@/lib/keyboard-event";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasPromptEditorReference = {
    key: string;
    kind: "image" | "video" | "audio" | "text";
    label: string;
    title: string;
    previewUrl?: string;
    text?: string;
};

export type { CanvasPromptEditorToken } from "@/lib/canvas/prompt-editor-state";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange"> & {
    value: string;
    tokens: CanvasPromptEditorToken[];
    references: CanvasPromptEditorReference[];
    placeholder?: string;
    placeholderClassName?: string;
    containerClassName?: string;
    cornerAction?: ReactNode;
    maxLength?: number;
    serializeReference: (reference: CanvasPromptEditorReference) => string;
    onChange: (value: string) => void;
    onSubmit?: () => void;
};

type MentionState = { query: string };

export const CanvasPromptEditor = forwardRef<HTMLDivElement, Props>(function CanvasPromptEditor({ value, tokens, references, placeholder, placeholderClassName, containerClassName, cornerAction, maxLength, serializeReference, onChange, onSubmit, className, style, onKeyDown, onBlur, onMouseDown, onPointerDown, onWheel, ...props }, forwardedRef) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<HTMLDivElement | null>(null);
    const composingRef = useRef(false);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const referenceByKey = useMemo(() => new Map(references.map((reference) => [reference.key, reference])), [references]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        if (!query) return references;
        return references.filter((reference) => `${reference.label} ${reference.title} ${reference.kind} ${reference.text || ""}`.toLowerCase().includes(query));
    }, [mention, references]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        if (!shouldRenderCanvasPromptValue(document.activeElement === editor, composingRef.current, serializeEditor(editor, referenceByKey, serializeReference), value)) return;
        renderTokens(editor, tokens, referenceByKey, theme, setImagePreview);
    }, [referenceByKey, serializeReference, theme, tokens, value]);

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const syncMention = () => {
        const match = /@([^\s@]*)$/.exec(textBeforeCaret());
        if (!match || !references.length) {
            closeMention();
            return;
        }
        setMention({ query: match[1] || "" });
        setActiveIndex(0);
    };

    const syncFromEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const next = serializeEditor(editor, referenceByKey, serializeReference);
        if (!isCanvasPromptValueAllowed(next, maxLength)) {
            renderTokens(editor, tokens, referenceByKey, theme, setImagePreview);
            placeCaretAtEnd(editor);
            closeMention();
            return;
        }
        onChange(next);
        syncMention();
    };

    const insertReference = (reference: CanvasPromptEditorReference) => {
        const editor = editorRef.current;
        if (!editor) return;
        removeActiveMention();
        const chip = createReferenceChip(reference, theme, setImagePreview);
        const space = document.createTextNode(" ");
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (range && editor.contains(range.startContainer)) {
            range.insertNode(space);
            range.insertNode(chip);
            range.setStartAfter(space);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        } else {
            editor.append(chip, space);
            placeCaretAtEnd(editor);
        }
        closeMention();
        const next = serializeEditor(editor, referenceByKey, serializeReference);
        if (!isCanvasPromptValueAllowed(next, maxLength)) {
            renderTokens(editor, tokens, referenceByKey, theme, setImagePreview);
            placeCaretAtEnd(editor);
            return;
        }
        onChange(next);
    };

    return (
        <div className={`relative isolate h-full w-full ${containerClassName || ""}`}>
            {!value.trim() && placeholder ? <div className={`pointer-events-none absolute z-20 ${placeholderClassName || ""}`} style={{ color: theme.node.placeholder }}>{placeholder}</div> : null}
            <div
                {...props}
                ref={(node) => {
                    editorRef.current = node;
                    if (typeof forwardedRef === "function") forwardedRef(node);
                    else if (forwardedRef) forwardedRef.current = node;
                }}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                className={`thin-scrollbar relative z-10 cursor-text overflow-y-auto overscroll-contain whitespace-pre-wrap break-words outline-none ${className || ""}`}
                style={{ ...style, caretColor: style?.color || theme.node.text }}
                onInput={() => {
                    if (!composingRef.current) syncFromEditor();
                }}
                onCompositionStart={() => {
                    composingRef.current = true;
                }}
                onCompositionEnd={() => {
                    composingRef.current = false;
                    syncFromEditor();
                }}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    event.stopPropagation();
                    if (isImeComposing(event)) {
                        onKeyDown?.(event);
                        return;
                    }
                    if (mention && candidates.length) {
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActiveIndex((index) => (index + 1) % candidates.length);
                            return;
                        }
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                            return;
                        }
                        if (event.key === "Enter") {
                            event.preventDefault();
                            insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                            return;
                        }
                        if (event.key === "Escape") {
                            event.preventDefault();
                            closeMention();
                            return;
                        }
                    }
                    if ((event.key === "Backspace" || event.key === "Delete") && deleteAdjacentReference(event.key)) {
                        event.preventDefault();
                        requestAnimationFrame(syncFromEditor);
                        return;
                    }
                    if (isPlainEnterKey(event) && onSubmit) {
                        event.preventDefault();
                        onSubmit();
                        return;
                    }
                    onKeyDown?.(event);
                    requestAnimationFrame(syncMention);
                }}
                onBlur={(event) => {
                    window.setTimeout(closeMention, 120);
                    onBlur?.(event);
                }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    onMouseDown?.(event);
                }}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    onPointerDown?.(event);
                }}
                onWheel={(event) => {
                    event.stopPropagation();
                    onWheel?.(event);
                }}
            />
            {cornerAction}
            {mention && candidates.length && editorRef.current ? <MentionMenu editor={editorRef.current} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} /> : null}
            {imagePreview ? <Image src={imagePreview} alt="引用图片预览" style={{ display: "none" }} preview={{ visible: true, src: imagePreview, onVisibleChange: (visible) => !visible && setImagePreview(null) }} /> : null}
        </div>
    );
});

function MentionMenu({ editor, references, activeIndex, theme, onSelect }: { editor: HTMLDivElement; references: CanvasPromptEditorReference[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (reference: CanvasPromptEditorReference) => void }) {
    const selectedRef = useRef(false);
    const activeItemRef = useRef<HTMLButtonElement | null>(null);
    const rect = editor.getBoundingClientRect();
    const boundary = editor.closest(".ant-modal-content")?.getBoundingClientRect() || { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const menuWidth = 256;
    const maxMenuHeight = 224;
    const gap = 6;
    const left = clamp(rect.left, boundary.left + 8, boundary.right - menuWidth - 8);
    const showAbove = rect.bottom + gap + maxMenuHeight > boundary.bottom && rect.top - gap - maxMenuHeight >= boundary.top;
    const top = clamp(showAbove ? rect.top - gap - maxMenuHeight : rect.bottom + gap, boundary.top + 8, boundary.bottom - maxMenuHeight - 8);

    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, references]);

    const selectReference = (reference: CanvasPromptEditorReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    return createPortal(
        <div data-canvas-resource-mention-menu="true" className="fixed z-[9999] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md" style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            {references.map((reference, index) => (
                <button
                    key={reference.key}
                    ref={index === activeIndex ? activeItemRef : undefined}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}

function ReferencePreview({ reference }: { reference: CanvasPromptEditorReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10"><Icon className="size-4" /></span>;
}

function renderTokens(editor: HTMLElement, tokens: CanvasPromptEditorToken[], referenceByKey: Map<string, CanvasPromptEditorReference>, theme: (typeof canvasThemes)[keyof typeof canvasThemes], onImagePreview: (url: string) => void) {
    editor.textContent = "";
    tokens.forEach((token) => {
        if (token.type === "text") editor.append(document.createTextNode(token.value));
        else {
            const reference = referenceByKey.get(token.key);
            if (reference) editor.append(createReferenceChip(reference, theme, onImagePreview));
        }
    });
}

function createReferenceChip(reference: CanvasPromptEditorReference, theme: (typeof canvasThemes)[keyof typeof canvasThemes], onImagePreview: (url: string) => void) {
    const wrapper = document.createElement("span");
    wrapper.contentEditable = "false";
    wrapper.setAttribute("data-reference-key", reference.key);
    wrapper.className = "mx-px inline-flex h-7 max-w-40 items-center justify-center overflow-hidden rounded-md border px-1 text-xs leading-none align-middle";
    Object.assign(wrapper.style, { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text } as CSSProperties);
    if (reference.kind === "image" && reference.previewUrl) {
        const image = document.createElement("img");
        image.src = reference.previewUrl;
        image.alt = reference.title;
        image.className = "size-6 rounded object-cover";
        wrapper.className = "mx-px inline-flex size-6 cursor-pointer items-center justify-center overflow-hidden rounded align-middle";
        wrapper.appendChild(image);
        wrapper.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onImagePreview(reference.previewUrl || "");
        });
    } else {
        wrapper.title = reference.text || reference.title;
        const text = document.createElement("span");
        text.className = "block truncate";
        text.textContent = reference.kind === "text" ? reference.text || reference.label : reference.label;
        wrapper.appendChild(text);
    }
    return wrapper;
}

function serializeEditor(editor: HTMLElement, referenceByKey: Map<string, CanvasPromptEditorReference>, serializeReference: (reference: CanvasPromptEditorReference) => string) {
    return serializeNodes(editor.childNodes, referenceByKey, serializeReference).replace(/\uFEFF/g, "");
}

function serializeNodes(nodes: NodeListOf<ChildNode>, referenceByKey: Map<string, CanvasPromptEditorReference>, serializeReference: (reference: CanvasPromptEditorReference) => string) {
    let result = "";
    nodes.forEach((node, index) => {
        if (node.nodeType === Node.TEXT_NODE) result += node.textContent || "";
        if (!(node instanceof HTMLElement)) return;
        const reference = node.dataset.referenceKey ? referenceByKey.get(node.dataset.referenceKey) : undefined;
        if (reference) result += serializeReference(reference);
        else if (node.tagName === "BR") result += "\n";
        else if (node.tagName === "DIV" || node.tagName === "P") {
            const children = Array.from(node.childNodes);
            const placeholderBreak = children.length === 1 && children[0] instanceof HTMLElement && children[0].tagName === "BR";
            result = appendCanvasPromptBlock(result, serializeNodes(node.childNodes, referenceByKey, serializeReference), placeholderBreak, index > 0 || Boolean(result));
        } else {
            result += serializeNodes(node.childNodes, referenceByKey, serializeReference);
        }
    });
    return result;
}

function removeActiveMention() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const match = /@([^\s@]*)$/.exec(textBeforeCaret());
    if (!match || range.startContainer.nodeType !== Node.TEXT_NODE) return;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - (match[1] || "").length - 1));
    range.deleteContents();
}

function deleteAdjacentReference(key: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const target = adjacentReferenceNode(range, key);
    if (!target) return false;
    const nextCaretNode = document.createTextNode("");
    target.replaceWith(nextCaretNode);
    range.setStart(nextCaretNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function adjacentReferenceNode(range: Range, key: string) {
    const container = range.startContainer;
    const offset = range.startOffset;
    const previous = key === "Backspace";
    if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || "";
        if ((previous && offset > 0) || (!previous && offset < text.length)) return null;
        return findReferenceSibling(container, previous);
    }
    const children = Array.from(container.childNodes);
    return findReferenceSibling(children[previous ? offset - 1 : offset] || container, previous, true);
}

function findReferenceSibling(node: Node, previous: boolean, includeSelf = false): HTMLElement | null {
    let current: Node | null = includeSelf ? node : previous ? node.previousSibling : node.nextSibling;
    while (current && current.nodeType === Node.TEXT_NODE && !(current.textContent || "").trim()) current = previous ? current.previousSibling : current.nextSibling;
    return current instanceof HTMLElement && current.dataset.referenceKey ? current : null;
}

function textBeforeCaret() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0).cloneRange();
    const editor = closestEditor(range.startContainer);
    if (!editor) return "";
    range.setStart(editor, 0);
    return range.toString();
}

function closestEditor(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest("[contenteditable='true']") || null;
}

export function placeCanvasPromptCaretAtEnd(element: HTMLElement) {
    placeCaretAtEnd(element);
}

function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}
