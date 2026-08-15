import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EntityConfirmModal from './EntityConfirmModal';

describe('EntityConfirmModal', () => {
    const preview = {
        characters: [{ id: 'character-1', name: '未命名小女孩', description: '红色外套' }],
        scenes: [{ id: 'scene-1', name: '花园', description: '午后的花园' }],
        props: [
            { id: 'prop-1', name: '花园花井', description: '石砌花井' },
            { id: 'prop-2', name: '花园小径', description: '蜿蜒小径' },
        ],
    };

    it('passes inline edits and individual removals to confirmation', () => {
        const onConfirm = vi.fn();
        render(
            <EntityConfirmModal
                isOpen
                preview={preview}
                currentCounts={{ characters: 0, scenes: 0, props: 0 }}
                onConfirm={onConfirm}
                onDiscard={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '编辑实体名称: 未命名小女孩' }));
        const input = screen.getByRole('textbox', { name: '编辑实体名称: 未命名小女孩' });
        fireEvent.change(input, { target: { value: '安安' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        fireEvent.click(screen.getByRole('button', { name: '移除此实体: 花园花井' }));
        fireEvent.click(screen.getByRole('button', { name: '应用到素材' }));

        expect(onConfirm).toHaveBeenCalledWith({
            characters: [{ id: 'character-1', name: '安安', description: '红色外套' }],
            scenes: [{ id: 'scene-1', name: '花园', description: '午后的花园' }],
            props: [{ id: 'prop-2', name: '花园小径', description: '蜿蜒小径' }],
        });
        expect(screen.getAllByText('0 → 1')).toHaveLength(3);
    });

    it('reverts empty and escaped edits, and discards without mutating the source preview', () => {
        const onDiscard = vi.fn();
        render(
            <EntityConfirmModal
                isOpen
                preview={preview}
                currentCounts={{ characters: 0, scenes: 0, props: 0 }}
                onConfirm={() => {}}
                onDiscard={onDiscard}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '编辑实体名称: 花园' }));
        const input = screen.getByRole('textbox', { name: '编辑实体名称: 花园' });
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByRole('button', { name: '编辑实体名称: 花园' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '编辑实体名称: 花园' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '临时名称' } });
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
        expect(screen.getByRole('button', { name: '编辑实体名称: 花园' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '放弃' }));
        expect(onDiscard).toHaveBeenCalledOnce();
        expect(preview.scenes[0].name).toBe('花园');
    });

    it('commits the active inline edit when confirm is clicked', () => {
        const onConfirm = vi.fn();
        render(
            <EntityConfirmModal
                isOpen
                preview={preview}
                currentCounts={{ characters: 0, scenes: 0, props: 0 }}
                onConfirm={onConfirm}
                onDiscard={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '编辑实体名称: 花园' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '秘密花园' } });
        fireEvent.click(screen.getByRole('button', { name: '应用到素材' }));

        expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
            scenes: [{ id: 'scene-1', name: '秘密花园', description: '午后的花园' }],
        }));
    });
});
