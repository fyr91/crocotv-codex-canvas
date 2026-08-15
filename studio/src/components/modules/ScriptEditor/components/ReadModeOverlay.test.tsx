import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReadModeOverlay from './ReadModeOverlay';

describe('ReadModeOverlay', () => {
  it('keeps an exit control visible and exits reading mode', () => {
    const onExit = vi.fn();
    render(<ReadModeOverlay isEmpty={false} onExit={onExit} />);

    fireEvent.click(screen.getByRole('button', { name: '退出阅读' }));

    expect(onExit).toHaveBeenCalledOnce();
  });

  it('shows a useful empty state instead of a blank screen', () => {
    render(<ReadModeOverlay isEmpty onExit={() => {}} />);

    expect(screen.getByText('暂无剧本内容')).toBeInTheDocument();
    expect(screen.getByText('返回编辑模式开始写作。')).toBeInTheDocument();
  });
});
