import fs from 'fs';
import { app, Menu, nativeImage, Tray } from 'electron';
import { getMainLogger } from '@/backend/infrastructure/logger';
import { getRuntimeResourcePath } from '@/backend/utils/runtimeEnv';

const logger = getMainLogger('AppTray');

let trayInstance: Tray | null = null;

/**
 * 判断系统托盘是否已创建且仍处于有效状态。
 */
export function isAppTrayActive(): boolean {
    return trayInstance !== null && !trayInstance.isDestroyed();
}

const resolveTrayLabels = (locale: string): { open: string; quit: string } => {
    const isZh = locale.toLowerCase().startsWith('zh');
    return isZh
        ? { open: '打开 CuminLang', quit: '退出 CuminLang' }
        : { open: 'Open CuminLang', quit: 'Quit CuminLang' };
};

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
export function initAppTray(options: {
    onShowWindow: () => void;
    onQuitApp: () => void;
    locale?: string;
}): boolean {
    if (isAppTrayActive()) {
        return true;
    }
    try {
        const icon = loadTrayIcon();
        if (!icon) {
            return false;
        }
        const tray = new Tray(icon);
        const labels = resolveTrayLabels(options.locale ?? app.getLocale());
        const contextMenu = Menu.buildFromTemplate([
            {
                label: labels.open,
                click: () => options.onShowWindow(),
            },
            { type: 'separator' },
            {
                label: labels.quit,
                click: () => options.onQuitApp(),
            },
        ]);
        tray.setToolTip('CuminLang');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => options.onShowWindow());
        tray.on('double-click', () => options.onShowWindow());
        trayInstance = tray;
        logger.info('app tray initialized', { platform: process.platform });
        return true;
    } catch (error) {
        logger.warn('failed to initialize app tray, falling back to quit on close', { error });
        trayInstance = null;
        return false;
    }
}

/**
 * 退出应用前销毁托盘图标，避免在系统栏留下失效占位。
 */
export function destroyAppTray(): void {
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
