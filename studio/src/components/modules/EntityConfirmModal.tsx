"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MapPin, Box, Check, X, Link2Off, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ExtractionPreview } from "@/types/entityExtraction";
import { api } from "@/lib/api";
import type { PulledCharacterCatalogEntry, PulledCharacterResource } from "@/lib/pulledCharacterAssets";

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

function normalizeName(value: unknown) {
    return String(value || "").trim().toLocaleLowerCase();
}

function matchedCharacter(
    item: Record<string, unknown>,
    catalog: PulledCharacterCatalogEntry[],
) {
    const boundId = String(item.system_character_id || "");
    if (boundId) return catalog.find((character) => character.id === boundId);
    const name = normalizeName(item.name);
    const matches = catalog.filter((character) => (
        [character.name, character.chineseName].some((candidate) => normalizeName(candidate) === name)
    ));
    return matches.length === 1 ? matches[0] : undefined;
}

function resourcesForCharacter(
    resources: PulledCharacterResource[],
    characterId: string,
    type: PulledCharacterResource["type"],
) {
    return resources.filter((resource) => (
        resource.type === type && (
            resource.metadata?.characterId === characterId
            || resource.metadata?.characterLibraryCharacterIds?.includes(characterId)
        )
    ));
}

function defaultCharacterBinding(
    character: PulledCharacterCatalogEntry,
    resources: PulledCharacterResource[],
) {
    const images = resourcesForCharacter(resources, character.id, "image");
    const audios = resourcesForCharacter(resources, character.id, "audio");
    const preferredImage = images.find((resource) => resource.metadata?.assetKey === "fullBodyImageUrl")
        || images.find((resource) => resource.id === character.primaryResourceId)
        || images[0];
    return {
        system_character_id: character.id,
        reference_image_resource_id: preferredImage?.id,
        voice_id: character.voiceId || undefined,
        voice_reference_resource_id: audios[0]?.id,
    };
}

