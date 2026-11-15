import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fileBrowserApi } from '@/frontend/features/file-browser/fileBrowserApi';
import usePracticePanel from '@/frontend/features/practice/practiceStore';
import {
    getRouteModuleId,
    resolveRouteModuleLabel,
    useNavigationHistoryStore,
    type NavigationHistoryEntry,
} from '@/frontend/app/stores/navigationHistoryStore';

function stripLearningSuffix(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, '');
    if (trimmed.endsWith('/learn')) {
        return trimmed.slice(0, -'/learn'.length) || '/';
    }
    return trimmed || '/';
}

function safeChangeWindowSize(target: 'home' | 'player'): void {
    try {
        void Promise.resolve(fileBrowserApi.changeWindowSize(target)).catch(() => undefined);
    } catch {
        // 单元测试等无 electron bridge 环境忽略
    }
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tag = target.tagName;
    return (
        tag === 'INPUT'
        || tag === 'TEXTAREA'
        || tag === 'SELECT'
        || target.isContentEditable
    );
}

/**
 * 在 Router 上下文内提供统一的跨模块后退/前进能力与当前页返回状态。
 */
export function useAppHistoryNavigation() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t: tNav } = useTranslation('nav');
    const { t: tSettings } = useTranslation('settings');

    const entries = useNavigationHistoryStore((s) => s.entries);
    const index = useNavigationHistoryStore((s) => s.index);

    const canGoBack = index > 0;
    const canGoForward = index >= 0 && index < entries.length - 1;
    const previousEntry: NavigationHistoryEntry | null = canGoBack ? entries[index - 1] ?? null : null;
    const nextEntry: NavigationHistoryEntry | null = canGoForward ? entries[index + 1] ?? null : null;

    const currentModule = getRouteModuleId(location.pathname);
    const isLearning = currentModule === 'learning';
    const isPlayer = currentModule === 'player' || isLearning;

    const previousLabel = previousEntry
        ? resolveRouteModuleLabel(previousEntry, tNav, tSettings)
        : null;
    const nextLabel = nextEntry
        ? resolveRouteModuleLabel(nextEntry, tNav, tSettings)
        : null;

    const backTooltip = previousLabel
        ? tNav('backToTarget', { target: previousLabel, defaultValue: `返回${previousLabel}` })
        : isLearning
            ? tNav('backToTarget', {
                target: tNav('playbackLab', { defaultValue: '沉浸式播放' }),
                defaultValue: '返回沉浸式播放',
            })
            : isPlayer
                ? tNav('backToLibrary', { defaultValue: '返回媒体库' })
                : tNav('backAction', { defaultValue: '返回上一页' });

    const forwardTooltip = nextLabel
        ? tNav('forwardToTarget', { target: nextLabel, defaultValue: `前进到${nextLabel}` })
        : tNav('forwardAction', { defaultValue: '前进' });

    const goBack = useCallback(() => {
        if (canGoBack) {
            if (previousEntry && getRouteModuleId(previousEntry.pathname) === 'home') {
                safeChangeWindowSize('home');
            }
            navigate(-1);
            return;
        }
        if (isLearning) {
            const playerPath = stripLearningSuffix(location.pathname);
            navigate(`${playerPath}${location.search}`);
            return;
        }
        if (isPlayer) {
            safeChangeWindowSize('home');
            navigate('/');
        }
    }, [canGoBack, isLearning, isPlayer, location.pathname, location.search, navigate, previousEntry]);

    const goForward = useCallback(() => {
        if (!canGoForward) {
            return;
        }
        if (nextEntry) {
            const nextMod = getRouteModuleId(nextEntry.pathname);
            if (nextMod === 'home') {
                safeChangeWindowSize('home');
            } else if (nextMod === 'player' || nextMod === 'learning') {
                safeChangeWindowSize('player');
            }
        }
        navigate(1);
    }, [canGoForward, navigate, nextEntry]);

    return {
        canGoBack,
        canGoForward,
        isPlayer,
        previousEntry,
        nextEntry,
        previousLabel,
        nextLabel,
        backTooltip,
        forwardTooltip,
        goBack,
        goForward,
    };
}

/**
 * 挂载在 HashRouter 内的全局导航监听器：
 * 1. 同步维护跨模块历史栈（用于展示目标模块名与前进/后退可用态）；
 * 2. 响应桌面通用返回/前进键位（Alt+←/→、macOS Cmd+[/]、鼠标侧键 Back/Forward）。
 */
export const NavigationHistoryTracker = () => {
    const location = useLocation();
    const navigationType = useNavigationType();
    const recordNavigation = useNavigationHistoryStore((s) => s.recordNavigation);
    const { canGoBack, canGoForward, goBack, goForward } = useAppHistoryNavigation();

    useEffect(() => {
        const entry: NavigationHistoryEntry = {
            key: location.key || 'default',
            pathname: location.pathname,
            search: location.search,
            fullPath: `${location.pathname}${location.search}`,
        };
        recordNavigation(navigationType, entry);
    }, [location.key, location.pathname, location.search, navigationType, recordNavigation]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) {
                return;
            }
            if (usePracticePanel.getState().recorderPhase === 'recording') {
                return;
            }
            const isAltBack = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowLeft';
            const isAltForward = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowRight';
            const isMacBack = event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === '[';
            const isMacForward = event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === ']';

            if ((isAltBack || isMacBack) && canGoBack) {
                event.preventDefault();
                goBack();
            } else if ((isAltForward || isMacForward) && canGoForward) {
                event.preventDefault();
                goForward();
            }
        };

        const handleMouseUp = (event: MouseEvent) => {
            if (usePracticePanel.getState().recorderPhase === 'recording') {
                return;
            }
            if (event.button === 3 && canGoBack) {
                event.preventDefault();
                goBack();
            } else if (event.button === 4 && canGoForward) {
                event.preventDefault();
                goForward();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [canGoBack, canGoForward, goBack, goForward]);

    return null;
};
