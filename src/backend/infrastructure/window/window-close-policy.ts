import type { BrowserWindow } from 'electron';

const TILING_DESKTOP_PATTERN = /\b(hyprland|sway|river|niri|i3)\b/i;

/**
 * 判断当前是否运行在没有传统任务栏的 Linux 平铺窗口管理器（如 Omarchy / Hyprland / Sway）。
 */
export function isTilingWindowManager(
    env: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): boolean {
    if (platform !== 'linux') {
        return false;
    }
    if (env.HYPRLAND_INSTANCE_SIGNATURE || env.SWAYSOCK || env.I3SOCK) {
        return true;
    }
    const desktop = env.XDG_CURRENT_DESKTOP ?? env.XDG_SESSION_DESKTOP ?? '';
    return TILING_DESKTOP_PATTERN.test(desktop);
}

/**
 * 判定点击关闭窗口按钮时，是否应“隐藏到托盘而非销毁/退出进程”。
 *
 * 仅在托盘可用、未进入退出流程且不处于启动迁移恢复页时才拦截关闭；
 * 托盘创建失败时放行正常关闭，避免窗口消失且没有任何入口可找回或退出应用。
 */
export function shouldHideInsteadOfClose(params: {
    trayActive: boolean;
    isQuitting: boolean;
    recoveryMode: boolean;
}): boolean {
    return params.trayActive && !params.isQuitting && !params.recoveryMode;
}

/**
 * 判定点击最小化（—）时，是否应改为隐藏到托盘。
 *
 * Windows、macOS 与传统 Linux 桌面（GNOME/KDE 等）保留原生任务栏最小化；
 * Omarchy/Hyprland 等无任务栏平铺桌面下 `win.minimize()` 会被合成器忽略，
 * 在托盘可用时改为隐藏到顶部状态栏托盘，避免按钮点击毫无反应。
 */
export function shouldHideInsteadOfMinimize(params: {
    trayActive: boolean;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
}): boolean {
    return params.trayActive && isTilingWindowManager(params.env, params.platform);
}

type HideableWindow = Pick<
    BrowserWindow,
    'isDestroyed' | 'isFullScreen' | 'setFullScreen' | 'hide' | 'setSkipTaskbar'
> & {
    once(event: 'leave-full-screen', listener: () => void): unknown;
};

type RestorableWindow = Pick<
    BrowserWindow,
    'isDestroyed' | 'isMinimized' | 'restore' | 'show' | 'focus' | 'setSkipTaskbar'
>;

const applyHide = (win: HideableWindow, platform: NodeJS.Platform): void => {
    if (win.isDestroyed()) {
        return;
    }
    if (platform !== 'darwin') {
        win.setSkipTaskbar(true);
    }
    win.hide();
};

/**
 * 将主窗口隐藏到托盘（若处于全屏态先退出全屏再隐藏，避免 macOS 遗留黑色 Space）。
 */
export function hideWindowToTray(
    win: HideableWindow,
    platform: NodeJS.Platform = process.platform,
): void {
    if (win.isDestroyed()) {
        return;
    }
    if (win.isFullScreen()) {
        win.once('leave-full-screen', () => applyHide(win, platform));
        win.setFullScreen(false);
        return;
    }
    applyHide(win, platform);
}

/**
 * 从隐藏或最小化状态唤醒并聚焦主窗口。
 */
export function showAndFocusWindow(
    win: RestorableWindow,
    platform: NodeJS.Platform = process.platform,
): void {
    if (win.isDestroyed()) {
        return;
    }
    if (win.isMinimized()) {
        win.restore();
    }
    if (platform !== 'darwin') {
        win.setSkipTaskbar(false);
    }
    win.show();
    win.focus();
}
