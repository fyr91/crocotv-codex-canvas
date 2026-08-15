"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MapPin, Box, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ExtractionPreview } from "@/types/entityExtraction";

type EntityKind = keyof ExtractionPreview;

interface EditingEntity {
    kind: EntityKind;
    index: number;
}

interface EntityConfirmModalProps {
    isOpen: boolean;
    preview: ExtractionPreview | null;
    currentCounts: { characters: number; scenes: number; props: number };
    onConfirm: (preview: ExtractionPreview) => void;
    onDiscard: () => void;
}

function clonePreview(preview: ExtractionPreview): ExtractionPreview {
    return {
        characters: preview.characters.map((item) => ({ ...item })),
        scenes: preview.scenes.map((item) => ({ ...item })),
        props: preview.props.map((item) => ({ ...item })),
    };
}

function renameEntity(
    preview: ExtractionPreview,
    editingEntity: EditingEntity,
    name: string,
): ExtractionPreview {
    const items = preview[editingEntity.kind].map((item, index) => (
        index === editingEntity.index ? { ...item, name } : item
    ));
    return { ...preview, [editingEntity.kind]: items };
}

export default function EntityConfirmModal({
    isOpen,
    preview,
    currentCounts,
    onConfirm,
    onDiscard,
}: EntityConfirmModalProps) {
    const t = useTranslations("script");
    const [draft, setDraft] = useState<ExtractionPreview | null>(null);
    const [editingEntity, setEditingEntity] = useState<EditingEntity | null>(null);
    const [editingName, setEditingName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen || !preview) return;
        setDraft(clonePreview(preview));
        setEditingEntity(null);
        setEditingName("");
    }, [isOpen, preview]);

    useEffect(() => {
        if (!editingEntity) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editingEntity]);

    const sections = useMemo(() => {
        if (!draft) return [];
        return [
            { key: "characters" as const, icon: Users, items: draft.characters, prev: currentCounts.characters },
            { key: "scenes" as const, icon: MapPin, items: draft.scenes, prev: currentCounts.scenes },
            { key: "props" as const, icon: Box, items: draft.props, prev: currentCounts.props },
        ];
    }, [currentCounts.characters, currentCounts.props, currentCounts.scenes, draft]);

    const startEditing = (kind: EntityKind, index: number, name: string) => {
        setEditingEntity({ kind, index });
        setEditingName(name);
    };

    const stopEditing = () => {
        setEditingEntity(null);
        setEditingName("");
    };

    const commitEditing = () => {
        if (!editingEntity) return;
        const nextName = editingName.trim();
        if (nextName) {
            setDraft((current) => {
                if (!current) return current;
                return renameEntity(current, editingEntity, nextName);
            });
        }
        stopEditing();
    };

    const handleConfirm = () => {
        if (!draft) return;
        const nextName = editingName.trim();
        const confirmedDraft = editingEntity && nextName
            ? renameEntity(draft, editingEntity, nextName)
            : draft;
        onConfirm(confirmedDraft);
    };

    const removeEntity = (kind: EntityKind, index: number) => {
        setDraft((current) => {
            if (!current) return current;
            return {
                ...current,
                [kind]: current[kind].filter((_, itemIndex) => itemIndex !== index),
            };
        });
        stopEditing();
    };

    if (!preview || !draft) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] grid place-items-center bg-overlay backdrop-blur-sm"
                    onClick={onDiscard}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="entity-confirm-title"
                        initial={{ scale: 0.96, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.96, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-full max-w-lg max-h-[70vh] flex flex-col rounded-2xl border border-glass-border bg-elevated shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="px-6 py-5 border-b border-glass-border">
                            <h2 id="entity-confirm-title" className="font-display text-display font-medium text-foreground">
                                {t("extractConfirmTitle")}
                            </h2>
                            <p className="text-sm text-text-secondary mt-1">
                                {t("extractConfirmSubtitle")}
                            </p>
                        </header>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                            {sections.map(({ key, icon: Icon, items, prev }) => (
                                <div key={key} className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-text-secondary">
                                        <Icon size={14} />
                                        <span className="font-medium">{t(`entityKind_${key}`)}</span>
                                        <span className="ml-auto text-sm opacity-70">
                                            {prev} → {items.length}
                                        </span>
                                    </div>
                                    {items.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {items.map((item, index) => (
                                                <span
                                                    key={item.id ?? `${key}-${index}`}
                                                    className="inline-flex min-h-6 items-center rounded-md border border-glass-border bg-elevated text-sm text-foreground transition-colors focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/35 hover:border-foreground/25"
                                                    title={item.description}
                                                >
                                                    {editingEntity?.kind === key && editingEntity.index === index ? (
                                                        <input
                                                            ref={inputRef}
                                                            value={editingName}
                                                            size={Math.max(2, Math.min(24, Array.from(editingName).length || 1))}
                                                            aria-label={`${t("editEntityName")}: ${item.name}`}
                                                            className="h-6 min-w-8 max-w-48 rounded-l-md bg-transparent px-2 py-0.5 text-sm text-foreground outline-none"
                                                            onChange={(event) => setEditingName(event.target.value)}
                                                            onBlur={commitEditing}
                                                            onKeyDown={(event) => {
                                                                if (event.key === "Enter") {
                                                                    event.preventDefault();
                                                                    commitEditing();
                                                                } else if (event.key === "Escape") {
                                                                    event.preventDefault();
                                                                    stopEditing();
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="min-w-0 px-2 py-0.5 text-left outline-none"
                                                            aria-label={`${t("editEntityName")}: ${item.name}`}
                                                            onClick={() => startEditing(key, index, item.name)}
                                                        >
                                                            {item.name}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        aria-label={`${t("removeEntity")}: ${item.name}`}
                                                        className="mr-1 grid size-4 shrink-0 place-items-center rounded text-text-tertiary transition-colors hover:bg-hover-bg hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                                        onMouseDown={(event) => event.preventDefault()}
                                                        onClick={() => removeEntity(key, index)}
                                                    >
                                                        <X size={11} strokeWidth={2} aria-hidden="true" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-text-tertiary italic">{t("noEntities")}</p>
                                    )}
                                </div>
                            ))}
                        </div>

                        <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-glass-border">
                            <button
                                type="button"
                                onClick={onDiscard}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-foreground hover:bg-hover-bg transition-colors"
                            >
                                <X size={14} />
                                {t("extractDiscard")}
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
                            >
                                <Check size={14} />
                                {t("extractApply")}
                            </button>
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
