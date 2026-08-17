"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Link2Off, Loader2, Volume2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import type { PulledCharacterCatalogEntry, PulledCharacterResource } from "@/lib/pulledCharacterAssets";
import type { Character } from "@/store/projectStore";
import { useProjectStore } from "@/store/projectStore";
import { toast } from "@/store/toastStore";
import { apiErrorMessage } from "@/lib/apiError";
import ImageResourceSelect from "./ImageResourceSelect";

interface BindingDraft {
  system_character_id: string;
  reference_image_resource_id: string;
  voice_id: string;
  voice_reference_resource_id: string;
}

const emptyDraft: BindingDraft = {
  system_character_id: "",
  reference_image_resource_id: "",
  voice_id: "",
  voice_reference_resource_id: "",
};

export default function CharacterResourceBindingModal({
  character,
  onClose,
}: {
  character: Character | null;
  onClose: () => void;
}) {
  const t = useTranslations("cast");
  const currentProject = useProjectStore((state) => state.currentProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [catalog, setCatalog] = useState<PulledCharacterCatalogEntry[]>([]);
  const [resources, setResources] = useState<PulledCharacterResource[]>([]);
  const [draft, setDraft] = useState<BindingDraft>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!character) return;
    setDraft({
      system_character_id: character.system_character_id || "",
      reference_image_resource_id: character.reference_image_resource_id || "",
      voice_id: character.voice_id || "",
      voice_reference_resource_id: character.voice_reference_resource_id || "",
    });
    setLoading(true);
    void Promise.all([api.listPulledCharacters(), api.listLocalResources()])
      .then(([nextCatalog, nextResources]) => {
        setCatalog(nextCatalog as PulledCharacterCatalogEntry[]);
        setResources(nextResources as PulledCharacterResource[]);
      })
      .catch((error) => toast.error(t("bindingLoadFailed"), { body: apiErrorMessage(error) }))
      .finally(() => setLoading(false));
  }, [character, t]);

  const selectedCharacter = catalog.find((item) => item.id === draft.system_character_id);
  const selectedResources = useMemo(() => resources.filter((resource) => (
    resource.metadata?.characterId === draft.system_character_id
    || resource.metadata?.characterLibraryCharacterIds?.includes(draft.system_character_id)
  )), [draft.system_character_id, resources]);
  const images = selectedResources.filter((resource) => resource.type === "image");
  const audios = selectedResources.filter((resource) => resource.type === "audio");
  const selectedImage = images.find((resource) => resource.id === draft.reference_image_resource_id);
  const selectedAudio = audios.find((resource) => resource.id === draft.voice_reference_resource_id);

  if (!character || !currentProject) return null;

  const selectCharacter = (characterId: string) => {
    const nextCharacter = catalog.find((item) => item.id === characterId);
    const nextResources = resources.filter((resource) => resource.metadata?.characterId === characterId);
    const nextImages = nextResources.filter((resource) => resource.type === "image");
    const nextAudios = nextResources.filter((resource) => resource.type === "audio");
    const preferredImage = nextImages.find((resource) => resource.metadata?.assetKey === "fullBodyImageUrl")
      || nextImages.find((resource) => resource.id === nextCharacter?.primaryResourceId)
      || nextImages[0];
    setDraft({
      system_character_id: characterId,
      reference_image_resource_id: preferredImage?.id || "",
      voice_id: nextCharacter?.voiceId || "",
      voice_reference_resource_id: nextAudios[0]?.id || "",
    });
  };

  const save = async (binding: BindingDraft = draft) => {
    setSaving(true);
    try {
      const updated = await api.bindCharacterResources(currentProject.id, character.id, binding);
      updateProject(currentProject.id, updated);
      toast.success(binding.system_character_id ? t("bindingSaved") : t("bindingRemoved"));
      onClose();
    } catch (error) {
      toast.error(t("bindingSaveFailed"), { body: apiErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-overlay p-4 backdrop-blur-sm" onClick={onClose}>
      <section className="w-full max-w-3xl rounded-2xl border border-glass-border bg-elevated shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-glass-border px-6 py-5">
          <div>
            <h2 className="font-display text-display font-medium text-foreground">{t("bindingTitle", { name: character.name })}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t("bindingHint")}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-hover-bg hover:text-foreground" aria-label={t("close")}>
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-6 py-5">
          {loading ? (
            <div className="grid min-h-52 place-items-center text-text-muted"><Loader2 className="animate-spin" /></div>
          ) : (
            <>
              <label className="block text-sm text-text-secondary">
                {t("systemCharacter")}
                <select value={draft.system_character_id} onChange={(event) => selectCharacter(event.target.value)} className="mt-1 w-full rounded-md border border-glass-border bg-surface px-3 py-2 text-foreground">
                  <option value="">{t("notBound")}</option>
                  {catalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.chineseName || entry.name} · {entry.subtitle || entry.name}</option>)}
                </select>
              </label>

              {selectedCharacter ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="text-sm text-text-secondary">
                    <span className="block">{t("primaryImage")}</span>
                    <ImageResourceSelect
                      resources={images}
                      value={draft.reference_image_resource_id}
                      onChange={(resourceId) => setDraft((current) => ({ ...current, reference_image_resource_id: resourceId }))}
                      placeholder={t("notSelected")}
                      ariaLabel={t("primaryImage")}
                    />
                    <div className="mt-2 grid h-44 place-items-center overflow-hidden rounded-lg border border-glass-border bg-black/25">
                      {selectedImage ? <img src={selectedImage.url} alt="" className="size-full object-contain" /> : <Link2 size={24} className="text-text-muted" />}
                    </div>
                  </div>

                  <label className="text-sm text-text-secondary">
                    {t("voiceId")}
                    <select value={draft.voice_id} onChange={(event) => setDraft((current) => ({ ...current, voice_id: event.target.value }))} className="mt-1 w-full rounded-md border border-glass-border bg-surface px-2 py-2 text-foreground">
                      <option value="">{t("notSelected")}</option>
                      {selectedCharacter.voiceId ? <option value={selectedCharacter.voiceId}>{selectedCharacter.voiceId}</option> : null}
                    </select>
                    <div className="mt-2 grid h-44 place-items-center rounded-lg border border-glass-border bg-black/20 text-text-muted"><Volume2 size={24} /></div>
                  </label>

                  <label className="text-sm text-text-secondary">
                    {t("referenceVoice")}
                    <select value={draft.voice_reference_resource_id} onChange={(event) => setDraft((current) => ({ ...current, voice_reference_resource_id: event.target.value }))} className="mt-1 w-full rounded-md border border-glass-border bg-surface px-2 py-2 text-foreground">
                      <option value="">{t("notSelected")}</option>
                      {audios.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                    </select>
                    <div className="mt-2 flex h-44 items-center rounded-lg border border-glass-border bg-black/20 px-3">
                      {selectedAudio ? <audio src={selectedAudio.url} controls preload="none" className="w-full" /> : <span className="mx-auto text-text-muted"><Volume2 size={24} /></span>}
                    </div>
                  </label>
                </div>
              ) : null}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-glass-border px-6 py-4">
          <button type="button" disabled={saving || !character.system_character_id} onClick={() => void save(emptyDraft)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-text-muted hover:bg-hover-bg hover:text-foreground disabled:opacity-40">
            <Link2Off size={14} /> {t("unbindCharacter")}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-secondary hover:bg-hover-bg hover:text-foreground">{t("cancel")}</button>
            <button type="button" disabled={saving || !draft.system_character_id} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} {t("saveBinding")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
