import React from 'react';
import type { AppearanceThemeFamily } from '@/common/contracts/appearance-setting-vo';
import { DARK_ONLY_THEME_SLUGS, THEME_SLUG_BY_FAMILY } from '@/frontend/app/themeFamilies';
import useSetting from '@/frontend/features/settings/settingsStore';

function subscribeRootThemeClass(callback: () => void): () => void {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
        return () => {};
    }
    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
    });
    return () => observer.disconnect();
}

function getRootDarkSnapshot(): boolean {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

/**
 * 响应当前生效外观是否为深色极性（兼容 system 模式与 Gothic 等纯深色主题家族）。
 */
export function useIsDarkTheme(): boolean {
    const theme = useSetting((s) => s.values.get('appearance.theme'));
    const themeFamily = useSetting((s) => s.values.get('appearance.themeFamily')) || 'neutral';
    const rootHasDarkClass = React.useSyncExternalStore(
        subscribeRootThemeClass,
        getRootDarkSnapshot,
        () => false,
    );

    const themeSlug = THEME_SLUG_BY_FAMILY[themeFamily as AppearanceThemeFamily] ?? 'dp-neutral';
    return DARK_ONLY_THEME_SLUGS.has(themeSlug)
        || theme === 'dark'
        || (theme !== 'light' && rootHasDarkClass);
}
