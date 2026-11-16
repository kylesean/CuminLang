import useSetting from '@/frontend/features/settings/settingsStore';
import { DARK_ONLY_THEME_SLUGS, THEME_SLUG_BY_FAMILY } from '@/frontend/app/themeFamilies';
import { useHotkeys } from 'react-hotkeys-hook';

/**
 * 规范化快捷键字符串，去除空白与空项。
 */
const process = (values: string) => values
    .split(',')
    .map((k) => k.replaceAll(' ', ''))
    .filter((k) => k !== '');

/**
 * 注册全局快捷键（当前仅包含主题切换）。
 */
export default function GlobalShortCut() {
    const nextThemeShortcut = useSetting((s) => s.values.get('shortcut.nextTheme') ?? '');
    const theme = useSetting((s) => s.values.get('appearance.theme') ?? '');
    const themeFamily = useSetting((s) => s.values.get('appearance.themeFamily')) || 'neutral';
    const setSetting = useSetting((s) => s.setSetting);

    useHotkeys(process(nextThemeShortcut), () => {
        const slug = THEME_SLUG_BY_FAMILY[themeFamily as keyof typeof THEME_SLUG_BY_FAMILY] ?? 'dp-neutral';
        if (DARK_ONLY_THEME_SLUGS.has(slug)) {
            // 深色专属主题无法切浅色；顺滑切换回中性浅色并设为 light
            void setSetting('appearance.themeFamily', 'neutral');
            void setSetting('appearance.theme', 'light');
            return;
        }
        const effectiveDark = theme === 'dark'
            || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        void setSetting('appearance.theme', effectiveDark ? 'light' : 'dark');
    }, {
        ignoreEventWhen: () => typeof document !== 'undefined' && Boolean(document.querySelector('[data-shortcut-recorder="true"]')),
    }, [theme, themeFamily, setSetting]);
    return <></>;
}
