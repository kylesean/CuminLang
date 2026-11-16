import { backendClient } from '@/frontend/infrastructure/electron/backendClient';
import type {
    DesktopLyricsCommandType,
    DesktopLyricsSnapshot,
    DesktopLyricsStatePayload,
    DesktopLyricsWindowState,
} from '@/common/contracts/desktop-lyrics';

export const desktopLyricsApi = {
    getState: (): Promise<DesktopLyricsStatePayload> => backendClient.call('desktop-lyrics/state'),
    toggle: (open?: boolean): Promise<DesktopLyricsWindowState> => backendClient.call('desktop-lyrics/toggle', { open }),
    setLocked: (locked: boolean): Promise<DesktopLyricsWindowState> => backendClient.call('desktop-lyrics/set-locked', { locked }),
    moveBy: (dx: number, dy: number): Promise<void> => backendClient.call('desktop-lyrics/move-by', { dx, dy }),
    syncState: (snapshot: DesktopLyricsSnapshot): Promise<void> => backendClient.call('desktop-lyrics/sync-state', snapshot),
    sendCommand: (type: DesktopLyricsCommandType): Promise<void> => backendClient.call('desktop-lyrics/command', { type }),
};
