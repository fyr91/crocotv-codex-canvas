'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Undo2,
  Redo2,
  Download,
  Pencil,
  LayoutGrid,
  BookOpen,
  Maximize2,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { ViewMode } from '@/store/editorStore';

export interface EditorToolbarProps {
  editor: Editor | null;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export default function EditorToolbar({ editor, viewMode = 'edit', onViewModeChange }: EditorToolbarProps) {
  const t = useTranslations('scriptEditor');

  const VIEW_OPTIONS: { value: ViewMode; label: string; icon: typeof Pencil }[] = [
    { value: 'edit', label: t('views.edit'), icon: Pencil },
    { value: 'storyboard', label: t('views.storyboard'), icon: LayoutGrid },
    { value: 'read', label: t('views.read'), icon: BookOpen },
    { value: 'focus', label: t('views.focus'), icon: Maximize2 },
  ];

  const handleUndo = useCallback(() => {
    editor?.chain().focus().undo().run();
  }, [editor]);

  const handleRedo = useCallback(() => {
    editor?.chain().focus().redo().run();
  }, [editor]);

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-foreground/10 bg-surface/80 px-4">
      {/* Undo / Redo */}
      <button
        type="button"
        onClick={handleUndo}
        disabled={!editor?.can().undo()}
        className="rounded p-1.5 text-text-secondary transition-colors hover:bg-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={t('toolbar.undo')}
      >
        <Undo2 size={15} />
      </button>
      <button
        type="button"
        onClick={handleRedo}
        disabled={!editor?.can().redo()}
        className="rounded p-1.5 text-text-secondary transition-colors hover:bg-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={t('toolbar.redo')}
      >
        <Redo2 size={15} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* View Mode Toggle */}
      <div className="flex items-center gap-0.5 rounded-md border border-foreground/10 bg-elevated/50 p-0.5">
        {VIEW_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = viewMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onViewModeChange?.(opt.value)}
              className={`rounded px-2 py-1 text-sm transition-all ${
                isActive
                  ? 'bg-foreground/10 text-foreground shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              aria-label={opt.label}
              title={opt.label}
            >
              <Icon size={13} />
            </button>
          );
        })}
      </div>

      {/* Export (placeholder) */}
      <button
        type="button"
        disabled
        className="rounded p-1.5 text-text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t('toolbar.export')}
      >
        <Download size={15} />
      </button>
    </div>
  );
}
