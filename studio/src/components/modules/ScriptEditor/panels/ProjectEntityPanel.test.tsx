import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/projectStore';
import ProjectEntityPanel from './ProjectEntityPanel';

vi.mock('../../cast/CharacterResourceBindingModal', () => ({
  default: ({ character }: { character: { name: string } | null }) => character
    ? <div role="dialog" aria-label={`绑定 ${character.name}`} />
    : null,
}));

const project = {
  id: 'project-1',
  title: '测试项目',
  originalText: '小林进入森林。',
  characters: [{ id: 'character-1', name: '小林', description: '小鹿', image_url: '/files/by-id/xiaolin-image' }],
  scenes: [{ id: 'scene-1', name: '森林', description: '黄昏' }],
  props: [],
  frames: [],
  status: 'draft',
  createdAt: '',
  updatedAt: '',
};

describe('ProjectEntityPanel character binding', () => {
  beforeEach(() => {
    useProjectStore.setState({ currentProject: project as any, projects: [project as any] });
  });

  it('opens the same character resource binding flow from an existing script entity', () => {
    render(
      <ProjectEntityPanel
        kind="character"
        suggestions={[]}
        icon={<span />}
        emptyTitle="空"
        emptyHint="空"
        countLabel={(count) => `角色 (${count})`}
      />,
    );

    expect(screen.getByRole('img', { name: '小林' })).toHaveAttribute('src', '/files/by-id/xiaolin-image');
    fireEvent.click(screen.getAllByRole('button', { name: '绑定角色素材' })[0]);
    expect(screen.getByRole('dialog', { name: '绑定 小林' })).toBeInTheDocument();
  });

  it('does not add character binding controls to scene entities', () => {
    render(
      <ProjectEntityPanel
        kind="scene"
        suggestions={[]}
        icon={<span />}
        emptyTitle="空"
        emptyHint="空"
        countLabel={(count) => `场景 (${count})`}
      />,
    );

    expect(screen.queryByRole('button', { name: '绑定角色素材' })).not.toBeInTheDocument();
  });
});
