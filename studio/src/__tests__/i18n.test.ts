import { describe, it, expect } from 'vitest';
import { getMessages, SUPPORTED_LOCALES } from '@/lib/i18n';

describe('i18n configuration', () => {
    it('SUPPORTED_LOCALES contains zh and en', () => {
        expect(SUPPORTED_LOCALES).toContain('zh');
        expect(SUPPORTED_LOCALES).toContain('en');
        expect(SUPPORTED_LOCALES).toHaveLength(2);
    });

    it('getMessages returns messages for zh', () => {
        const messages = getMessages('zh');
        expect(messages).toBeDefined();
        expect(messages.common.save).toBe('保存');
        expect(messages.nav.workspace).toBe('工作区');
        expect(messages.settings.title).toBe('设置');
    });

    it('keeps primary Studio surfaces localized in zh', () => {
        const messages = getMessages('zh');
        expect(messages.workspace.eyebrow).toBe('工作区');
        expect(messages.library.eyebrow).toBe('资产库');
        expect(messages.vault.characters).toBe('角色');
        expect(messages.vault.loadingProject).toBe('加载项目中...');
        expect(messages.storyboard.framesLabel).toBe('帧');
        expect(messages.creator.noStoryboardFrames).toBe('暂无分镜帧。');
        expect(messages.playground.compose.promptLabel).toBe('提示词');
        expect(messages.settings.registryTitle).toBe('提示词版本库');
        expect(messages.pendingTask.diagnoseTitle).toBe('诊断卡住的任务');
    });

    it('getMessages returns messages for en', () => {
        const messages = getMessages('en');
        expect(messages).toBeDefined();
        expect(messages.common.save).toBe('Save');
        expect(messages.nav.workspace).toBe('Workspace');
        expect(messages.settings.title).toBe('Settings');
    });

    it('zh and en have identical key structure', () => {
        const zh = getMessages('zh');
        const en = getMessages('en');

        const getKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
            return Object.entries(obj).flatMap(([key, value]) => {
                const path = prefix ? `${prefix}.${key}` : key;
                if (typeof value === 'object' && value !== null) {
                    return getKeys(value as Record<string, unknown>, path);
                }
                return [path];
            });
        };

        const zhKeys = getKeys(zh).sort();
        const enKeys = getKeys(en).sort();
        expect(zhKeys).toEqual(enKeys);
    });

    it('getMessages falls back to zh for unknown locale', () => {
        // @ts-expect-error testing invalid input
        const messages = getMessages('fr');
        expect(messages.common.save).toBe('保存');
    });
});
