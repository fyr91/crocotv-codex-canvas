"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useProjectStore } from "@/store/projectStore";
import ProjectCreationFields, { BASIC_WORKFLOW_MODE } from "@/components/project/ProjectCreationFields";


interface CreateProjectDialogProps {
    isOpen: boolean;
    onClose: () => void;
    seriesId?: string;
    seriesTitle?: string;
}

export default function CreateProjectDialog({ isOpen, onClose, seriesId, seriesTitle }: CreateProjectDialogProps) {
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const createProject = useProjectStore((state) => state.createProject);
    const t = useTranslations("project");
    const tc = useTranslations("common");


    const handleCreate = async () => {
        if (!title) {
            alert(t("titleRequired"));
            return;
        }

        setIsCreating(true);
        try {
            await createProject(title, text, true, BASIC_WORKFLOW_MODE, seriesId);
            // Get the newly created project
            const currentProject = useProjectStore.getState().currentProject;
            if (currentProject) {
                // Use hash-based routing to match the app's routing structure
                window.location.hash = `#/project/${currentProject.id}`;
            }
            onClose();
        } catch (error: any) {
            const errorMessage = error?.response?.data?.detail || error?.message || t("checkBackend");
            alert(t("createFailed", { error: errorMessage }));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-6"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-elevated border border-border shadow-2xl p-8 rounded-2xl w-full max-w-4xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-display font-medium text-foreground">{t("createTitle")}</h2>
                                {seriesId && (
                                    <div className="mt-1 font-mono text-sm uppercase tracking-wider text-primary">
                                        {t("series")} · {seriesTitle}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-hover-bg text-text-secondary hover:text-foreground transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <ProjectCreationFields
                                title={title}
                                onTitleChange={setTitle}
                                script={text}
                                onScriptChange={setText}
                            />

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={onClose}
                                    className="flex-1 glass-button"
                                >
                                    {tc("cancel")}
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={isCreating || !title}
                                    className="flex-1 bg-primary hover:bg-primary/90 text-on-accent px-6 py-3 rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
                                >
                                    {isCreating ? t("creating") : t("createProject")}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
