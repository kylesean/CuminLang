import path from 'path';
import { app, BrowserWindow, screen } from 'electron';
import { inject, injectable } from 'inversify';

import TYPES from '@/backend/ioc/types';
import type MainWindowRegistry from '@/backend/infrastructure/system/MainWindowRegistry';
import { installRendererSecurityGuards } from '@/backend/infrastructure/system/RendererSecurityGuard';
import { getMainLogger } from '@/backend/infrastructure/logger';
import {
    createEmptyDesktopLyricsSnapshot,
    type DesktopLyricsSnapshot,
    type DesktopLyricsStatePayload,
    type DesktopLyricsWindowState,
} from '@/common/contracts/desktop-lyrics';

const logger = getMainLogger('DesktopLyricsWindow');

const DEFAULT_LYRICS_WIDTH = 720;
const MIN_LYRICS_WIDTH = 460;
const LYRICS_WINDOW_HEIGHT = 176;
const SCREEN_BOTTOM_MARGIN = 52;

/**
 * 桌面整句字幕浮窗管理器。
 *
 * 采用独立透明无框辅助窗口（#/desktop-lyrics），主窗口隐藏到托盘或用户切换到其他工作软件时
 * 依然可以常驻置顶展示当前播放英文句与译文，并支持锁定鼠标穿透以免干扰正常桌面工作。
 */
@injectable()
export class DesktopLyricsWindowManager {
    private window: BrowserWindow | null = null;
    private open = false;
    private locked = false;
    private lastPosition: [number, number] | null = null;
    private snapshot: DesktopLyricsSnapshot = createEmptyDesktopLyricsSnapshot();
    private rendererEntry: {
        devServerUrl?: string;
        htmlPath?: string;
        rendererDirectory?: string;
    } = {};
    private onStateChanged?: (state: DesktopLyricsWindowState) => void;
    private onFocusMain?: () => void;

    constructor(
        @inject(TYPES.MainWindowRegistry) private readonly mainWindowRegistry: MainWindowRegistry,
    ) {}

    /**
     * 配置桌面浮窗加载页面来源与主窗口唤醒回调（由 main.ts 在启动时注入）。
     */
    public configure(options: {
        devServerUrl?: string;
        htmlPath?: string;
        rendererDirectory?: string;
        onStateChanged?: (state: DesktopLyricsWindowState) => void;
        onFocusMain?: () => void;
    }): void {
        this.rendererEntry = {
            devServerUrl: options.devServerUrl,
            htmlPath: options.htmlPath,
            rendererDirectory: options.rendererDirectory,
        };
        this.onStateChanged = options.onStateChanged;
        this.onFocusMain = options.onFocusMain;
    }

    /** 读取当前浮窗与句子快照。 */
    public getState(): DesktopLyricsStatePayload {
        return {
            windowState: {
                open: this.open && this.window !== null && !this.window.isDestroyed(),
                locked: this.locked,
            },
            snapshot: this.snapshot,
        };
    }

    /** 切换或显式设置桌面浮窗显示状态。 */
    public toggle(targetOpen?: boolean): DesktopLyricsWindowState {
        const nextOpen = targetOpen ?? !this.open;
        if (nextOpen) {
            this.openWindow();
        } else {
            this.closeWindow();
        }
        return this.getState().windowState;
    }

    /** 切换鼠标事件穿透锁定（锁定后不阻塞下方编辑器/浏览器的点击）。 */
    public setLocked(locked: boolean): DesktopLyricsWindowState {
        this.locked = locked;
        if (this.window && !this.window.isDestroyed()) {
            this.applyIgnoreMouseEvents(this.window, locked);
        }
        this.broadcastState();
        return this.getState().windowState;
    }

    /** 按拖拽位移增量移动浮窗（Electron/Wayland 透明窗口通用，比 CSS -webkit-app-region 更稳定）。 */
    public moveBy(dx: number, dy: number): void {
        const win = this.window;
        if (!win || win.isDestroyed()) {
            return;
        }
        const [curX, curY] = win.getPosition();
        const [winW, winH] = win.getSize();
        const nextX = Math.round(curX + dx);
        const nextY = Math.round(curY + dy);
        const display = screen.getDisplayNearestPoint({ x: nextX, y: nextY });
        const { workArea } = display;
        const clampedX = Math.min(Math.max(nextX, workArea.x - Math.floor(winW * 0.4)), workArea.x + workArea.width - Math.floor(winW * 0.6));
        const clampedY = Math.min(Math.max(nextY, workArea.y), workArea.y + workArea.height - Math.floor(winH * 0.4));
        win.setPosition(clampedX, clampedY);
        this.lastPosition = [clampedX, clampedY];
    }

