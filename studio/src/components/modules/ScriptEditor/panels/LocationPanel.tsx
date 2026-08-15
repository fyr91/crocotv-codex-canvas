'use client';

import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editorStore';
import ProjectEntityPanel from './ProjectEntityPanel';

export interface LocationPanelProps {
  editor: Editor | null;
}

export default function LocationPanel({ editor: _editor }: LocationPanelProps) {
  const t = useTranslations('scriptEditor');
  const derivedScenes = useEditorStore((state) => state.derivedScenes);
  const suggestions = useMemo(() => {
    const locations = new Map<string, number>();
    for (const scene of derivedScenes) {
      const location = scene.location?.trim();
      if (location) locations.set(location, (locations.get(location) || 0) + 1);
    }
    return Array.from(locations.entries()).map(([name, count]) => ({
      name,
      description: t('panels.characterScenes', { count }),
    }));
  }, [derivedScenes, t]);

  return (
    <ProjectEntityPanel
      kind="scene"
      suggestions={suggestions}
      icon={<MapPin size={15} />}
      emptyTitle={t('panels.locationEmpty')}
      emptyHint={t('panels.locationEmptyHint')}
      countLabel={(count) => t('panels.locationCount', { count })}
    />
  );
}
