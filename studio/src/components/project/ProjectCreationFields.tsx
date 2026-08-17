"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import BasicWorkflowSelection from "@/components/project/BasicWorkflowSelection";

interface ProjectCreationFieldsProps {
    title: string;
    onTitleChange: (title: string) => void;
    script?: string;
    onScriptChange?: (script: string) => void;
    showScriptInput?: boolean;
    autoFocusTitle?: boolean;
}

export const BASIC_WORKFLOW_MODE = "r2v";

export default function ProjectCreationFields({
    title,
    onTitleChange,
    script = "",
    onScriptChange,
    showScriptInput = true,
    autoFocusTitle = false,
}: ProjectCreationFieldsProps) {
    const t = useTranslations("project");
    const titleInputId = useId();
    const scriptInputId = useId();

    return (
        <div className="space-y-4">
            <div>
                <label htmlFor={titleInputId} className="block text-sm font-medium text-foreground mb-2">
                    {t("projectTitle")}
                </label>
                <input
                    id={titleInputId}
                    type="text"
                    value={title}
                    onChange={(event) => onTitleChange(event.target.value)}
                    placeholder={t("projectTitlePlaceholder")}
                    className="glass-input w-full"
                    autoFocus={autoFocusTitle}
                />
            </div>

            <BasicWorkflowSelection />

            {showScriptInput && (
                <div>
                    <label htmlFor={scriptInputId} className="block text-sm font-medium text-foreground mb-2">
                        {t("scriptContent")}
                    </label>
                    <textarea
                        id={scriptInputId}
                        value={script}
                        onChange={(event) => onScriptChange?.(event.target.value)}
                        placeholder={t("scriptPlaceholder")}
                        rows={8}
                        className="glass-input w-full resize-none font-mono text-sm"
                    />
                </div>
            )}
        </div>
    );
}