function bindMatchedCharacters(
    preview: ExtractionPreview,
    catalog: PulledCharacterCatalogEntry[],
    resources: PulledCharacterResource[],
): ExtractionPreview {
    return {
        ...preview,
        characters: preview.characters.map((item) => {
            const character = matchedCharacter(item, catalog);
            if (!character) return item;
            const defaults = defaultCharacterBinding(character, resources);
            return {
                ...item,
                ...defaults,
                reference_image_resource_id: item.reference_image_resource_id || defaults.reference_image_resource_id,
                voice_id: item.voice_id || defaults.voice_id,
                voice_reference_resource_id: item.voice_reference_resource_id || defaults.voice_reference_resource_id,
            };
        }),
    };
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
    const [catalog, setCatalog] = useState<PulledCharacterCatalogEntry[]>([]);
    const [resources, setResources] = useState<PulledCharacterResource[]>([]);
    const [bindingIndex, setBindingIndex] = useState<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen || !preview) return;
        setDraft(clonePreview(preview));
        setEditingEntity(null);
        setEditingName("");
        setBindingIndex(null);
        void Promise.all([api.listPulledCharacters(), api.listLocalResources()])
            .then(([nextCatalog, nextResources]) => {
                const typedCatalog = nextCatalog as PulledCharacterCatalogEntry[];
                const typedResources = nextResources as PulledCharacterResource[];
                setCatalog(typedCatalog);
                setResources(typedResources);
                setDraft((current) => current
                    ? bindMatchedCharacters(current, typedCatalog, typedResources)
                    : current);
            })
            .catch(() => {
                setCatalog([]);
                setResources([]);
            });
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
        if (kind === "characters" && bindingIndex === index) setBindingIndex(null);
    };

    const characterForItem = (item: Record<string, unknown>) => matchedCharacter(item, catalog);
    const itemPreviewUrl = (item: Record<string, unknown>) => {
        const selectedResourceId = String(item.reference_image_resource_id || "");
        return resources.find((resource) => resource.id === selectedResourceId)?.url
            || characterForItem(item)?.avatarUrl;
    };
    const updateCharacter = (index: number, patch: Record<string, unknown>) => {
        setDraft((current) => current ? {
            ...current,
            characters: current.characters.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        } : current);
    };
    const bindCharacter = (index: number, characterId: string) => {
        const character = catalog.find((item) => item.id === characterId);
        if (!character) return;
        updateCharacter(index, defaultCharacterBinding(character, resources));
        setBindingIndex(index);
    };
    const unbindCharacter = (index: number) => {
        updateCharacter(index, {
            system_character_id: undefined,
            reference_image_resource_id: undefined,
            voice_id: undefined,
            voice_reference_resource_id: undefined,
        });
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
                                            {prev} + {items.length}
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
                                                    {key === "characters" && characterForItem(item) ? (
                                                        <button
                                                            type="button"
                                                            className="ml-1 grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border border-primary/40 bg-primary/10"
                                                            title={t("openCharacterBinding")}
                                                            onClick={() => setBindingIndex(index)}
                                                        >
                                                            {itemPreviewUrl(item) ? (
                                                                <img src={itemPreviewUrl(item)} alt={String(item.name || "")} className="size-full object-cover" />
                                                            ) : <Users size={14} />}
                                                        </button>
                                                    ) : null}
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
                            {bindingIndex !== null && draft.characters[bindingIndex] ? (() => {
                                const item = draft.characters[bindingIndex];
                                const character = characterForItem(item);
                                const images = character ? resourcesForCharacter(resources, character.id, "image") : [];
                                const audios = character ? resourcesForCharacter(resources, character.id, "audio") : [];
                                const selectedImage = images.find((resource) => resource.id === item.reference_image_resource_id);
                                const selectedAudio = audios.find((resource) => resource.id === item.voice_reference_resource_id);
                                return (
                                    <section className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{t("characterBindingTitle", { name: item.name })}</p>
                                                <p className="mt-0.5 text-sm text-text-muted">{t("characterBindingHint")}</p>
                                            </div>
                                            {item.system_character_id ? (
                                                <button type="button" onClick={() => unbindCharacter(bindingIndex)} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-foreground">
                                                    <Link2Off size={12} /> {t("unbindCharacter")}
                                                </button>
                                            ) : null}
                                        </div>
                                        <label className="mt-3 block text-sm text-text-secondary">
                                            {t("systemCharacter")}
                                            <select
                                                value={String(item.system_character_id || "")}
                                                onChange={(event) => event.target.value ? bindCharacter(bindingIndex, event.target.value) : unbindCharacter(bindingIndex)}
                                                className="mt-1 w-full rounded-md border border-glass-border bg-elevated px-3 py-2 text-sm text-foreground"
                                            >
                                                <option value="">{t("notBound")}</option>
                                                {catalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.chineseName || entry.name} · {entry.subtitle || entry.name}</option>)}
                                            </select>
                                        </label>
                                        {character ? (
                                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                                <label className="text-sm text-text-secondary">
                                                    {t("primaryImage")}
                                                    <select value={String(item.reference_image_resource_id || "")} onChange={(event) => updateCharacter(bindingIndex, { reference_image_resource_id: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-glass-border bg-elevated px-2 py-2 text-sm text-foreground">
                                                        <option value="">{t("notSelected")}</option>
                                                        {images.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                                                    </select>
                                                    {selectedImage ? <img src={selectedImage.url} alt="" className="mt-2 h-20 w-full rounded-md bg-black/30 object-contain" /> : null}
                                                </label>
                                                <label className="text-sm text-text-secondary">
                                                    {t("voiceId")}
                                                    <select value={String(item.voice_id || "")} onChange={(event) => updateCharacter(bindingIndex, { voice_id: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-glass-border bg-elevated px-2 py-2 text-sm text-foreground">
                                                        <option value="">{t("notSelected")}</option>
                                                        {character.voiceId ? <option value={character.voiceId}>{character.voiceId}</option> : null}
                                                    </select>
                                                    <div className="mt-2 flex h-20 items-center justify-center rounded-md bg-black/20 text-text-muted"><Volume2 size={18} /></div>
                                                </label>
                                                <label className="text-sm text-text-secondary">
                                                    {t("referenceVoice")}
                                                    <select value={String(item.voice_reference_resource_id || "")} onChange={(event) => updateCharacter(bindingIndex, { voice_reference_resource_id: event.target.value || undefined })} className="mt-1 w-full rounded-md border border-glass-border bg-elevated px-2 py-2 text-sm text-foreground">
                                                        <option value="">{t("notSelected")}</option>
                                                        {audios.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                                                    </select>
                                                    {selectedAudio ? <audio src={selectedAudio.url} controls preload="none" className="mt-2 h-8 w-full" /> : null}
                                                </label>
                                            </div>
                                        ) : null}
                                    </section>
                                );
                            })() : null}
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
