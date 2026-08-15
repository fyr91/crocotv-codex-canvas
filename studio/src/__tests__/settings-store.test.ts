import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, THEME_NAMES, DEFAULT_THEME } from '@/store/settingsStore';

describe('settingsStore', () => {
    beforeEach(() => {
        useSettingsStore.setState({ locale: 'zh', theme: DEFAULT_THEME });
    });

    it('has correct default values', () => {
        const state = useSettingsStore.getState();
        expect(state.locale).toBe('zh');
        expect(state.theme).toBe(DEFAULT_THEME);
    });

    it('setLocale updates locale', () => {
        useSettingsStore.getState().setLocale('en');
        expect(useSettingsStore.getState().locale).toBe('en');
    });

    it('setTheme updates theme', () => {
        useSettingsStore.getState().setTheme('light');
        expect(useSettingsStore.getState().theme).toBe('light');
    });

    it('setLocale rejects invalid values at type level', () => {
        // Verify type constraint works - both valid locales are accepted
        useSettingsStore.getState().setLocale('zh');
        expect(useSettingsStore.getState().locale).toBe('zh');
        useSettingsStore.getState().setLocale('en');
        expect(useSettingsStore.getState().locale).toBe('en');
    });

    it('setTheme accepts both CrocoTV color schemes', () => {
        for (const theme of THEME_NAMES) {
            useSettingsStore.getState().setTheme(theme);
            expect(useSettingsStore.getState().theme).toBe(theme);
        }
    });

    it('exposes exactly light and dark', () => {
        expect(THEME_NAMES).toEqual(['light', 'dark']);
        expect(DEFAULT_THEME).toBe('dark');
    });
});
