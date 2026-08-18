import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import EntityConfirmModal from './EntityConfirmModal';

describe('EntityConfirmModal matched character preview', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preselects an exact character match and confirms its image and voice resources', async () => {
    vi.spyOn(api, 'listPulledCharacters').mockResolvedValue([{
      id: 'system-xiaolin',
      name: 'Deer',
      chineseName: '小林',
      voiceId: 'S_xiaolin',
      avatarUrl: '/files/by-id/xiaolin-avatar',
    }]);
    vi.spyOn(api, 'listLocalResources').mockResolvedValue([
      {
        id: 'xiaolin-full-body',
        name: '小林全身图',
        type: 'image',
        mimeType: 'image/png',
        size: 100,
        fileName: 'full-body.png',
        url: '/files/by-id/xiaolin-full-body',
        createdAt: '2026-08-18T00:00:00.000Z',
        source: 'character',
        metadata: { characterId: 'system-xiaolin', assetKey: 'fullBodyImageUrl' },
      },
      {
        id: 'xiaolin-reference-audio',
        name: '小林参考声音',
        type: 'audio',
        mimeType: 'audio/mpeg',
        size: 100,
        fileName: 'voice.mp3',
        url: '/files/by-id/xiaolin-reference-audio',
        createdAt: '2026-08-18T00:00:00.000Z',
        source: 'character',
        metadata: { characterId: 'system-xiaolin' },
      },
    ]);
    const onConfirm = vi.fn();

    render(
      <EntityConfirmModal
        isOpen
        preview={{
          characters: [{ id: 'detected-xiaolin', name: '小林', description: '小鹿老师' }],
          scenes: [],
          props: [],
        }}
        currentCounts={{ characters: 0, scenes: 0, props: 0 }}
        onConfirm={onConfirm}
        onDiscard={() => {}}
      />,
    );

    expect(await screen.findByRole('img', { name: '小林' })).toHaveAttribute('src', '/files/by-id/xiaolin-full-body');
    fireEvent.click(screen.getByRole('button', { name: '应用到素材' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({
      characters: [{
        id: 'detected-xiaolin',
        name: '小林',
        description: '小鹿老师',
        system_character_id: 'system-xiaolin',
        reference_image_resource_id: 'xiaolin-full-body',
        voice_id: 'S_xiaolin',
        voice_reference_resource_id: 'xiaolin-reference-audio',
      }],
      scenes: [],
      props: [],
    }));
  });
});
