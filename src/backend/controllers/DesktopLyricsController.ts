import { inject, injectable } from 'inversify';
import { z } from 'zod';

import type Controller from '@/backend/controllers/Controller';
import registerRoute from '@/backend/controllers/ipc/registerRoute';
import type { DesktopLyricsWindowManager } from '@/backend/infrastructure/window/DesktopLyricsWindow';
import TYPES from '@/backend/ioc/types';
import type RendererEvents from '@/backend/services/gateways/renderer/RendererEvents';
import { DESKTOP_LYRICS_COMMANDS } from '@/common/contracts/desktop-lyrics';

const snapshotSchema = z.object({
    hasMedia: z.boolean(),
    playing: z.boolean(),
    singleRepeat: z.boolean(),
    videoTitle: z.string(),
    text: z.string(),
    translation: z.string(),
    sentenceKey: z.string().nullable(),
});

/**
 * 桌面整句字幕浮窗控制器：管理浮窗开关、穿透锁定、拖拽位移及主播放器状态/指令双向同步。
 */
@injectable()
export class DesktopLyricsController implements Controller {
    constructor(
        @inject(TYPES.DesktopLyricsWindow) private readonly lyricsWindow: DesktopLyricsWindowManager,
        @inject(TYPES.RendererEvents) private readonly rendererEvents: RendererEvents,
    ) {}

    public registerRoutes(): void {
        registerRoute('desktop-lyrics/state', async () => this.lyricsWindow.getState(), {
            broadcastError: false,
        });

        registerRoute('desktop-lyrics/toggle', async ({ open }) => this.lyricsWindow.toggle(open), {
            schema: z.object({ open: z.boolean().optional() }),
            broadcastError: false,
        });

        registerRoute('desktop-lyrics/set-locked', async ({ locked }) => this.lyricsWindow.setLocked(locked), {
            schema: z.object({ locked: z.boolean() }),
            broadcastError: false,
        });

        registerRoute('desktop-lyrics/move-by', async ({ dx, dy }) => {
            this.lyricsWindow.moveBy(dx, dy);
        }, {
            schema: z.object({
                dx: z.number().finite(),
                dy: z.number().finite(),
            }),
            broadcastError: false,
        });

        registerRoute('desktop-lyrics/sync-state', async (snapshot) => {
            this.lyricsWindow.syncSnapshot(snapshot);
        }, {
            schema: snapshotSchema,
            broadcastError: false,
        });

        registerRoute('desktop-lyrics/command', async ({ type }) => {
            if (type === 'focus-main') {
                this.lyricsWindow.focusMainWindow();
                return;
            }
            this.rendererEvents.desktopLyricsCommand(type);
        }, {
            schema: z.object({ type: z.enum(DESKTOP_LYRICS_COMMANDS) }),
            broadcastError: false,
        });
    }
}
