"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  COMPOSITION_QUICK_TAGS,
  CHARACTER_COMPOSITION_TEMPLATES,
  type CharacterCompositionTemplate,
} from "./characterCompositionTemplates";

export function CharacterCompositionTemplatePicker({ selected, onSelect, disabled = false }: {
  selected: CharacterCompositionTemplate;
  onSelect: (template: CharacterCompositionTemplate) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("castWorkbench");

  return (
    <div>
      <p className="mb-2.5 font-mono text-sm uppercase tracking-[0.18em] text-text-muted">{t("templateSelectLabel")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.entries(CHARACTER_COMPOSITION_TEMPLATES) as Array<[CharacterCompositionTemplate, typeof CHARACTER_COMPOSITION_TEMPLATES[CharacterCompositionTemplate]]>).map(([key, template]) => {
          const active = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              disabled={disabled}
              aria-pressed={active}
              className={`relative min-w-0 overflow-hidden rounded-lg border text-left transition-all ${active ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30" : "border-glass-border bg-black/20 hover:border-foreground/30 hover:bg-hover-bg"} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-black/30">
                <img src={template.exampleImage} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="px-2.5 py-2">
                <p className={`text-sm font-medium ${active ? "text-foreground" : "text-text-secondary"}`}>{t(template.labelKey)}</p>
                <p className="mt-0.5 line-clamp-1 text-sm text-text-muted">{t(template.descKey)}</p>
              </div>
              {active && <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary"><Check size={9} className="text-on-accent" strokeWidth={3} /></span>}
              {template.requiredModelId && <span className="absolute bottom-[3.2rem] right-1.5 rounded-full border border-white/10 bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur">GPT Image 02</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CharacterCompositionQuickTags({ kind = "character", onAppend, disabled = false }: { kind?: "character" | "scene" | "prop"; onAppend: (value: string) => void; disabled?: boolean }) {
  const t = useTranslations("castWorkbench");
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={t("quickTagsLabel")}>
      {COMPOSITION_QUICK_TAGS[kind].map((tag) => (
        <button key={tag.value} type="button" onClick={() => onAppend(tag.value)} disabled={disabled} className="rounded border border-glass-border bg-glass px-2.5 py-1 text-sm text-text-muted transition-colors hover:border-foreground/30 hover:bg-hover-bg hover:text-text-secondary disabled:opacity-30">
          + {t(tag.labelKey)}
        </button>
      ))}
    </div>
  );
}
