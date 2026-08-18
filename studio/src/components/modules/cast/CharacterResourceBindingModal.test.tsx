import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { useProjectStore } from '@/store/projectStore';
import CharacterResourceBindingModal from './CharacterResourceBindingModal';

const character = {
  id: 'character-1',
  name: '小林',
  description: '小鹿老师',
  system_character_id: 'system-xiaolin',
  reference_image_resource_id: 'xiaolin-image',
};

describe('CharacterResourceBindingModal portal', () => {
  beforeEach(() => {
    useProjectStore.setState({
      currentProject: {
        id: 'project-1',
        title: '测试项目',
        originalText: '小林进入森林。',
        characters: [character],
        scenes: [],
        props: [],
        frames: [],
        status: 'draft',
        createdAt: '',
        updatedAt: '',
      } as any,
    });
    vi.spyOn(api, 'listPulledCharacters').mockResolvedValue([]);
    vi.spyOn(api, 'listLocalResources').mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders outside a transformed or clipped sidebar container', () => {
    const { container } = render(
      <div data-testid="sidebar">
        <CharacterResourceBindingModal character={character} onClose={() => {}} />
      </div>,
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('绑定「小林」的角色素材')).toBeInTheDocument();
  });
});
