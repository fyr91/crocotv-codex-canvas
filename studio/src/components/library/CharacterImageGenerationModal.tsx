"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { playgroundApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { getDefaultModelForMode, getModelsForMode } from "@/components/modules/playground/playgroundModels";
import type { PulledCharacterAsset } from "@/lib/pulledCharacterAssets";

const RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"];
const POLL_INTERVAL_MS = 2_000;
const POLL_LIMIT = 150;

interface CharacterImageGenerationModalProps {
  character: PulledCharacterAsset;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}

export default function CharacterImageGenerationModal({ character, onClose, onCompleted }: CharacterImageGenerationModalProps) {
  const t = useTranslations("library");
  const variants = character.reference_sheet?.image_variants ?? [];
  const defaultReferenceId = character.reference_sheet?.selected_image_id ?? variants[0]?.id;
  const [referenceIds, setReferenceIds] = useState<string[]>(defaultReferenceId ? [defaultReferenceId] : []);
  const mode = referenceIds.length ? "i2i" : "t2i";
  const availableModels = useMemo(() => getModelsForMode(mode), [mode]);
  const [modelId, setModelId] = useState(() => getDefaultModelForMode(mode));
  const [prompt, setPrompt] = useState(() => t("characterGeneratePrompt", {
    name: character.name,
    description: character.description || character.english_name || "",
  }));
  const [negativePrompt, setNegativePrompt] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [count, setCount] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [outputs, setOutputs] = useState<Array<{ id: string; media_path: string }>>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];
  const maxReferences = Math.max(0, selectedModel?.maxReferenceImages ?? 0);

  useEffect(() => {
    if (!availableModels.some((model) => model.id === modelId)) setModelId(getDefaultModelForMode(mode));
  }, [availableModels, mode, modelId]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !generating) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [generating, onClose]);

  const toggleReference = (id: string) => {
    setReferenceIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      const limit = maxReferences || 1;
      return [...current, id].slice(-limit);
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !modelId || generating) return;
    setGenerating(true);
    setError("");
    setOutputs([]);
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
      for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const status = await playgroundApi.getGenerationStatus(generation.id);
        if (status.status === "completed") {
          setOutputs(status.outputs ?? []);
          await onCompleted();
          return;
        }
        if (status.status === "failed") throw new Error(status.error || t("variantsGenFailed"));
      }
      throw new Error(t("genTimeout"));
    } catch (reason) {
      setError(apiErrorMessage(reason, t("variantsGenFailed")));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-overlay/80 backdrop-blur-sm p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-image-generation-title"
        tabIndex={-1}
        className="w-full max-w-[820px] max-h-[90vh] overflow-y-auto rounded-2xl border border-glass-border bg-elevated shadow-2xl focus:outline-none"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-subtle bg-elevated/95 px-6 py-5 backdrop-blur-md">
          <div>
            <div className="font-mono text-sm uppercase tracking-[0.16em] text-text-muted">{t("imageGenerationEyebrow")}</div>
            <h2 id="character-image-generation-title" className="mt-1 font-display text-2xl font-medium text-foreground">
              {t("characterGenerateTitle", { name: character.name })}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={generating} aria-label={t("closeInspector")} className="grid h-9 w-9 place-items-center rounded-full bg-surface-inset text-text-secondary transition-colors hover:text-foreground disabled:opacity-40">
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1.25fr)_minmax(250px,0.75fr)]">
          <div className="space-y-5">
            <section>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <label className="font-mono text-sm font-medium uppercase tracking-[0.12em] text-text-secondary">{t("generationPrompt")}</label>
                <span className="text-sm text-text-muted">{referenceIds.length ? t("imageToImage") : t("textToImage")}</span>
              </div>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} className="w-full resize-y rounded-xl border border-border-subtle bg-surface-inset px-4 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-primary" />
            </section>

            <section>
              <div className="mb-2.5 font-mono text-sm font-medium uppercase tracking-[0.12em] text-text-secondary">{t("referenceImages")}</div>
              {variants.length ? (
                <div className="grid grid-cols-5 gap-2">
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
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-glass-border bg-surface-inset px-4 py-4 text-sm text-text-muted">
                  <ImagePlus size={18} />
                  {t("noReferenceImage")}
                </div>
              )}
            </section>

            {outputs.length > 0 && (
              <section>
                <div className="mb-2.5 font-mono text-sm font-medium uppercase tracking-[0.12em] text-text-secondary">{t("generatedResults", { count: outputs.length })}</div>
                <div className="grid grid-cols-3 gap-2">
                  {outputs.map((output) => <img key={output.id} src={output.media_path} alt={t("variantAlt")} className="aspect-square w-full rounded-lg border border-glass-border object-cover" />)}
                </div>
                <div className="mt-2 text-sm text-status-success-fg">{t("generatedAutoSaved")}</div>
              </section>
            )}
          </div>

          <div className="space-y-4">
            <section className="space-y-4 rounded-xl border border-glass-border bg-surface-inset p-4">
              <label className="block">
                <span className="mb-2 block font-mono text-sm uppercase tracking-[0.1em] text-text-muted">{t("generationModel")}</span>
                <select value={modelId} onChange={(event) => setModelId(event.target.value)} className="h-10 w-full rounded-lg border border-border-subtle bg-elevated px-3 text-sm text-foreground outline-none focus:border-primary">
                  {availableModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-sm uppercase tracking-[0.1em] text-text-muted">{t("generationRatio")}</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {RATIOS.map((value) => <button key={value} type="button" onClick={() => setRatio(value)} className={`h-9 rounded-lg border text-sm transition-colors ${ratio === value ? "border-primary bg-primary text-on-accent" : "border-border-subtle bg-elevated text-text-secondary hover:text-foreground"}`}>{value}</button>)}
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-sm uppercase tracking-[0.1em] text-text-muted">{t("generationCount")}</span>
                <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-elevated p-1">
                  {[1, 2, 3].map((value) => <button key={value} type="button" onClick={() => setCount(value)} className={`h-8 rounded-md text-sm font-medium transition-colors ${count === value ? "bg-primary text-on-accent" : "text-text-secondary hover:text-foreground"}`}>×{value}</button>)}
                </div>
              </label>
            </section>

            <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="text-sm text-text-secondary hover:text-foreground">{showAdvanced ? t("hideAdvanced") : t("showAdvanced")}</button>
            {showAdvanced && <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} rows={4} placeholder={t("negativePromptPlaceholder")} className="w-full resize-y rounded-xl border border-border-subtle bg-surface-inset px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />}

            {error && <div role="alert" className="rounded-lg border border-status-error-border bg-status-error-bg px-3 py-2.5 text-sm text-status-error-fg">{error}</div>}
            <button type="button" onClick={handleGenerate} disabled={generating || !prompt.trim() || !modelId} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-accent transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {generating ? t("generating") : t("generateAndSave")}
            </button>
            <p className="text-sm leading-relaxed text-text-muted">{t("generationAutoSaveHint")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
