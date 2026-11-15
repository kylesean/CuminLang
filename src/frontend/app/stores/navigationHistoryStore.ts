import type { TFunction } from 'i18next';
import { create } from 'zustand';

/** 最大历史记录条数，避免长时间运行无限增长。 */
const MAX_HISTORY_ENTRIES = 50;

/** 支持识别的设置中心子分区键名。 */
const SETTINGS_SECTION_KEYS = new Set([
    'shortcut',
    'appearance',
    'resources',
    'storage',
    'proxy',
    'mobile',
    'import',
    'about',
]);

/** 应用路由导航类型（对应 react-router NavigationType）。 */
export type NavigationRecordType = 'PUSH' | 'POP' | 'REPLACE';

/** 单条历史记录快照。 */
export interface NavigationHistoryEntry {
    key: string;
    pathname: string;
    search: string;
    fullPath: string;
}

/** 顶层功能模块标识，用于判定跨模块跳转。 */
export type RouteModuleId =
    | 'home'
    | 'player'
    | 'learning'
    | 'reader'
    | 'context-studio'
    | 'settings'
    | 'other';

/**
 * 根据 pathname 归一化所属顶层模块。
 */
export function getRouteModuleId(pathname: string): RouteModuleId {
    const normalized = pathname.replace(/\/+$/, '') || '/';
    if (normalized === '/' || normalized === '/home') {
        return 'home';
    }
    if (normalized.startsWith('/player')) {
        return normalized.endsWith('/learn') ? 'learning' : 'player';
    }
    if (normalized.startsWith('/reader')) {
        return 'reader';
    }
    if (normalized.startsWith('/context-studio') || normalized.startsWith('/vocabulary')) {
        return 'context-studio';
    }
    if (normalized.startsWith('/settings') || normalized === '/about') {
        return 'settings';
    }
    return 'other';
}

/**
 * 将历史条目解析为用户可读的模块/页面名称，用于「返回{{target}}」与「前进到{{target}}」。
 */
export function resolveRouteModuleLabel(
    entry: Pick<NavigationHistoryEntry, 'pathname' | 'search'>,
    tNav: TFunction<'nav'>,
    tSettings: TFunction<'settings'>,
): string {
    const moduleId = getRouteModuleId(entry.pathname);
    switch (moduleId) {
        case 'home':
            return tNav('mediaLibrary', { defaultValue: '媒体库' });
        case 'learning':
            return tNav('sentenceLearning', { defaultValue: '整句精读' });
        case 'player':
            return tNav('playbackLab', { defaultValue: '沉浸式播放' });
        case 'reader':
            return tNav('scriptReader', { defaultValue: '精读文稿' });
        case 'context-studio': {
            const view = new URLSearchParams(entry.search).get('view');
            if (view === 'review') {
                return tNav('contextStudioReview', { defaultValue: '今日训练' });
            }
            if (view === 'memory' || view === 'map') {
                return tNav('contextStudioMemory', { defaultValue: '记忆全景' });
            }
            return tNav('vocabularyStudio', { defaultValue: '语境工坊' });
        }
        case 'settings': {
            const segments = entry.pathname.split('/').filter(Boolean);
            const section = segments[1];
            if (section && SETTINGS_SECTION_KEYS.has(section)) {
                return tSettings(`sections.${section}`, {
                    defaultValue: tNav('settingsCenter', { defaultValue: '设置中心' }),
                });
            }
            return tNav('settingsCenter', { defaultValue: '设置中心' });
        }
        default:
            return tNav('previousPage', { defaultValue: '上一页' });
    }
}

interface NavigationHistoryState {
    entries: NavigationHistoryEntry[];
    index: number;
    recordNavigation: (navType: NavigationRecordType, entry: NavigationHistoryEntry) => void;
    reset: () => void;
}

function clampHistory(entries: NavigationHistoryEntry[], index: number): {
    entries: NavigationHistoryEntry[];
    index: number;
} {
    if (entries.length <= MAX_HISTORY_ENTRIES) {
        return { entries, index };
    }
    const overflow = entries.length - MAX_HISTORY_ENTRIES;
    return {
        entries: entries.slice(overflow),
        index: Math.max(0, index - overflow),
    };
}

/**
 * 全局路由导航历史栈：跨模块跳入后支持在标题栏与页头一键精确返回上一页及参数上下文。
 */
export const useNavigationHistoryStore = create<NavigationHistoryState>((set) => ({
    entries: [],
    index: -1,
    recordNavigation: (navType, entry) => {
        set((state) => {
            const { entries, index } = state;
            if (entries.length === 0 || index < 0) {
                return { entries: [entry], index: 0 };
            }

            const current = entries[index];
            if (navType === 'REPLACE') {
                const nextEntries = entries.slice();
                nextEntries[index] = entry;
                return { entries: nextEntries, index };
            }

            if (navType === 'POP') {
                const keyMatchIndex = entries.findIndex((item) => item.key === entry.key);
                if (keyMatchIndex >= 0) {
                    const nextEntries = entries.slice();
                    nextEntries[keyMatchIndex] = entry;
                    return { entries: nextEntries, index: keyMatchIndex };
                }
                for (let offset = 1; offset < entries.length; offset += 1) {
                    const backIdx = index - offset;
                    if (backIdx >= 0 && entries[backIdx].fullPath === entry.fullPath) {
                        const nextEntries = entries.slice();
                        nextEntries[backIdx] = entry;
                        return { entries: nextEntries, index: backIdx };
                    }
                    const fwdIdx = index + offset;
                    if (fwdIdx < entries.length && entries[fwdIdx].fullPath === entry.fullPath) {
                        const nextEntries = entries.slice();
                        nextEntries[fwdIdx] = entry;
                        return { entries: nextEntries, index: fwdIdx };
                    }
                }
                const appended = clampHistory([...entries.slice(0, index + 1), entry], index + 1);
                return appended;
            }

            // PUSH
            if (current && current.key === entry.key && current.fullPath === entry.fullPath) {
                return state;
            }
            if (current && current.fullPath === entry.fullPath) {
                const nextEntries = entries.slice();
                nextEntries[index] = entry;
                return { entries: nextEntries, index };
            }
            const sliced = entries.slice(0, index + 1);
            return clampHistory([...sliced, entry], sliced.length);
        });
    },
    reset: () => set({ entries: [], index: -1 }),
}));
