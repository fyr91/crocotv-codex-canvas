'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EditorContent } from '@tiptap/react';
import { Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, WifiOff, RotateCcw, Wand2, X } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { useEditorSetup } from './hooks/useEditorSetup';
import FormatToolbar from './toolbar/FormatToolbar';
import { usePasteHandler } from './hooks/usePasteHandler';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useContinuityCheck } from './hooks/useContinuityCheck';
import { useSceneFolding } from './hooks/useSceneFolding';
import { useViewMode } from './hooks/useViewMode';
import { useOfflineCache } from './hooks/useOfflineCache';
import { useAutoSave } from './hooks/useAutoSave';
import { useDerivation } from './hooks/useDerivation';
import { PasteHintBar } from './components/PasteHintBar';
import { ShortcutHelpPanel } from './components/ShortcutHelpPanel';
import { ContinuityIndicator } from './components/ContinuityIndicator';
import RightPanelContainer from './panels';
import LeftSidebar from './sidebar';
import StoryboardView from './views/StoryboardView';
import ReadModeOverlay from './components/ReadModeOverlay';
import PipelineLinkDialog from './dialogs/PipelineLinkDialog';
import { scriptEditorApi } from '@/lib/scriptEditorApi';
import { api } from '@/lib/api';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';
import ScriptEntityExtractionConfirm from './components/ScriptEntityExtractionConfirm';
import { apiErrorMessage } from '@/lib/apiError';

export interface ScriptEditorShellProps {
  mode?: 'full' | 'embedded' | 'focus';
  projectId?: string;
  initialContent?: string | Record<string, unknown> | null;
}

