import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ImageResourceSelect from './ImageResourceSelect';
import type { PulledCharacterResource } from '@/lib/pulledCharacterAssets';

const resources: PulledCharacterResource[] = [
  {
    id: 'avatar',
    name: '小林 · avatar.png',
    type: 'image',
    mimeType: 'image/png',
    size: 12,
    fileName: 'avatar.png',
    url: '/files/avatar.png',
    createdAt: '2026-08-17T00:00:00.000Z',
    source: 'character',
  },
  {
    id: 'full-body',
    name: '小林 · full-body-image.png',
    type: 'image',
    mimeType: 'image/png',
    size: 24,
    fileName: 'full-body-image.png',
    url: '/files/full-body-image.png',
    createdAt: '2026-08-17T00:00:00.000Z',
    source: 'character',
  },
];

describe('ImageResourceSelect', () => {
  it('shows thumbnails in the trigger and every dropdown option', () => {
    render(
      <ImageResourceSelect
        resources={resources}
        value="avatar"
        onChange={() => {}}
        placeholder="不选择"
        ariaLabel="主要参考图"
      />
    );

    const trigger = screen.getByRole('button', { name: '主要参考图' });
    expect(within(trigger).getByText('小林 · avatar.png')).toBeInTheDocument();
    expect(trigger.querySelector('img')).toHaveAttribute('src', '/files/avatar.png');

    fireEvent.click(trigger);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[1].querySelector('img')).toHaveAttribute('src', '/files/avatar.png');
    expect(options[2].querySelector('img')).toHaveAttribute('src', '/files/full-body-image.png');
  });

  it('supports mouse and keyboard selection', () => {
    const onChange = vi.fn();
    render(
      <ImageResourceSelect
        resources={resources}
        value="avatar"
        onChange={onChange}
        placeholder="不选择"
        ariaLabel="主要参考图"
      />
    );

    const trigger = screen.getByRole('button', { name: '主要参考图' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: '小林 · full-body-image.png' }));
    expect(onChange).toHaveBeenLastCalledWith('full-body');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('full-body');
  });
});
