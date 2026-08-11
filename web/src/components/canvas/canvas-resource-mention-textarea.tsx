import { forwardRef, useMemo } from "react";
import type { HTMLAttributes } from "react";
import { Tooltip } from "antd";
import { Copy } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { parseCanvasPromptReferenceTokens } from "@/lib/canvas/prompt-editor-state";
import { CanvasPromptEditor, type CanvasPromptEditorReference } from "./canvas-prompt-editor";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange"> & {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    placeholder?: string;
    maxLength?: number;
    containerClassName?: string;
    highlightLabels?: boolean;
    copyCurrentInput?: boolean;
    serializeReferenceAsNodeToken?: boolean;
};

export const CanvasResourceMentionTextarea = forwardRef<HTMLDivElement, Props>(function CanvasResourceMentionTextarea({ value, references, onChange, onSubmit, placeholder, maxLength, containerClassName, highlightLabels = true, copyCurrentInput = false, serializeReferenceAsNodeToken = false, className, style, ...props }, forwardedRef) {
    const copyText = useCopyText();
    const copyValue = value.trim();
    const activeReferences = useMemo(() => references.filter((reference) => reference.active).map(toEditorReference), [references]);
    const tokens = useMemo(() => parseCanvasPromptReferenceTokens(value, activeReferences, highlightLabels), [activeReferences, highlightLabels, value]);

    return (
        <CanvasPromptEditor
            {...props}
            ref={forwardedRef}
            value={value}
            tokens={tokens}
            references={activeReferences}
            serializeReference={serializeReferenceAsNodeToken ? serializeNodeResourceReference : serializeResourceReference}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
            placeholderClassName={`inset-0 px-3 py-2 text-sm leading-7 ${copyCurrentInput ? "!pr-12" : ""}`}
            maxLength={maxLength}
            containerClassName={containerClassName}
            cornerAction={copyCurrentInput ? (
                <Tooltip title="复制当前输入">
                    <button
                        type="button"
                        aria-label="复制当前输入"
                        disabled={!copyValue}
                        className="absolute right-2 top-2 z-30 grid size-8 place-items-center rounded-md opacity-55 transition hover:opacity-100 disabled:cursor-default disabled:opacity-25"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (copyValue) copyText(value, "当前输入已复制");
                        }}
                    >
                        <Copy className="size-4" />
                    </button>
                </Tooltip>
            ) : undefined}
            className={`${className || ""} ${copyCurrentInput ? "!pr-12" : ""}`}
            style={style}
        />
    );
});

function serializeResourceReference(reference: CanvasPromptEditorReference) {
    return reference.label;
}

function serializeNodeResourceReference(reference: CanvasPromptEditorReference) {
    return `@[node:${reference.key}]`;
}

function toEditorReference(reference: CanvasResourceReference): CanvasPromptEditorReference {
    return {
        key: reference.nodeId,
        kind: reference.kind,
        label: reference.label,
        title: reference.title,
        previewUrl: reference.previewUrl,
        text: reference.text,
    };
}
