"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { playgroundApi, type PlaygroundGenerationResponse } from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { getDefaultModelForMode, getModelsForMode } from "@/components/modules/playground/playgroundModels";
import GroupedModelGrid from "@/components/common/GroupedModelGrid";
import { CharacterCompositionQuickTags, CharacterCompositionTemplatePicker } from "@/components/shared/CharacterCompositionControls";
import {
  appendEnglishCompositionTag,
  buildCharacterCompositionPrompt,
  characterCompositionNegative,
  CHARACTER_COMPOSITION_TEMPLATES,
  GPT_IMAGE_02_MODEL_ID,
  type CharacterCompositionTemplate,
} from "@/components/shared/characterCompositionTemplates";
import type { PulledCharacterAsset } from "@/lib/pulledCharacterAssets";

const RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"];

interface CharacterImageGenerationModalProps {
  character: PulledCharacterAsset;
  onClose: () => void;
  onTaskCreated: (generation: PlaygroundGenerationResponse) => void;
}

export default function CharacterImageGenerationModal({ character, onClose, onTaskCreated }: CharacterImageGenerationModalProps) {
  const t = useTranslations("library");
  const tc = useTranslations("castWorkbench");
  const variants = character.reference_sheet?.image_variants ?? [];
  const defaultReferenceId = character.reference_sheet?.selected_image_id ?? variants[0]?.id;
  const [referenceIds, setReferenceIds] = useState<string[]>(defaultReferenceId ? [defaultReferenceId] : []);
  const mode = referenceIds.length ? "i2i" : "t2i";
  const availableModels = useMemo(() => getModelsForMode(mode), [mode]);
  const groupedModels = useMemo(() => availableModels.map((model) => ({
    id: model.id,
    name: model.displayName,
    description: model.description,
    family: model.family,
    badges: model.badges,
    recommended: model.recommended,
  })), [availableModels]);
  const [modelId, setModelId] = useState(() => getDefaultModelForMode(mode));
  const [selectedTemplate, setSelectedTemplate] = useState<CharacterCompositionTemplate>("simple");
  const [pendingTemplate, setPendingTemplate] = useState<CharacterCompositionTemplate>();
  const [prompt, setPrompt] = useState(() => buildCharacterCompositionPrompt(character, "simple"));
  const [promptDirty, setPromptDirty] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState(() => characterCompositionNegative("simple"));
  const [ratio, setRatio] = useState("1:1");
  const [count, setCount] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];
  const maxReferences = Math.max(0, selectedModel?.maxReferenceImages ?? 0);

  useEffect(() => {
    if (!availableModels.some((model) => model.id === modelId)) setModelId(getDefaultModelForMode(mode));
  }, [availableModels, mode, modelId]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const toggleReference = (id: string) => {
    setReferenceIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      const limit = maxReferences || 1;
      return [...current, id].slice(-limit);
    });
  };

  const applyTemplate = (template: CharacterCompositionTemplate) => {
    setSelectedTemplate(template);
    setPendingTemplate(undefined);
    setPrompt(buildCharacterCompositionPrompt(character, template));
    setNegativePrompt(characterCompositionNegative(template));
    setPromptDirty(false);
    const requiredModel = CHARACTER_COMPOSITION_TEMPLATES[template].requiredModelId;
    if (requiredModel === GPT_IMAGE_02_MODEL_ID && availableModels.some((model) => model.id === requiredModel)) setModelId(requiredModel);
  };

  const handleTemplateSelect = (template: CharacterCompositionTemplate) => {
    if (template === selectedTemplate) return;
    if (promptDirty) setPendingTemplate(template);
    else applyTemplate(template);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !modelId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const references = variants.filter((variant) => referenceIds.includes(variant.id)).map((variant) => variant.url);
      const generation = await playgroundApi.generate({
        mode: references.length ? "i2i" : "t2i",
        model_id: modelId,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim() || undefined,
        input_media: references,
        parameters: { aspect_ratio: ratio },
        batch_size: count,
        target_character_id: character.id,
      });
      onTaskCreated(generation);
      onClose();
    } catch (reason) {
      setError(apiErrorMessage(reason, t("variantsGenFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-overlay/80 p-4 backdrop-blur-sm" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="character-image-generation-title" tabIndex={-1} className="max-h-[92vh] w-full max-w-[960px] overflow-y-auto rounded-2xl border border-glass-border bg-elevated shadow-2xl focus:outline-none">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-subtle bg-elevated/95 px-6 py-5 backdrop-blur-md">
          <div>
            <div className="font-mono text-sm uppercase tracking-[0.16em] text-text-muted">{t("imageGenerationEyebrow")}</div>
            <h2 id="character-image-generation-title" className="mt-1 font-display text-2xl font-medium text-foreground">{t("characterGenerateTitle", { name: character.name })}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("closeInspector")} className="grid h-9 w-9 place-items-center rounded-full bg-surface-inset text-text-secondary transition-colors hover:text-foreground"><X size={17} /></button>
        </div>

        <div className="space-y-5 p-6">
          <CharacterCompositionTemplatePicker selected={selectedTemplate} onSelect={handleTemplateSelect} disabled={submitting} />
          {pendingTemplate && (
            <div className="flex items-center gap-2 rounded-md border border-status-processing-border bg-status-processing-bg px-3 py-2">
              <span className="text-sm text-status-processing-fg">{tc("tplSwitchConfirm")}</span>
              <button type="button" onClick={() => applyTemplate(pendingTemplate)} className="rounded bg-status-processing-bg px-2 py-0.5 text-sm font-medium text-status-processing-fg">{tc("tplSwitchYes")}</button>
              <button type="button" onClick={() => setPendingTemplate(undefined)} className="rounded px-2 py-0.5 text-sm text-text-muted hover:text-text-secondary">{tc("tplSwitchNo")}</button>
            </div>
          )}

          <section>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <label className="font-mono text-sm font-medium uppercase tracking-[0.12em] text-text-secondary">{t("generationPrompt")}</label>
              <button type="button" onClick={() => applyTemplate(selectedTemplate)} disabled={submitting} className="inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-foreground disabled:opacity-40"><RefreshCw size={12} />{tc("resetTemplate")}</button>
            </div>
            <textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); setPromptDirty(true); }} rows={9} className="w-full resize-y rounded-xl border border-border-subtle bg-surface-inset px-4 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-primary" />
            <div className="mt-2.5"><CharacterCompositionQuickTags onAppend={(value) => { setPrompt((current) => appendEnglishCompositionTag(current, value)); setPromptDirty(true); }} disabled={submitting} /></div>
          </section>

          <section>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className="font-mono text-sm font-medium uppercase tracking-[0.12em] text-text-secondary">{t("referenceImages")}</div>
              <span className="text-sm text-text-muted">{referenceIds.length ? t("imageToImage") : t("textToImage")}</span>
            </div>
            {variants.length ? (
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                {variants.map((variant) => {
                  const selected = referenceIds.includes(variant.id);
                  return (
                    <button key={variant.id} type="button" onClick={() => toggleReference(variant.id)} className={`relative aspect-square overflow-hidden rounded-lg border transition-all ${selected ? "border-primary ring-1 ring-primary" : "border-glass-border hover:border-foreground/40"}`}>
                      <img src={variant.url} alt={t("variantAlt")} className="h-full w-full object-cover" />
                      {selected && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-on-accent"><Check size={12} /></span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-glass-border bg-surface-inset px-4 py-4 text-sm text-text-muted"><ImagePlus size={18} />{t("noReferenceImage")}</div>
            )}
          </section>

          <section className="space-y-5 border-t border-glass-border pt-5">
            <p className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted">{tc("generationConfig")}</p>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <div className="mb-2 font-mono text-sm uppercase tracking-[0.1em] text-text-muted">{t("generationCount")}</div>
                <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-surface-inset p-1">
                  {[1, 2, 3].map((value) => <button key={value} type="button" onClick={() => setCount(value)} className={`h-9 rounded-md text-sm font-medium transition-colors ${count === value ? "bg-primary text-on-accent" : "text-text-secondary hover:text-foreground"}`}>×{value}</button>)}
                </div>
              </div>
              <div>
                <div className="mb-2 font-mono text-sm uppercase tracking-[0.1em] text-text-muted">{t("generationRatio")}</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {RATIOS.map((value) => <button key={value} type="button" onClick={() => setRatio(value)} className={`h-10 rounded-lg border text-sm transition-colors ${ratio === value ? "border-primary bg-primary text-on-accent" : "border-border-subtle bg-surface-inset text-text-secondary hover:text-foreground"}`}>{value}</button>)}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2 font-mono text-sm uppercase tracking-[0.1em] text-text-muted">{t("generationModel")}</div>
              <GroupedModelGrid models={groupedModels} selectedId={modelId} onSelect={setModelId} columns={3} />
            </div>
            <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="text-sm text-text-secondary hover:text-foreground">{showAdvanced ? t("hideAdvanced") : t("showAdvanced")}</button>
            {showAdvanced && <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} rows={4} placeholder={t("negativePromptPlaceholder")} className="w-full resize-y rounded-xl border border-border-subtle bg-surface-inset px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />}
          </section>

          {error && <div role="alert" className="rounded-lg border border-status-error-border bg-status-error-bg px-3 py-2.5 text-sm text-status-error-fg">{error}</div>}
          <div className="flex flex-col items-center gap-2 border-t border-glass-border pt-5">
            <button type="button" onClick={handleGenerate} disabled={submitting || !prompt.trim() || !modelId} className="flex h-11 min-w-56 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-on-accent transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{submitting ? t("creatingGenerationTask") : t("startGeneration")}
            </button>
            <p className="text-center text-sm leading-relaxed text-text-muted">{t("generationTaskHint")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
