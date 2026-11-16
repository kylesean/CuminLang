import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import DesktopLyricsPage from '../DesktopLyricsPage';
import { desktopLyricsApi } from '../desktopLyricsApi';
import { useDesktopLyricsStore } from '../desktopLyricsStore';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    }),
}));

vi.mock('@/frontend/infrastructure/electron/rendererEvents', () => ({
    rendererEvents: {
        onDesktopLyricsSync: vi.fn(() => () => undefined),
    },
}));

vi.mock('../desktopLyricsApi', () => ({
    desktopLyricsApi: {
        getState: vi.fn(),
        toggle: vi.fn(async (open?: boolean) => ({ open: Boolean(open), locked: false })),
        setLocked: vi.fn(async (locked: boolean) => ({ open: true, locked })),
        moveBy: vi.fn(async () => undefined),
        syncState: vi.fn(async () => undefined),
        sendCommand: vi.fn(async () => undefined),
    },
}));

describe('DesktopLyricsPage 桌面整句字幕行为契约', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        useDesktopLyricsStore.setState({
            open: true,
            locked: false,
            snapshot: {
                hasMedia: true,
                playing: true,
                singleRepeat: false,
                videoTitle: 'CMU.mp4',
                text: 'This day belongs to all of you.',
                translation: '今天属于你们所有人。',
                sentenceKey: 'hash-1-10',
            },
            prefs: {
                preset: 'frosted',
                fontSize: 'md',
                opacity: 'medium',
                showTranslation: true,
            },
        });
        vi.mocked(desktopLyricsApi.getState).mockResolvedValue({
            windowState: { open: true, locked: false },
            snapshot: useDesktopLyricsStore.getState().snapshot,
        });
    });

    it('渲染当前播放英文整句与中文译文，支持切换双语显隐与样式档位', async () => {
        render(<DesktopLyricsPage />);

        expect(await screen.findByText('This day belongs to all of you.')).toBeDefined();
        expect(screen.getByText('今天属于你们所有人。')).toBeDefined();

        fireEvent.mouseEnter(screen.getByTestId('desktop-lyrics-root'));
        fireEvent.click(screen.getByLabelText('显示/隐藏中文译文'));
        expect(screen.queryByText('今天属于你们所有人。')).toBeNull();

        fireEvent.click(screen.getByLabelText('切换样式'));
        expect(useDesktopLyricsStore.getState().prefs.preset).toBe('outline');

        fireEvent.click(screen.getByLabelText('切换字号'));
        expect(useDesktopLyricsStore.getState().prefs.fontSize).toBe('lg');
    });

    it('点击交互按钮向主播放器派发控制指令，并支持锁定穿透与关闭', async () => {
        render(<DesktopLyricsPage />);
        await screen.findByText('This day belongs to all of you.');

        fireEvent.mouseEnter(screen.getByTestId('desktop-lyrics-root'));

        fireEvent.click(screen.getByLabelText('controlBar.prevSentence'));
        fireEvent.click(screen.getByLabelText('controlBar.pause'));
        fireEvent.click(screen.getByLabelText('controlBar.nextSentence'));
        fireEvent.click(screen.getByLabelText('controlBar.modeSingleRepeat'));
        fireEvent.click(screen.getByLabelText('回到主窗口'));

        expect(desktopLyricsApi.sendCommand).toHaveBeenCalledWith('prev-sentence');
        expect(desktopLyricsApi.sendCommand).toHaveBeenCalledWith('toggle-play');
        expect(desktopLyricsApi.sendCommand).toHaveBeenCalledWith('next-sentence');
        expect(desktopLyricsApi.sendCommand).toHaveBeenCalledWith('toggle-single-repeat');
        expect(desktopLyricsApi.sendCommand).toHaveBeenCalledWith('focus-main');

        fireEvent.click(screen.getByLabelText('锁定鼠标穿透'));
        expect(desktopLyricsApi.setLocked).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByLabelText('关闭桌面字幕'));
        expect(desktopLyricsApi.toggle).toHaveBeenCalledWith(false);
    });
});
