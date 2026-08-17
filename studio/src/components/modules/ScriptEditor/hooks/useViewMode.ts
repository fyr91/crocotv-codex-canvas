'use client';

import { useCallback, useMemo } from 'react';
import { useEditorStore, type ViewMode } from '@/store/editorStore';

export type { ViewMode };

export interface ViewModeState {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  isReadOnly: boolean;
  showToolbar: boolean;
  showSidebars: boolean;
}

/**
 * 视图模式切换 Hook
 *
 * - edit:       正常编辑（showToolbar + showSidebars + editable）
 * - read:       只读（隐藏工具栏，编辑区不可编辑，优雅阅读排版）
 * - focus:      全屏专注（隐藏所有侧栏 + 工具栏，编辑区居中加宽）
 */
export function useViewMode(): ViewModeState {
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);

  const setMode = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
    },
    [setViewMode]
  );

  const isReadOnly = useMemo(() => viewMode === 'read', [viewMode]);

  const showToolbar = useMemo(
    () => viewMode === 'edit',
    [viewMode]
  );

  const showSidebars = useMemo(
    () => viewMode === 'edit',
    [viewMode]
  );

  return {
    mode: viewMode,
    setMode,
    isReadOnly,
    showToolbar,
    showSidebars,
  };
}
