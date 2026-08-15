import { act, renderHook } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/store/editorStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    useEditorStore.getState().reset();
  });

  it.each(['read', 'focus'] as const)('exits %s mode when Escape is pressed', (viewMode) => {
    useEditorStore.setState({ viewMode });
    renderHook(() => useKeyboardShortcuts({} as Editor));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(useEditorStore.getState().viewMode).toBe('edit');
  });
});
