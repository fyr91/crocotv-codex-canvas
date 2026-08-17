"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, FolderPlus, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PlaygroundGenerationResponse } from "@/lib/api";
import { resolvePlaygroundMediaUrl } from "@/components/modules/playground/media";

type GenerationOutput = PlaygroundGenerationResponse["outputs"][number];

export default function CharacterGenerationPreviewModal({ generation, output, attached, attaching, onAttach, onClose }: {
  generation: PlaygroundGenerationResponse;
  output: GenerationOutput;
  attached: boolean;
  attaching: boolean;
  onAttach: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("library");
  const dialogRef = useRef<HTMLDivElement>(null);
  const src = resolvePlaygroundMediaUrl(output.thumbnail_path || output.media_path);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("generationPreviewTitle")} tabIndex={-1} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-elevated shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-4 border-b border-glass-border px-5 py-4">
          <div className="min-w-0">
            <div className="font-mono text-sm uppercase tracking-[0.16em] text-text-muted">{t("generationPreviewEyebrow")}</div>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-text-secondary">{generation.prompt}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("closeGenerationPreview")} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-inset text-text-secondary transition-colors hover:text-foreground"><X size={17} /></button>
        </div>
        <div className="min-h-0 flex-1 bg-black/35 p-4 sm:p-6">
          <img src={src} alt={generation.prompt} className="mx-auto max-h-[68vh] max-w-full rounded-xl object-contain" />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-glass-border px-5 py-4">
          <span className="truncate font-mono text-sm text-text-muted">{generation.model_id || generation.mode}</span>
          {attached ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-status-completed-border bg-status-completed-bg px-4 text-sm font-medium text-status-completed-fg"><Check size={15} strokeWidth={3} />{t("addedToAssets")}</span>
          ) : (
            <button type="button" onClick={onAttach} disabled={!output.resource_id || attaching} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-accent transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
              {attaching ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} />}{attaching ? t("addingGenerationToCharacter") : t("addGenerationToCharacter")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
