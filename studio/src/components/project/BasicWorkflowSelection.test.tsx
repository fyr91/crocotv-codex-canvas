import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const messages: Record<string, Record<string, string>> = {
      common: { recommended: '推荐' },
      project: {
        workflowMode: '工作流模式',
        workflowR2V: '基础流程',
        workflowR2VDesc: '基础流程说明',
        workflowComingSoon: '更多流程正在开发中',
        workflowComingSoonDesc: '敬请期待更多创作方式。',
      },
    };
    return messages[namespace]?.[key] ?? key;
  },
}));

vi.mock('lucide-react', () => ({
  Sparkles: () => <span aria-hidden="true" />,
  Zap: () => <span aria-hidden="true" />,
}));

import BasicWorkflowSelection from './BasicWorkflowSelection';

describe('BasicWorkflowSelection', () => {
  it('keeps the basic workflow selected and disables the coming-soon card', () => {
    render(<BasicWorkflowSelection />);

    expect(screen.getByRole('button', { name: /基础流程/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /更多流程正在开发中/ })).toBeDisabled();
  });
});