    /** 接收主窗口播放器推送的当前句与播放态并广播到桌面浮窗。 */
    public syncSnapshot(snapshot: DesktopLyricsSnapshot): void {
        this.snapshot = snapshot;
        if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('desktop-lyrics-sync', this.getState());
        }
    }

    /** 请求把主窗口唤醒到前台（例如用户点击浮窗的“回到主窗口”按钮）。 */
    public focusMainWindow(): void {
        this.onFocusMain?.();
    }

    /** 退出应用前彻底销毁辅助窗口。 */
    public destroy(): void {
        this.open = false;
        if (this.window && !this.window.isDestroyed()) {
            this.window.destroy();
        }
        this.window = null;
    }

    private openWindow(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.open = true;
            this.window.showInactive();
            this.applyAlwaysOnTop(this.window);
            this.applyIgnoreMouseEvents(this.window, this.locked);
            this.broadcastState();
            return;
        }

        const { workArea } = screen.getPrimaryDisplay();
        const width = Math.min(DEFAULT_LYRICS_WIDTH, Math.max(MIN_LYRICS_WIDTH, Math.round(workArea.width * 0.56)));
        const height = LYRICS_WINDOW_HEIGHT;
        const [x, y] = this.lastPosition ?? [
            Math.round(workArea.x + (workArea.width - width) / 2),
            Math.round(workArea.y + workArea.height - height - SCREEN_BOTTOM_MARGIN),
        ];

        const win = new BrowserWindow({
            width,
            height,
            x,
            y,
            frame: false,
            transparent: true,
            backgroundColor: '#00000000',
            hasShadow: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            maximizable: false,
            minimizable: false,
            // 默认不抢占用户当前工作窗口的键盘焦点；拖动与点击按钮在 Chromium 中依然生效
            focusable: false,
            show: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.cjs'),
                webSecurity: true,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });

        this.window = win;
        this.open = true;
        this.applyAlwaysOnTop(win);
        this.applyIgnoreMouseEvents(win, this.locked);

        installRendererSecurityGuards(win, {
            devServerUrl: this.rendererEntry.devServerUrl,
            rendererDirectory: this.rendererEntry.rendererDirectory,
        });

        win.once('ready-to-show', () => {
            if (!win.isDestroyed() && this.open) {
                win.showInactive();
                this.applyAlwaysOnTop(win);
                win.webContents.send('desktop-lyrics-sync', this.getState());
            }
        });

        win.on('moved', () => {
            if (!win.isDestroyed()) {
                const [px, py] = win.getPosition();
                this.lastPosition = [px, py];
            }
        });

        win.on('closed', () => {
            this.window = null;
            this.open = false;
            this.locked = false;
            this.broadcastState();
            logger.info('desktop lyrics window closed');
        });

        if (this.rendererEntry.devServerUrl) {
            const devUrl = this.rendererEntry.devServerUrl.replace(/\/+$/, '');
            void win.loadURL(`${devUrl}/#/desktop-lyrics`);
        } else if (this.rendererEntry.htmlPath) {
            void win.loadFile(this.rendererEntry.htmlPath, { hash: 'desktop-lyrics' });
        } else if (app.isReady()) {
            logger.warn('desktop lyrics window missing renderer entry path');
        }

        this.broadcastState();
        logger.info('desktop lyrics window opened', { x, y, width, height });
    }

    private closeWindow(): void {
        this.open = false;
        this.locked = false;
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
        this.broadcastState();
    }

    private applyAlwaysOnTop(win: BrowserWindow): void {
        if (win.isDestroyed()) {
            return;
        }
        win.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'screen-saver');
        if (process.platform === 'darwin') {
            win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        }
    }

    private applyIgnoreMouseEvents(win: BrowserWindow, locked: boolean): void {
        if (win.isDestroyed()) {
            return;
        }
        if (!locked) {
            win.setIgnoreMouseEvents(false);
            return;
        }
        if (process.platform === 'linux') {
            // Linux Wayland/X11 不支持 { forward: true }；设为完全穿透，可由托盘菜单或主播放器解除锁定
            win.setIgnoreMouseEvents(true);
            return;
        }
        win.setIgnoreMouseEvents(true, { forward: true });
    }

    private broadcastState(): void {
        const payload = this.getState();
        this.onStateChanged?.(payload.windowState);

        if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('desktop-lyrics-sync', payload);
        }
        const mainWindow = this.mainWindowRegistry.tryGetMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('desktop-lyrics-sync', payload);
        }
    }
}
