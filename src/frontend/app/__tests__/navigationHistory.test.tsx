import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import i18n from '@/frontend/i18n';
import {
    getRouteModuleId,
    useNavigationHistoryStore,
} from '@/frontend/app/stores/navigationHistoryStore';
import { NavigationHistoryTracker } from '@/frontend/app/hooks/useAppHistoryNavigation';
import { TitleBarNavigation } from '@/frontend/components/layout/TitleBar/TitleBarNavigation';
import PageHeader from '@/frontend/components/shared/common/PageHeader';
import SettingsPageShell from '@/frontend/features/settings/components/form/SettingsPageShell';
import usePracticePanel from '@/frontend/features/practice/practiceStore';
import { fileBrowserApi } from '@/frontend/features/file-browser/fileBrowserApi';

vi.mock('@/frontend/features/file-browser/fileBrowserApi', () => ({
    fileBrowserApi: {
        changeWindowSize: vi.fn().mockResolvedValue(undefined),
    },
}));

function LocationDisplay() {
    const location = useLocation();
    return <div data-testid="current-location">{`${location.pathname}${location.search}`}</div>;
}

function TestRoutesHarness() {
    const navigate = useNavigate();

    return (
        <>
            <NavigationHistoryTracker />
            <TitleBarNavigation />
            <LocationDisplay />
            <Routes>
                <Route
                    path="/"
                    element={(
                        <div>
                            <button type="button" onClick={() => navigate('/player/vid-1')}>
                                go-player
                            </button>
                            <button type="button" onClick={() => navigate('/reader/vid-1')}>
                                go-reader
                            </button>
                        </div>
                    )}
                />
                <Route
                    path="/player/:videoId/*"
                    element={(
                        <div>
                            <button type="button" onClick={() => navigate('/context-studio?view=review')}>
                                open-review
                            </button>
                            <button type="button" onClick={() => navigate('/settings/appearance')}>
                                open-settings
                            </button>
                        </div>
                    )}
                />
                <Route
                    path="/context-studio"
                    element={(
                        <div>
                            <PageHeader title="语境工坊" />
                            <button
                                type="button"
                                onClick={() => navigate('/reader/vid-1?sentence=20')}
                            >
                                open-reader
                            </button>
                        </div>
                    )}
                />
                <Route
                    path="/reader/:videoId"
                    element={(
                        <div>
                            <PageHeader title="精读文稿" />
                            <button
                                type="button"
                                onClick={() => navigate('/player/vid-1?t=30')}
                            >
                                open-player-from-reader
                            </button>
                        </div>
                    )}
                />
                <Route
                    path="/settings/appearance"
                    element={(
                        <div>
                            <SettingsPageShell title="外观">
                                <button type="button" onClick={() => navigate('/settings/shortcut')}>
                                    nav-shortcut
                                </button>
                                <button type="button" onClick={() => navigate('/settings/resources?tab=cloud')}>
                                    nav-resources
                                </button>
                            </SettingsPageShell>
                        </div>
                    )}
                />
                <Route
                    path="/settings/shortcut"
                    element={<SettingsPageShell title="快捷键"><div /></SettingsPageShell>}
                />
                <Route
                    path="/settings/resources"
                    element={(
                        <SettingsPageShell title="服务与资源">
                            <button type="button" onClick={() => navigate('/settings/proxy')}>
                                nav-proxy
                            </button>
                        </SettingsPageShell>
                    )}
                />
                <Route
                    path="/settings/proxy"
                    element={<SettingsPageShell title="网络代理"><div /></SettingsPageShell>}
                />
            </Routes>
        </>
    );
}

