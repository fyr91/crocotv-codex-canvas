import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Locale = 'zh' | 'en';

export type ThemeName = 'light' | 'dark';

export const THEME_NAMES: ThemeName[] = ['light', 'dark'];
export const DEFAULT_THEME: ThemeName = 'dark';

/** Kept only to clean up and migrate existing local installations. */
export const LEGACY_THEME_PRESETS = [
    'atelier-dark',
    'bridge-dark',
    'brand-dark',
    'atelier-light',
    'brand-light',
] as const;

interface SettingsStore {
    locale: Locale;
    theme: ThemeName;
    // 全局动效开关。true = 启用 motion（默认）；false = 降低动效，
    // 由 Providers 挂载 html.no-motion 类来落地（无障碍/性能偏好）。
    animations: boolean;
    setLocale: (locale: Locale) => void;
    setTheme: (theme: ThemeName) => void;
    setAnimations: (animations: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            locale: 'zh',
            theme: DEFAULT_THEME,
            animations: true,
            setLocale: (locale: Locale) => set({ locale }),
            setTheme: (theme: ThemeName) => set({ theme }),
            setAnimations: (animations: boolean) => set({ animations }),
        }),
        {
            name: 'lumenx-settings',
            version: 2,
            // v2 收敛为 CrocoTV 的 light/dark。旧亮色 preset 保持为亮色，
            // 其余旧 preset 保持为暗色，避免升级后突然反转用户界面。
            migrate: (persisted: unknown) => {
                const state = (persisted ?? {}) as Partial<SettingsStore>;
                const animations = typeof state.animations === 'boolean' ? state.animations : true;
                const previousTheme = state.theme as string | undefined;
                const theme: ThemeName = previousTheme === 'light'
                    || previousTheme === 'atelier-light'
                    || previousTheme === 'brand-light'
                    ? 'light'
                    : 'dark';
                return { ...state, theme, animations } as SettingsStore;
            },
        }
    )
);
