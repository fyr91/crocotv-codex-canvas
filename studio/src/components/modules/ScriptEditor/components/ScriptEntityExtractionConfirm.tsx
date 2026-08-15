'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import EntityConfirmModal from '@/components/modules/EntityConfirmModal';
import ReconcileModal from '@/components/modules/ReconcileModal';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';

export default function ScriptEntityExtractionConfirm() {
  const t = useTranslations('script');
  const pendingExtraction = useProjectStore((state) => state.pendingExtraction);
  const currentProject = useProjectStore((state) => state.currentProject);
  const confirmExtraction = useProjectStore((state) => state.confirmExtraction);
  const discardExtraction = useProjectStore((state) => state.discardExtraction);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  const handleConfirm = async () => {
    try {
      await confirmExtraction();
      const refreshed = useProjectStore.getState().currentProject;
      if (refreshed?.series_id) {
        setReconcileOpen(true);
      }
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
        isOpen={Boolean(pendingExtraction)}
        preview={pendingExtraction}
        currentCounts={{
          characters: currentProject?.characters?.length ?? 0,
          scenes: currentProject?.scenes?.length ?? 0,
          props: currentProject?.props?.length ?? 0,
        }}
        onConfirm={() => void handleConfirm()}
        onDiscard={handleDiscard}
      />
      <ReconcileModal
        isOpen={reconcileOpen}
        scriptId={currentProject?.id ?? null}
        onClose={() => setReconcileOpen(false)}
      />
    </>
  );
}
