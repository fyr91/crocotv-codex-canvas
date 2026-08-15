'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editorStore';
import ProjectEntityPanel from './ProjectEntityPanel';

export interface CharacterPanelProps {
  editor: Editor | null;
}

export default function CharacterPanel({ editor: _editor }: CharacterPanelProps) {
  const t = useTranslations('scriptEditor');
  const derivedCharacters = useEditorStore((state) => state.derivedCharacters);
  const suggestions = useMemo(() => derivedCharacters.map((character) => ({
    name: character.name,
    description: t('panels.characterOccurrences', { count: character.occurrences }),
  })), [derivedCharacters, t]);

  return (
    <ProjectEntityPanel
      kind="character"
      suggestions={suggestions}
      icon={<Users size={15} />}
      emptyTitle={t('panels.characterEmpty')}
      emptyHint={t('panels.characterEmptyHint')}
      countLabel={(count) => t('panels.characterCount', { count })}
    />
  );
}
