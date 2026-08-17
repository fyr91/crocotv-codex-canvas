import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createProject = vi.fn();
const setProjectId = vi.fn();
const projectState: {
  projects: Array<{ id: string; title: string; scenes: unknown[]; characters: unknown[] }>;
  currentProject: { id: string; title: string } | null;
  createProject: typeof createProject;
} = {
  projects: [],
  currentProject: null,
  createProject,
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const messages: Record<string, Record<string, string>> = {
      common: { recommended: '推荐' },
      project: {
        projectTitle: '项目标题',
        projectTitlePlaceholder: '输入项目标题...',
        workflowMode: '工作流模式',
        workflowR2V: '基础流程',
        workflowR2VDesc: '基础流程说明',
        workflowComingSoon: '正在开发中',
        workflowComingSoonDesc: '更多流程即将开放',
        scriptContent: '剧本内容',
        scriptPlaceholder: '输入剧本内容...',
      },
      scriptEditor: {
        'dialogs.pipeline.title': '关联管线项目',
        'dialogs.pipeline.linkExisting': '关联已有项目',
        'dialogs.pipeline.createNew': '创建新项目',
        'dialogs.pipeline.searchPlaceholder': '搜索项目...',
        'dialogs.pipeline.noProjects': '暂无可关联的项目',
        'dialogs.pipeline.createHint': '创建后自动进入该项目的剧本编辑器',
        'dialogs.pipeline.cancel': '取消',
        'dialogs.pipeline.createAndLink': '创建并关联',
      },
    };
    return messages[namespace]?.[key] ?? key;
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', () => ({
  X: () => <span aria-hidden="true" />,
  FolderPlus: () => <span aria-hidden="true" />,
  Link2: () => <span aria-hidden="true" />,
  Search: () => <span aria-hidden="true" />,
  Loader2: () => <span aria-hidden="true" />,
  Sparkles: () => <span aria-hidden="true" />,
  Zap: () => <span aria-hidden="true" />,
}));

vi.mock('@/store/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector: (state: typeof projectState) => unknown) => selector(projectState),
    { getState: () => projectState },
  ),
}));

vi.mock('@/store/editorStore', () => ({
  useEditorStore: (selector: (state: { setProjectId: typeof setProjectId }) => unknown) => selector({ setProjectId }),
}));

import PipelineLinkDialog from './PipelineLinkDialog';

describe('PipelineLinkDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = null;
    createProject.mockImplementation(async (title: string) => {
      projectState.currentProject = { id: 'created-project', title };
    });
  });

  it('uses the shared title and workflow flow without a script input', async () => {
    const onClose = vi.fn();
    const onLink = vi.fn();
    render(<PipelineLinkDialog open onClose={onClose} onLink={onLink} />);

    fireEvent.click(screen.getByRole('button', { name: '创建新项目' }));

    expect(screen.getByRole('textbox', { name: '项目标题' })).toBeInTheDocument();
    expect(screen.getByText('工作流模式')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /基础流程/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /正在开发中/ })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: '剧本内容' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '项目标题' }), { target: { value: '新的影片项目' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并关联' }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith('新的影片项目', '', true, 'r2v');
    });
    expect(setProjectId).toHaveBeenCalledWith('created-project');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onLink).toHaveBeenCalledWith('created-project');
  });
});
