'use client';

import { useMemo } from 'react';
import { Package } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editorStore';
import ProjectEntityPanel from './ProjectEntityPanel';

export interface PropsPanelProps {
  editor: Editor | null;
}

const QUOTED_PROP_RE = /[「"']([\u4e00-\u9fff\w]{1,20})[」"']/g;

export default function PropsPanel({ editor }: PropsPanelProps) {
  const t = useTranslations('scriptEditor');
  const wordCount = useEditorStore((state) => state.wordCount);
  const suggestions = useMemo(() => {
    if (!editor) return [];
    const names = new Set<string>();
    const text = editor.getText({ blockSeparator: '\n' });
    QUOTED_PROP_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = QUOTED_PROP_RE.exec(text)) !== null) names.add(match[1]);
    return Array.from(names).map((name) => ({ name }));
  }, [editor, wordCount]);

  return (
    <ProjectEntityPanel
      kind="prop"
      suggestions={suggestions}
      icon={<Package size={15} />}
      emptyTitle={t('panels.propsEmpty')}
      emptyHint={t('panels.propsEmptyHint')}
      countLabel={(count) => t('panels.propsCount', { count })}
    />
  );
}
