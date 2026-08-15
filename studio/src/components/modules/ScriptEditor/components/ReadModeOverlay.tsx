'use client';

import { BookOpen, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ReadModeOverlayProps {
  isEmpty: boolean;
  onExit: () => void;
}

export default function ReadModeOverlay({ isEmpty, onExit }: ReadModeOverlayProps) {
  const t = useTranslations('scriptEditor.views');

  return (
    <>
      <button
        type="button"
        onClick={onExit}
        className="absolute right-4 top-4 z-30 inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-elevated/90 px-3 py-2 text-sm font-medium text-text-secondary shadow-lg backdrop-blur transition-colors hover:border-foreground/20 hover:text-foreground"
        aria-label={t('exitRead')}
        title={`${t('exitRead')} (Esc)`}
      >
        <Pencil size={14} />
        <span>{t('exitRead')}</span>
      </button>

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-6">
          <div className="flex max-w-sm flex-col items-center text-center text-text-muted">
            <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-foreground/10 bg-elevated/60">
              <BookOpen size={20} />
            </span>
            <p className="text-base font-medium text-text-secondary">{t('readEmpty')}</p>
            <p className="mt-1 text-sm leading-6">{t('readEmptyHint')}</p>
          </div>
        </div>
      )}
    </>
  );
}
