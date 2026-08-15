import { useEffect, useRef, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { scriptEditorApi } from '@/lib/scriptEditorApi';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';

const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds
const AUTOSAVE_DEBOUNCE_MS = 1_200;

/**
 * 自动保存 Hook
 * - 30s 周期自动保存（仅当 isDirty 时）
 * - Cmd+S / Ctrl+S 手动保存 + 创建快照
 * - beforeunload 事件拦截（离开页面前提醒保存）
 */
export function useAutoSave(editor: Editor | null, projectId: string | null) {
  const { isDirty, setDirty, setLastSavedAt } = useEditorStore();
  const isSavingRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 核心保存逻辑
  const save = useCallback(
    async (createSnapshot = false) => {
      if (!editor || !projectId) return;
      if (isSavingRef.current) {
        saveQueuedRef.current = true;
        return;
      }

      const content = editor.getJSON();
      const plainText = editor.getText({ blockSeparator: '\n' });
      isSavingRef.current = true;

      try {
        const response = await scriptEditorApi.saveDocument(projectId, content, plainText, createSnapshot);
        const currentProject = useProjectStore.getState().currentProject;
        if (currentProject?.id === projectId) {
          useProjectStore.getState().updateProject(projectId, {
            originalText: response.original_text ?? plainText,
          });
        }
        setDirty(false);
        setLastSavedAt(new Date());
      } catch (err) {
        console.error('[useAutoSave] Save failed:', err);
      } finally {
        isSavingRef.current = false;
        if (saveQueuedRef.current) {
          saveQueuedRef.current = false;
          void save(false);
        }
      }
    },
    [editor, projectId, setDirty, setLastSavedAt]
  );

  // Save shortly after the user stops typing. The 30s interval below remains
  // as a safety net for unusual editor updates that do not emit normally.
  useEffect(() => {
    if (!editor || !projectId) return;

    const handleUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void save(false), AUTOSAVE_DEBOUNCE_MS);
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (useEditorStore.getState().isDirty) void save(false);
    };
  }, [editor, projectId, save]);

  // 30s 周期自动保存
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (useEditorStore.getState().isDirty) {
        save(false);
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [save]);

  // Cmd+S / Ctrl+S 手动保存（创建快照）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save(true); // 手动保存时创建快照
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save]);

  // beforeunload 拦截
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().isDirty) {
        e.preventDefault();
        // 尝试在卸载前保存
        if (editor && projectId) {
          const content = editor.getJSON();
          const plainText = editor.getText({ blockSeparator: '\n' });
          const payload = new Blob(
            [JSON.stringify({ content, plain_text: plainText, create_snapshot: false })],
            { type: 'application/json' }
          );
          navigator.sendBeacon?.(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:17177'}/projects/${projectId}/document`,
            payload
          );
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editor, projectId]);

  return { save };
}
