'use client';

import { useTranslations } from 'next-intl';
import EntityConfirmModal from '@/components/modules/EntityConfirmModal';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';
import type { ExtractionPreview } from '@/types/entityExtraction';

export default function ScriptEntityExtractionConfirm() {
  const t = useTranslations('script');
  const pendingExtraction = useProjectStore((state) => state.pendingExtraction);
  const pendingExtractionProjectId = useProjectStore((state) => state.pendingExtractionProjectId);
  const currentProject = useProjectStore((state) => state.currentProject);
  const confirmExtraction = useProjectStore((state) => state.confirmExtraction);
  const discardExtraction = useProjectStore((state) => state.discardExtraction);

  const handleConfirm = async (preview: ExtractionPreview) => {
    try {
      await confirmExtraction(preview);
    } catch {
      toast.error(t('analysisFailedShort'));
    }
  };

  const handleDiscard = () => {
    discardExtraction();
    toast.info(t('extractionDiscarded'));
  };

  return (
    <>
      <EntityConfirmModal
        isOpen={Boolean(pendingExtraction && currentProject?.id === pendingExtractionProjectId)}
        preview={pendingExtraction}
        currentCounts={{
          characters: currentProject?.characters?.length ?? 0,
          scenes: currentProject?.scenes?.length ?? 0,
          props: currentProject?.props?.length ?? 0,
        }}
        onConfirm={(preview) => void handleConfirm(preview)}
        onDiscard={handleDiscard}
      />
    </>
  );
}
