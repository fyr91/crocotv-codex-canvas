import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FocusModeExitButton from './FocusModeExitButton';

describe('FocusModeExitButton', () => {
  it('provides a visible control for leaving focus mode', () => {
    const onExit = vi.fn();
    render(<FocusModeExitButton onExit={onExit} />);

    fireEvent.click(screen.getByRole('button', { name: '退出全屏编辑' }));

    expect(onExit).toHaveBeenCalledOnce();
  });
});