describe('Cross-module navigation history', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('zh-CN');
    });

    beforeEach(() => {
        vi.clearAllMocks();
        useNavigationHistoryStore.getState().reset();
        usePracticePanel.setState({ recorderPhase: 'idle' });
    });

    it.each([
        ['/', 'home'],
        ['/home', 'home'],
        ['/player/v1', 'player'],
        ['/player/v1/learn', 'learning'],
        ['/reader/v1', 'reader'],
        ['/context-studio', 'context-studio'],
        ['/vocabulary', 'context-studio'],
        ['/settings/proxy', 'settings'],
    ] as const)('getRouteModuleId(%s) === %s', (pathname, expected) => {
        expect(getRouteModuleId(pathname)).toBe(expected);
    });

    it('supports Reader -> Player -> Back to Reader and Forward back to Player', () => {
        render(
            <MemoryRouter initialEntries={['/reader/vid-1']}>
                <TestRoutesHarness />
            </MemoryRouter>,
        );

        expect(screen.queryByTestId('title-bar-back')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'open-player-from-reader' }));
        expect(screen.getByTestId('current-location').textContent).toBe('/player/vid-1?t=30');

        const backBtn = screen.getByTestId('title-bar-back');
        expect(backBtn.getAttribute('aria-label')).toBe('返回精读文稿');
        fireEvent.click(backBtn);

        expect(screen.getByTestId('current-location').textContent).toBe('/reader/vid-1');
        expect(fileBrowserApi.changeWindowSize).not.toHaveBeenCalledWith('home');

        const forwardBtn = screen.getByTestId('title-bar-forward');
        expect(forwardBtn.getAttribute('aria-label')).toBe('前进到沉浸式播放');
        fireEvent.click(forwardBtn);

        expect(screen.getByTestId('current-location').textContent).toBe('/player/vid-1?t=30');
    });

    it('falls back to media library on cold Player launch and back to player on cold /learn deep link', () => {
        const playerRender = render(
            <MemoryRouter initialEntries={['/player/vid-1']}>
                <TestRoutesHarness />
            </MemoryRouter>,
        );

        const backBtn = screen.getByTestId('title-bar-back');
        expect(backBtn.getAttribute('aria-label')).toBe('返回媒体库');
        fireEvent.click(backBtn);

        expect(fileBrowserApi.changeWindowSize).toHaveBeenCalledWith('home');
        expect(screen.getByTestId('current-location').textContent).toBe('/');
        playerRender.unmount();

        useNavigationHistoryStore.getState().reset();
        render(
            <MemoryRouter initialEntries={['/player/vid-1/learn?t=12']}>
                <TestRoutesHarness />
            </MemoryRouter>,
        );

        const learnBackBtn = screen.getByTestId('title-bar-back');
        expect(learnBackBtn.getAttribute('aria-label')).toBe('返回沉浸式播放');
        fireEvent.click(learnBackBtn);
        expect(screen.getByTestId('current-location').textContent).toBe('/player/vid-1?t=12');
    });

    it('preserves ContextStudio query context across Reader round-trips via TitleBar without duplicate inline back buttons', () => {
        render(
            <MemoryRouter initialEntries={['/context-studio?sentenceKey=h1:20&filter=sentences']}>
                <TestRoutesHarness />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'open-reader' }));
        expect(screen.getByTestId('current-location').textContent).toBe('/reader/vid-1?sentence=20');
        expect(screen.queryByTestId('module-inline-back')).toBeNull();

        const titleBack = screen.getByTestId('title-bar-back');
        expect(titleBack.getAttribute('aria-label')).toBe('返回语境工坊');
        fireEvent.click(titleBack);

        expect(screen.getByTestId('current-location').textContent).toBe('/context-studio?sentenceKey=h1:20&filter=sentences');
    });

    it('supports unified TitleBar step-by-step back/forward across Player -> Settings -> Resources -> Proxy without duplicate shell back buttons', () => {
        render(
            <MemoryRouter initialEntries={['/player/vid-1']}>
                <TestRoutesHarness />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'open-settings' }));
        expect(screen.queryByTestId('module-inline-back')).toBeNull();
        expect(screen.getByTestId('title-bar-back').getAttribute('aria-label')).toBe('返回沉浸式播放');

        fireEvent.click(screen.getByRole('button', { name: 'nav-shortcut' }));
        expect(screen.queryByTestId('module-inline-back')).toBeNull();
        expect(screen.getByTestId('title-bar-back').getAttribute('aria-label')).toBe('返回外观');

        fireEvent.click(screen.getByTestId('title-bar-back'));
        expect(screen.getByTestId('current-location').textContent).toBe('/settings/appearance');

        fireEvent.click(screen.getByRole('button', { name: 'nav-resources' }));
        fireEvent.click(screen.getByRole('button', { name: 'nav-proxy' }));
        expect(screen.queryByTestId('module-inline-back')).toBeNull();
        expect(screen.getByTestId('title-bar-back').getAttribute('aria-label')).toBe('返回服务与资源');

        fireEvent.click(screen.getByTestId('title-bar-back'));
        expect(screen.getByTestId('current-location').textContent).toBe('/settings/resources?tab=cloud');
    });

    it('handles Alt+ArrowLeft/Right and mouse side-buttons while blocking them during active recording', () => {
        render(
            <MemoryRouter initialEntries={['/player/vid-1']}>
                <TestRoutesHarness />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'open-review' }));
        expect(screen.getByTestId('current-location').textContent).toBe('/context-studio?view=review');
        expect(screen.getByTestId('title-bar-back').getAttribute('aria-label')).toBe('返回沉浸式播放');

        // 录音进行中禁止快捷键与鼠标侧键切页
        usePracticePanel.setState({ recorderPhase: 'recording' });
        fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
        fireEvent.mouseUp(window, { button: 3 });
        expect(screen.getByTestId('current-location').textContent).toBe('/context-studio?view=review');

        // 结束录音后恢复桌面通用后退/前进
        usePracticePanel.setState({ recorderPhase: 'idle' });
        fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
        expect(screen.getByTestId('current-location').textContent).toBe('/player/vid-1');

        fireEvent.mouseUp(window, { button: 4 });
        expect(screen.getByTestId('current-location').textContent).toBe('/context-studio?view=review');
    });
});
