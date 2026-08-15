import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    'mode.categoryLabel': '生成类型',
    'mode.image': '图像生成',
    'mode.video': '视频生成',
    'mode.t2i': '文生图',
    'mode.i2i': '图生图',
    'mode.t2v': '文生',
    'mode.i2v': '图生',
    'mode.r2v': '参考生',
    'mode.v2v': '编辑',
  }[key] ?? key),
}));

vi.mock('lucide-react', () => ({
  Image: () => <span aria-hidden="true" />,
  Video: () => <span aria-hidden="true" />,
}));

import ModeSelector from './ModeSelector';
import { usePlaygroundStore } from './usePlaygroundStore';

describe('ModeSelector', () => {
  beforeEach(() => {
    usePlaygroundStore.setState({ mode: 't2i', modelId: '', modelPreferences: {} });
  });

  it('shows only the submodes for the selected generation category', () => {
    render(<ModeSelector />);

    expect(screen.getByRole('tab', { name: '图像生成' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '文生图' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '图生图' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '文生' })).not.toBeInTheDocument();
  });

  it('switches to the video tab and selects text-to-video by default', () => {
    render(<ModeSelector />);

    fireEvent.click(screen.getByRole('tab', { name: '视频生成' }));

    expect(usePlaygroundStore.getState().mode).toBe('t2v');
    expect(screen.getByRole('tab', { name: '视频生成' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '文生' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: '文生图' })).not.toBeInTheDocument();
  });

  it('returns to text-to-image when changing back to image generation', () => {
    usePlaygroundStore.setState({ mode: 'r2v' });
    render(<ModeSelector />);

    fireEvent.click(screen.getByRole('tab', { name: '图像生成' }));

    expect(usePlaygroundStore.getState().mode).toBe('t2i');
  });
});
