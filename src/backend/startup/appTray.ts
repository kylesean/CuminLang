import fs from 'fs';
import { app, Menu, nativeImage, Tray } from 'electron';
import { getMainLogger } from '@/backend/infrastructure/logger';
import { getRuntimeResourcePath } from '@/backend/utils/runtimeEnv';
import type { DesktopLyricsWindowState } from '@/common/contracts/desktop-lyrics';

const logger = getMainLogger('AppTray');

let trayInstance: Tray | null = null;
let trayOptions: AppTrayInitOptions | null = null;
let currentLyricsState: DesktopLyricsWindowState = { open: false, locked: false };

export interface AppTrayInitOptions {
    onShowWindow: () => void;
    onQuitApp: () => void;
    onToggleDesktopLyrics?: () => void;
    onToggleDesktopLyricsLock?: (locked: boolean) => void;
    locale?: string;
}

/**
 * 判断系统托盘是否已创建且仍处于有效状态。
 */
export function isAppTrayActive(): boolean {
    return trayInstance !== null && !trayInstance.isDestroyed();
}

const resolveTrayLabels = (locale: string) => {
    const isZh = locale.toLowerCase().startsWith('zh');
    return isZh
        ? {
            open: '打开 CuminLang',
            showLyrics: '开启桌面字幕',
            hideLyrics: '关闭桌面字幕',
            lockLyrics: '锁定桌面字幕穿透',
            unlockLyrics: '解锁桌面字幕交互',
            quit: '退出 CuminLang',
        }
        : {
            open: 'Open CuminLang',
            showLyrics: 'Show Desktop Subtitles',
            hideLyrics: 'Hide Desktop Subtitles',
            lockLyrics: 'Lock Subtitle Click-Through',
            unlockLyrics: 'Unlock Subtitle Controls',
            quit: 'Quit CuminLang',
        };
};

const rebuildTrayMenu = (): void => {
    if (!trayInstance || trayInstance.isDestroyed() || !trayOptions) {
        return;
    }
    const labels = resolveTrayLabels(trayOptions.locale ?? app.getLocale());
    const options = trayOptions;
    const menuItems: Electron.MenuItemConstructorOptions[] = [
        {
            label: labels.open,
            click: () => options.onShowWindow(),
        },
    ];

    if (options.onToggleDesktopLyrics) {
        menuItems.push({
            label: currentLyricsState.open ? labels.hideLyrics : labels.showLyrics,
            click: () => options.onToggleDesktopLyrics?.(),
        });
    }
    if (options.onToggleDesktopLyricsLock && currentLyricsState.open) {
        menuItems.push({
            label: currentLyricsState.locked ? labels.unlockLyrics : labels.lockLyrics,
            click: () => options.onToggleDesktopLyricsLock?.(!currentLyricsState.locked),
        });
    }

    menuItems.push(
        { type: 'separator' },
        {
            label: labels.quit,
            click: () => options.onQuitApp(),
        },
    );

    trayInstance.setContextMenu(Menu.buildFromTemplate(menuItems));
};

/**
 * 根据桌面句卡开关与锁定穿透态刷新托盘右键菜单。
 */
export function refreshAppTrayMenu(lyricsState: DesktopLyricsWindowState): void {
    currentLyricsState = lyricsState;
    rebuildTrayMenu();
}

const loadTrayIcon = () => {
    const iconPath = getRuntimeResourcePath('resources', 'tray-icon.png');
    if (!fs.existsSync(iconPath)) {
        logger.warn('tray icon file missing', { iconPath });
        return null;
    }
    const image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
        logger.warn('tray icon image empty', { iconPath });
        return null;
    }
    if (process.platform === 'darwin') {
        return image.resize({ width: 18, height: 18 });
    }
    return image;
};

/**
 * 初始化桌面菜单栏 / 系统托盘图标及交互菜单。
 *
 * 若当前桌面环境不支持托盘或图标缺失，返回 `false` 降级为关闭窗口即退出，
 * 避免无托盘时窗口隐藏后变成无法唤醒也无法退出的后台进程。
 */
export function initAppTray(options: AppTrayInitOptions): boolean {
    if (isAppTrayActive()) {
        return true;
    }
    try {
        const icon = loadTrayIcon();
        if (!icon) {
            return false;
        }
        const tray = new Tray(icon);
        trayOptions = options;
        trayInstance = tray;
        tray.setToolTip('CuminLang');
        rebuildTrayMenu();
        tray.on('click', () => options.onShowWindow());
        tray.on('double-click', () => options.onShowWindow());
        logger.info('app tray initialized', { platform: process.platform });
        return true;
    } catch (error) {
        logger.warn('failed to initialize app tray, falling back to quit on close', { error });
        trayInstance = null;
        trayOptions = null;
        return false;
    }
}

/**
 * 退出应用前销毁托盘图标，避免在系统栏留下失效占位。
 */
export function destroyAppTray(): void {
    trayOptions = null;
    if (!trayInstance) {
        return;
    }
    try {
        if (!trayInstance.isDestroyed()) {
            trayInstance.destroy();
        }
    } catch (error) {
        logger.warn('failed to destroy app tray', { error });
    } finally {
        trayInstance = null;
    }
}
