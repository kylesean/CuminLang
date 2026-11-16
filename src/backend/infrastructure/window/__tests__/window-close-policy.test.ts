import { describe, expect, it, vi } from 'vitest';

import {
    hideWindowToTray,
    isTilingWindowManager,
    shouldHideInsteadOfClose,
    shouldHideInsteadOfMinimize,
    showAndFocusWindow,
} from '@/backend/infrastructure/window/window-close-policy';

describe('window-close-policy 跨平台关闭与最小化策略', () => {
    it.each([
        ['linux', { HYPRLAND_INSTANCE_SIGNATURE: 'sig-1' }, true],
        ['linux', { SWAYSOCK: '/run/user/1000/sway-ipc.sock' }, true],
        ['linux', { XDG_CURRENT_DESKTOP: 'Hyprland' }, true],
        ['linux', { XDG_CURRENT_DESKTOP: 'GNOME' }, false],
        ['linux', { XDG_CURRENT_DESKTOP: 'KDE' }, false],
        ['win32', { HYPRLAND_INSTANCE_SIGNATURE: 'sig-1' }, false],
        ['darwin', { XDG_CURRENT_DESKTOP: 'Hyprland' }, false],
    ] as const)('平铺窗口管理器判定 (%s, %j) -> %s', (platform, env, expected) => {
        expect(isTilingWindowManager(env, platform)).toBe(expected);
    });

    it.each([
        [{ trayActive: true, isQuitting: false, recoveryMode: false }, true],
        [{ trayActive: false, isQuitting: false, recoveryMode: false }, false],
        [{ trayActive: true, isQuitting: true, recoveryMode: false }, false],
        [{ trayActive: true, isQuitting: false, recoveryMode: true }, false],
    ] as const)('关闭按钮拦截判定 %j -> %s', (input, expected) => {
        expect(shouldHideInsteadOfClose(input)).toBe(expected);
    });

    it.each([
        ['linux', { HYPRLAND_INSTANCE_SIGNATURE: 'omarchy' }, true, true],
        ['linux', { HYPRLAND_INSTANCE_SIGNATURE: 'omarchy' }, false, false],
        ['linux', { XDG_CURRENT_DESKTOP: 'GNOME' }, true, false],
        ['win32', {}, true, false],
        ['darwin', {}, true, false],
    ] as const)('最小化改退到托盘判定 (%s, tray=%s) -> %s', (platform, env, trayActive, expected) => {
        expect(shouldHideInsteadOfMinimize({ trayActive, env, platform })).toBe(expected);
    });

    it('非全屏窗口隐藏到托盘：Linux/Windows 设置 skipTaskbar 并隐藏', () => {
        const win = {
            isDestroyed: () => false,
            isFullScreen: () => false,
            once: vi.fn(),
            setFullScreen: vi.fn(),
            hide: vi.fn(),
            setSkipTaskbar: vi.fn(),
        };

        hideWindowToTray(win, 'linux');

        expect(win.setSkipTaskbar).toHaveBeenCalledWith(true);
        expect(win.hide).toHaveBeenCalledTimes(1);
    });

    it('全屏窗口隐藏到托盘：先退出全屏并在 leave-full-screen 后再隐藏', () => {
        let onLeaveFullScreen: (() => void) | undefined;
        const win = {
            isDestroyed: () => false,
            isFullScreen: () => true,
            once: vi.fn((_event: string, listener: () => void) => {
                onLeaveFullScreen = listener;
            }),
            setFullScreen: vi.fn(),
            hide: vi.fn(),
            setSkipTaskbar: vi.fn(),
        };

        hideWindowToTray(win, 'darwin');

        expect(win.setFullScreen).toHaveBeenCalledWith(false);
        expect(win.hide).not.toHaveBeenCalled();

        onLeaveFullScreen?.();
        expect(win.hide).toHaveBeenCalledTimes(1);
        expect(win.setSkipTaskbar).not.toHaveBeenCalled();
    });

    it('从托盘恢复窗口：恢复最小化、取消 skipTaskbar、显示并聚焦', () => {
        const win = {
            isDestroyed: () => false,
            isMinimized: () => true,
            restore: vi.fn(),
            show: vi.fn(),
            focus: vi.fn(),
            setSkipTaskbar: vi.fn(),
        };

        showAndFocusWindow(win, 'win32');

        expect(win.restore).toHaveBeenCalledTimes(1);
        expect(win.setSkipTaskbar).toHaveBeenCalledWith(false);
        expect(win.show).toHaveBeenCalledTimes(1);
        expect(win.focus).toHaveBeenCalledTimes(1);
    });
});
