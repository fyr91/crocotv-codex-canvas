'use client';

import { Minimize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface FocusModeExitButtonProps {
  onExit: () => void;
}

export default function FocusModeExitButton({ onExit }: FocusModeExitButtonProps) {
  const t = useTranslations('scriptEditor.views');

  return (
    <button
      type="button"
      onClick={onExit}
      className="absolute right-4 top-4 z-30 inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-elevated/90 px-3 py-2 text-sm font-medium text-text-secondary shadow-lg backdrop-blur transition-colors hover:border-foreground/20 hover:text-foreground"
      aria-label={t('exitFocus')}
      title={`${t('exitFocus')} (Esc)`}
    >
      <Minimize2 size={14} />
      <span>{t('exitFocus')}</span>
    </button>
  );
}
