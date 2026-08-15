'use client';

import { useTranslations } from 'next-intl';
import { Image as ImageIcon, Video } from 'lucide-react';
import { usePlaygroundStore, type PlaygroundMode } from './usePlaygroundStore';

const IMAGE_MODES: PlaygroundMode[] = ['t2i', 'i2i'];
const VIDEO_MODES: PlaygroundMode[] = ['t2v', 'i2v', 'r2v', 'v2v'];
type ModeCategory = 'image' | 'video';

function getModeCategory(mode: PlaygroundMode): ModeCategory {
  return IMAGE_MODES.includes(mode) ? 'image' : 'video';
}

export default function ModeSelector() {
  const t = useTranslations('playground');
  const mode = usePlaygroundStore((s) => s.mode);
  const setMode = usePlaygroundStore((s) => s.setMode);
  const category = getModeCategory(mode);

  const selectCategory = (nextCategory: ModeCategory) => {
    if (nextCategory === category) return;
    setMode(nextCategory === 'image' ? 't2i' : 't2v');
  };

  const renderPill = (key: PlaygroundMode) => {
    const active = mode === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setMode(key)}
        aria-pressed={active}
        className={[
          'flex-1 rounded-full px-3 py-1.5 text-sm font-medium text-center transition-all cursor-pointer',
          active
            ? 'bg-surface text-foreground shadow-sm atelier-pill-tab-active'
            : 'text-text-muted hover:text-foreground hover:bg-hover-bg',
        ].join(' ')}
      >
        {t(`mode.${key}`)}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label={t('mode.categoryLabel')}
        className="grid grid-cols-2 gap-1 rounded-xl border border-border-subtle bg-surface-inset p-1"
      >
        <button
          type="button"
          role="tab"
          id="playground-image-tab"
          aria-selected={category === 'image'}
          aria-controls="playground-mode-panel"
          onClick={() => selectCategory('image')}
          className={[
            'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
            category === 'image'
              ? 'bg-surface text-foreground shadow-sm ring-1 ring-border-strong'
              : 'text-text-muted hover:bg-hover-bg hover:text-foreground',
          ].join(' ')}
        >
          <ImageIcon size={16} aria-hidden="true" />
          {t('mode.image')}
        </button>
        <button
          type="button"
          role="tab"
          id="playground-video-tab"
          aria-selected={category === 'video'}
          aria-controls="playground-mode-panel"
          onClick={() => selectCategory('video')}
          className={[
            'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
            category === 'video'
              ? 'bg-surface text-foreground shadow-sm ring-1 ring-border-strong'
              : 'text-text-muted hover:bg-hover-bg hover:text-foreground',
          ].join(' ')}
        >
          <Video size={16} aria-hidden="true" />
          {t('mode.video')}
        </button>
      </div>

      <div
        id="playground-mode-panel"
        role="tabpanel"
        aria-labelledby={category === 'image' ? 'playground-image-tab' : 'playground-video-tab'}
      >
        <div className="flex gap-[2px] bg-surface-inset rounded-full p-[3px] atelier-pill-tabs">
          {(category === 'image' ? IMAGE_MODES : VIDEO_MODES).map(renderPill)}
        </div>
      </div>
    </div>
  );
}
