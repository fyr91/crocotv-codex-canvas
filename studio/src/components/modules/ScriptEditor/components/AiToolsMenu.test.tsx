import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiToolsMenu from './AiToolsMenu';

describe('AiToolsMenu', () => {
  it('shows the planned tools and only runs entity extraction', () => {
    const onExtractEntities = vi.fn();
    render(
      <AiToolsMenu
        extracting={false}
        onExtractEntities={onExtractEntities}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI 工具' }));

    expect(screen.getByText('提取实体')).toBeInTheDocument();
    expect(screen.getByText('拆分镜')).toBeInTheDocument();
    expect(screen.getByText('续写')).toBeInTheDocument();
    expect(screen.getByText('文本润色')).toBeInTheDocument();
    expect(screen.getByText('脚本生成')).toBeInTheDocument();
    expect(screen.getAllByText('即将推出')).toHaveLength(4);

    const extractionButton = screen.getByRole('menuitem', { name: '执行提取实体' });
    expect(extractionButton).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: '执行拆分镜' })).toBeDisabled();

    fireEvent.click(extractionButton);
    expect(onExtractEntities).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('disables extraction while the document cannot be analyzed', () => {
    render(
      <AiToolsMenu
        extracting={false}
        extractDisabled
        onExtractEntities={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI 工具' }));

    expect(screen.getByRole('menuitem', { name: '执行提取实体' })).toBeDisabled();
  });
});