export default function ScriptEditorShell({
  mode = 'full',
  projectId,
  initialContent,
}: ScriptEditorShellProps) {
  const t = useTranslations('scriptEditor');
  const tScript = useTranslations('script');
  const { editor, isReady } = useEditorSetup({ content: initialContent });
  const { showHint, analysis, applyFormatting, dismissHint } = usePasteHandler(editor);
  const { showShortcutHelp, closeShortcutHelp } = useKeyboardShortcuts(editor);
  const continuityReport = useContinuityCheck(editor);
  const { enabled: foldingEnabled, isAllExpanded, totalScenes: foldingTotal } = useSceneFolding(editor);
  const { mode: viewMode, setMode: setViewMode, isReadOnly, showToolbar, showSidebars } = useViewMode();
  const { hasNewerLocal, restoreFromLocal, dismissLocalRestore, isOffline } = useOfflineCache(projectId, editor);
  useDerivation(editor);
  const { save } = useAutoSave(editor, projectId ?? null);

  const [documentLoading, setDocumentLoading] = useState(Boolean(projectId));
  const [projectPickerOpen, setProjectPickerOpen] = useState(!projectId);
  const currentProject = useProjectStore((s) => s.currentProject);
  const selectProject = useProjectStore((s) => s.selectProject);
  const isAnalyzing = useProjectStore((s) => s.isAnalyzing);

  const isDirty = useEditorStore((s) => s.isDirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const wordCount = useEditorStore((s) => s.wordCount);
  const derivedScenes = useEditorStore((s) => s.derivedScenes);
  const currentFormat = useEditorStore((s) => s.currentFormat);
  const currentRendering = useEditorStore((s) => s.currentRendering);
  const leftCollapsed = useEditorStore((s) => s.leftSidebarCollapsed);
  const rightCollapsed = useEditorStore((s) => s.rightSidebarCollapsed);
  const toggleLeft = useEditorStore((s) => s.toggleLeftSidebar);
  const toggleRight = useEditorStore((s) => s.toggleRightSidebar);
  const setProjectId = useEditorStore((s) => s.setProjectId);
  const setEditorMode = useEditorStore((s) => s.setEditorMode);
  const setDirty = useEditorStore((s) => s.setDirty);
  const setLastSavedAt = useEditorStore((s) => s.setLastSavedAt);

  const showLeft = mode === 'full' && !leftCollapsed && showSidebars;
  const showRight = mode === 'full' && !rightCollapsed && showSidebars;
  const hideAllSidebars = mode === 'focus' || viewMode === 'focus';
  const hideLeftOnly = mode === 'embedded';
  const isEditorEmpty = !editor || editor.isEmpty;
  const didNormalizeEmptyView = useRef(false);
  const didAutoFocusEmptyEditor = useRef(false);

  useEffect(() => {
    setProjectId(projectId ?? null);
    setEditorMode(mode);
  }, [mode, projectId, setEditorMode, setProjectId]);

  useEffect(() => {
    if (!projectId || !editor) {
      setDocumentLoading(false);
      return;
    }

    let cancelled = false;
    setDocumentLoading(true);
    const selectedProject = useProjectStore.getState().currentProject;
    void Promise.all([
      scriptEditorApi.loadDocument(projectId),
      selectedProject?.id === projectId ? Promise.resolve() : selectProject(projectId),
    ])
      .then(([response]) => {
        if (cancelled) return;
        editor.commands.setContent(response.content, { emitUpdate: false });
        setDirty(false);
        setLastSavedAt(response.updated_at ? new Date(response.updated_at) : null);
        setDocumentLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[ScriptEditor] Failed to load project document:', error);
        toast.error(tScript('loadFailed'));
        setDocumentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editor, projectId, selectProject, setDirty, setLastSavedAt, tScript]);

  useEffect(() => {
    editor?.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  useEffect(() => {
    if (
      didNormalizeEmptyView.current ||
      mode !== 'full' ||
      !isReady ||
      documentLoading ||
      !editor?.isEmpty
    ) {
      return;
    }

    didNormalizeEmptyView.current = true;
    if (viewMode !== 'edit') {
      setViewMode('edit');
    }
  }, [documentLoading, editor, isReady, mode, setViewMode, viewMode]);

  useEffect(() => {
    if (
      didAutoFocusEmptyEditor.current ||
      mode !== 'full' ||
      viewMode !== 'edit' ||
      isReadOnly ||
      !isReady ||
      documentLoading ||
      !editor?.isEmpty
    ) {
      return;
    }

    didAutoFocusEmptyEditor.current = true;
    const frame = window.requestAnimationFrame(() => {
      editor.commands.focus('start');
    });

    return () => window.cancelAnimationFrame(frame);
  }, [documentLoading, editor, isReady, isReadOnly, mode, viewMode]);

  const handleEnterPipeline = useCallback(() => {
    if (!projectId) return;
    void save(false).finally(() => {
      window.location.hash = `#/project/${projectId}`;
    });
  }, [projectId, save]);

  const handleProjectLink = useCallback((linkedProjectId: string) => {
    window.location.hash = `#/project/${linkedProjectId}/editor`;
  }, []);

  const handleExtractEntities = useCallback(async () => {
    if (!projectId || !editor) return;
    const text = editor.getText({ blockSeparator: '\n' });
    if (!text.trim()) {
      toast.warning(tScript('scriptEmpty'));
      return;
    }

    useProjectStore.setState({ isAnalyzing: true });
    const toastId = toast.progress(tScript('analyzingScript'), {
      projectId,
      projectTitle: currentProject?.id === projectId ? currentProject.title : undefined,
      body: tScript('analyzingScriptBody'),
    });
    try {
      await save(false);
      const preview = await api.extractPreview(projectId, text);
      useProjectStore.setState({
        pendingExtraction: preview,
        pendingExtractionScript: text,
        isAnalyzing: false,
      });
      toast.update(toastId, {
        kind: 'success',
        title: tScript('analysisDone'),
        body: tScript('analysisDoneBody', {
          c: preview.characters.length,
          s: preview.scenes.length,
          p: preview.props.length,
        }),
        autoCloseMs: 5000,
      });
    } catch (error) {
      useProjectStore.setState({ isAnalyzing: false });
      console.error('[ScriptEditor] Entity extraction failed:', error);
      toast.update(toastId, {
        kind: 'error',
        title: tScript('analysisFailedShort'),
        body: apiErrorMessage(error),
      });
    }
  }, [currentProject?.id, currentProject?.title, editor, projectId, save, tScript]);

  const handleShotClick = useCallback((shotId: string) => {
    setViewMode('edit');
    if (editor) {
      const { doc } = editor.state;
      let targetPos: number | null = null;
      doc.descendants((node, pos) => {
        if (node.type.name === 'shotBlock' && node.attrs?.id === shotId) {
          targetPos = pos;
          return false;
        }
      });
      if (targetPos !== null) {
        editor.commands.setTextSelection(targetPos);
        editor.commands.scrollIntoView();
      }
    }
  }, [editor, setViewMode]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      {viewMode === 'read' && (
        <ReadModeOverlay
          isEmpty={isReady && isEditorEmpty}
          onExit={() => setViewMode('edit')}
        />
      )}

      {/* Format Toolbar */}
      {!hideAllSidebars && showToolbar && (
        <FormatToolbar editor={editor} viewMode={viewMode} onViewModeChange={setViewMode} />
      )}

      {/* Top Toolbar */}
      {!hideAllSidebars && showToolbar && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-foreground/10 px-4">
          <div className="flex items-center gap-3">
            {mode === 'full' && (
              <button
                type="button"
                onClick={toggleLeft}
                className="text-text-muted hover:text-foreground transition-colors"
                aria-label={t('shell.toggleLeftSidebar')}
              >
                {leftCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            )}
            <span className="text-sm font-medium text-foreground">
              {t('shell.title')}
            </span>
            {projectId && (
              <span className="text-sm text-text-muted">{currentProject?.id === projectId ? currentProject.title : projectId}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {projectId ? (
              <button
                type="button"
                onClick={() => void handleExtractEntities()}
                disabled={documentLoading || isAnalyzing || isEditorEmpty}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAnalyzing ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                {isAnalyzing ? tScript('analyzingScript') : tScript('extractEntities')}
              </button>
            ) : null}
            <span className="text-sm text-text-muted">
              {isDirty ? t('status.unsaved') : lastSavedAt ? t('status.savedAt', { time: lastSavedAt.toLocaleTimeString() }) : ''}
            </span>
            {mode === 'full' && (
              <button
                type="button"
                onClick={toggleRight}
                className="text-text-muted hover:text-foreground transition-colors"
                aria-label={t('shell.toggleRightSidebar')}
              >
                {rightCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main content area: Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {!hideAllSidebars && !hideLeftOnly && showLeft && (
          <aside className="w-[260px] shrink-0 border-r border-foreground/10 bg-foreground/[0.02] backdrop-blur-xl overflow-hidden">
            <LeftSidebar editor={editor} />
          </aside>
        )}

        {/* Editor Content Area / Storyboard View */}
        {viewMode === 'storyboard' ? (
          <main className="relative flex-1 min-w-0 overflow-hidden">
            <StoryboardView editor={editor} onShotClick={handleShotClick} />
          </main>
        ) : (
          <main className={`relative flex-1 min-w-0 overflow-y-auto ${
            viewMode === 'focus' ? 'flex items-start justify-center' : ''
          }`}>
            {/* Offline / local restore banner */}
            {isOffline && (
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-status-processing-bg px-4 py-2 text-sm text-status-processing-fg border-b border-status-processing-border">
                <WifiOff size={14} />
                <span>{t('status.offlineBanner')}</span>
              </div>
            )}
            {hasNewerLocal && (
              <div className="sticky top-0 z-10 flex items-center justify-between bg-primary/30 px-4 py-2 text-sm text-primary border-b border-primary/30">
                <div className="flex items-center gap-2">
                  <RotateCcw size={14} />
                  <span>{t('status.localCacheFound')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={restoreFromLocal}
                    className="rounded bg-primary/60 px-2 py-0.5 text-sm hover:bg-primary/80 transition-colors"
                  >
                    {t('status.restore')}
                  </button>
                  <button
                    type="button"
                    onClick={dismissLocalRestore}
                    className="text-primary/60 hover:text-primary transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
            {/* Paste Hint Bar */}
            <PasteHintBar
              visible={showHint}
              analysis={analysis}
              onApply={applyFormatting}
              onDismiss={dismissHint}
            />
            <div
              className={`script-editor script-editor-content mx-auto px-8 py-10 ${
                viewMode === 'focus' ? 'max-w-[860px]' : 'max-w-[720px]'
              }`}
              data-format={currentFormat}
              data-rendering={currentRendering}
              data-empty={isReady && isEditorEmpty ? 'true' : 'false'}
            >
              {isReady && !documentLoading ? (
                <EditorContent
                  editor={editor}
                  className={`prose prose-invert max-w-none focus:outline-none min-h-[60vh] ${
                    isReadOnly ? 'pointer-events-none opacity-90' : ''
                  }`}
                />
              ) : (
                <div className="flex items-center justify-center h-40 text-text-muted text-sm">
                  {t('shell.loading')}
                </div>
              )}
            </div>
          </main>
        )}

        {/* Right Sidebar - Panel */}
        {!hideAllSidebars && (showRight || mode === 'embedded') && (
          <aside className="w-[320px] shrink-0 border-l border-foreground/10 bg-foreground/[0.02] backdrop-blur-xl overflow-hidden">
            <RightPanelContainer
              editor={editor}
              mode={mode}
              projectId={projectId}
              onEnterPipeline={handleEnterPipeline}
            />
          </aside>
        )}
      </div>

      {/* Status Bar */}
      {!hideAllSidebars && showToolbar && (
        <div className="flex h-8 shrink-0 items-center gap-4 border-t border-foreground/10 px-4 text-sm text-text-muted">
          <span>{t('status.wordCount', { count: wordCount })}</span>
          <span className="text-foreground/20">|</span>
          <span>
            {t('status.sceneCount', { count: derivedScenes.length })}
            {foldingEnabled && (
              <span className="ml-1 text-text-muted/60">
                ({isAllExpanded ? t('status.allExpanded') : t('status.smartFolding')})
              </span>
            )}
          </span>
          <span className="text-foreground/20">|</span>
          <span>
            {isOffline
              ? t('status.offlineShort')
              : isDirty
                ? t('status.unsavedDot')
                : lastSavedAt
                  ? t('status.savedAt', { time: lastSavedAt.toLocaleTimeString() })
                  : t('status.ready')}
          </span>
          <span className="text-foreground/20">|</span>
          <ContinuityIndicator report={continuityReport} />
          <span className="ml-auto text-text-muted/60">
            {{
              hollywood: t('formats.hollywood'),
              chinese_film: t('formats.chinese_film'),
              chinese_short: t('formats.chinese_short'),
              japanese_anime: t('formats.japanese_anime'),
            }[currentFormat]} / {{
              latin: t('renderings.latin'),
              cjk_zh: t('renderings.cjk_zh'),
              cjk_ja: t('renderings.cjk_ja'),
            }[currentRendering]}
          </span>
        </div>
      )}

      {/* Shortcut Help Panel */}
      <ShortcutHelpPanel open={showShortcutHelp} onClose={closeShortcutHelp} />
      <ScriptEntityExtractionConfirm />
      <PipelineLinkDialog
        open={projectPickerOpen}
        onClose={() => {
          setProjectPickerOpen(false);
          if (!projectId) window.location.hash = '#/';
        }}
        onLink={handleProjectLink}
      />
    </div>
  );
}
