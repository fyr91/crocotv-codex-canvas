"use client";

import { AlertCircle, Check, FolderPlus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PlaygroundGenerationResponse } from "@/lib/api";
import { resolvePlaygroundMediaUrl } from "@/components/modules/playground/media";

interface CharacterGenerationCardsProps {
  generations: PlaygroundGenerationResponse[];
  attachedResourceIds: Set<string>;
  attachingResourceId?: string;
  onAttach: (generation: PlaygroundGenerationResponse, resourceId: string) => void;
}

export default function CharacterGenerationCards({ generations, attachedResourceIds, attachingResourceId, onAttach }: CharacterGenerationCardsProps) {
  const t = useTranslations("library");

  return (
    <div className="space-y-3">
      {generations.map((generation) => {
        if (generation.status === "failed") {
          return (
            <div key={generation.id} className="overflow-hidden rounded-xl border border-status-failed-border bg-glass">
              <div className="flex min-h-24 flex-col items-center justify-center gap-2 bg-status-failed-bg px-4 py-4 text-center">
                <AlertCircle size={20} className="text-status-failed-fg" />
                <span className="font-mono text-sm uppercase tracking-[0.1em] text-status-failed-fg">{t("generationFailed")}</span>
                {generation.error && <p className="line-clamp-3 text-sm leading-relaxed text-text-muted">{generation.error}</p>}
              </div>
              <GenerationMeta generation={generation} />
            </div>
          );
        }

        if (generation.status !== "completed") {
          return (
            <div key={generation.id} className="overflow-hidden rounded-xl border border-glass-border bg-glass">
              <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-elevated">
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-elevated via-surface-inset to-elevated" />
                <div className="relative flex items-center gap-2 rounded-full border border-glass-border bg-surface/80 px-3 py-1.5 text-sm text-text-secondary backdrop-blur-md">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  {generation.status === "pending" ? t("generationPending") : t("generationProcessing")}
                </div>
              </div>
              <GenerationMeta generation={generation} />
            </div>
          );
        }

        return (
          <div key={generation.id} className="rounded-xl border border-glass-border bg-glass p-2.5">
            <div className="grid grid-cols-2 gap-2">
              {generation.outputs.map((output) => {
                const resourceId = output.resource_id || "";
                const attached = Boolean(resourceId && attachedResourceIds.has(resourceId));
                const attaching = attachingResourceId === resourceId;
                return (
                  <div key={output.id} className="group relative aspect-square overflow-hidden rounded-lg border border-glass-border bg-elevated">
                    <img src={resolvePlaygroundMediaUrl(output.thumbnail_path || output.media_path)} alt={generation.prompt} className="h-full w-full object-cover" />
                    {attached && (
                      <span className="absolute left-2 top-2 z-[3] inline-flex items-center gap-1 rounded border border-status-success-border bg-status-success-bg px-1.5 py-0.5 font-mono text-sm text-status-success-fg backdrop-blur-sm">
                        <Check size={10} />
                        {t("addedToAssets")}
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 z-[2] flex h-12 items-end justify-end bg-gradient-to-t from-black/75 to-transparent px-2 pb-2">
                      <button
                        type="button"
                        onClick={() => resourceId && onAttach(generation, resourceId)}
                        disabled={!resourceId || attached || attaching}
                        aria-label={attached ? t("addedToAssets") : t("addGenerationToCharacter")}
                        title={attached ? t("addedToAssets") : t("addGenerationToCharacter")}
                        className={`grid h-7 w-7 place-items-center rounded-full backdrop-blur-sm transition-colors ${attached ? "bg-status-success-bg text-status-success-fg" : "bg-elevated text-foreground hover:bg-hover-bg"} disabled:cursor-default disabled:opacity-70`}
                      >
                        {attaching ? <Loader2 size={13} className="animate-spin" /> : attached ? <Check size={13} /> : <FolderPlus size={13} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <GenerationMeta generation={generation} />
          </div>
        );
      })}
    </div>
  );
}

function GenerationMeta({ generation }: { generation: PlaygroundGenerationResponse }) {
  const time = new Date(generation.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="px-1 pt-2.5">
      <p className="mb-1.5 line-clamp-2 text-sm leading-relaxed text-text-secondary">{generation.prompt}</p>
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <span className="min-w-0 truncate rounded bg-surface-inset px-1.5 py-0.5 font-mono">{generation.model_id || generation.mode}</span>
        <span className="ml-auto flex-shrink-0 font-mono">{time}</span>
      </div>
    </div>
  );
}
