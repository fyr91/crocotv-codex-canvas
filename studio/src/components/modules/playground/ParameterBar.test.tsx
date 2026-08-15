import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import ParameterBar from './ParameterBar';
import { usePlaygroundStore } from './usePlaygroundStore';

describe('ParameterBar', () => {
  beforeEach(() => {
    usePlaygroundStore.setState({
      mode: 't2v',
      modelId: 'minimax-h3',
      parameters: {
        aspect_ratio: '16:9',
        resolution: 'preview',
        duration: 6,
      },
      batchSize: 1,
    });
  });

  it('uses the same 40px control height for dropdowns, duration, and pill groups', () => {
    render(<ParameterBar />);

    expect(screen.getByRole('button', { name: '16:9' })).toHaveClass('h-10', 'py-0');

    const durationInput = screen.getByRole('textbox', { name: '时长' });
    expect(durationInput).toHaveClass('h-full', '!min-h-0');
    expect(durationInput.parentElement?.parentElement).toHaveClass('h-10');

    const selectedBatch = screen.getByRole('button', { name: 'x1' });
    expect(selectedBatch).toHaveClass('h-full', '!min-h-0', 'py-0');
    expect(selectedBatch.parentElement).toHaveClass('h-10');
  });
});
