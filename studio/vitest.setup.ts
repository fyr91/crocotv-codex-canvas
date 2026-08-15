import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import zhMessages from './messages/zh.json';

vi.mock('next-intl', () => ({
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
    useLocale: () => 'zh',
    useTranslations: (namespace?: string) => {
        const root = namespace
            ? namespace.split('.').reduce<unknown>((value, part) => (
                value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
            ), zhMessages)
            : zhMessages;
        return (key: string, values?: Record<string, string | number>) => {
            const value = key.split('.').reduce<unknown>((current, part) => (
                current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined
            ), root);
            const template = typeof value === 'string' ? value : key;
            return Object.entries(values || {}).reduce(
                (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
                template,
            );
        };
    },
}));

const localValues = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key: string) => localValues.get(key) ?? null,
        setItem: (key: string, value: string) => localValues.set(key, value),
        removeItem: (key: string) => localValues.delete(key),
        clear: () => localValues.clear(),
    },
});

afterEach(() => {
    cleanup();
    localValues.clear();
});
