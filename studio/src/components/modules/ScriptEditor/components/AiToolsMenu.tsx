'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Play, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AiToolsMenuProps {
  extracting: boolean;
  extractDisabled?: boolean;
  onExtractEntities: () => void | Promise<void>;
  showExtraction?: boolean;
}

export default function AiToolsMenu({
  extracting,
  extractDisabled = false,
  onExtractEntities,
  showExtraction = true,
}: AiToolsMenuProps) {
  const t = useTranslations('scriptEditor');
  const tScript = useTranslations('script');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const tools = [
    { id: 'extract', label: tScript('extractEntities'), available: true },
    { id: 'split-shots', label: t('aiTools.splitShots'), available: false },
    { id: 'continue-writing', label: t('aiTools.continueWriting'), available: false },
    { id: 'polish-text', label: t('aiTools.polishText'), available: false },
    { id: 'generate-script', label: t('aiTools.generateScript'), available: false },
  ] as const;
  const visibleTools = showExtraction ? tools : tools.filter((tool) => tool.id !== 'extract');

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const runExtraction = () => {
    if (extracting || extractDisabled) return;
    setOpen(false);
    void onExtractEntities();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Sparkles size={13} />
        <span>{t('toolbar.ai')}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 overflow-hidden rounded-xl border border-foreground/10 bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          {visibleTools.map((tool) => {
            const executionDisabled = !tool.available || extractDisabled || extracting;
            return (
              <div
                key={tool.id}
                role="none"
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 ${
                  tool.available ? 'text-foreground' : 'text-text-muted opacity-55'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{tool.label}</span>
                {!tool.available && (
                  <span className="shrink-0 text-[11px] text-text-muted">{t('aiTools.comingSoon')}</span>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={tool.available ? runExtraction : undefined}
                  disabled={executionDisabled}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-foreground/10 text-text-secondary transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={t('aiTools.executeTool', { tool: tool.label })}
                  title={tool.available ? t('aiTools.execute') : t('aiTools.comingSoon')}
                >
                  {tool.available && extracting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Play size={12} fill="currentColor" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
