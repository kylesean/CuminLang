import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PlaybackControlBar from '@/frontend/features/player/components/srt-layout/ControlBar';
import OverlayControlBar from '@/frontend/features/player/components/subtitles/OverlayControlBar';
import LearningToolbar from '@/frontend/features/player/components/learning-toolbar/LearningToolbar';
import { usePlayer } from '@/frontend/features/player/playerStore';
import { usePlayerUi } from '@/frontend/features/player/playerUiStore';
import useLayout from '@/frontend/app/stores/layoutStore';

vi.mock('react-i18next', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-i18next')>();
    return {
        ...actual,
        useTranslation: () => ({
            t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
        }),
    };
});

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('@astryxdesign/core/Tooltip', () => ({
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/frontend/features/player/components/learning-toolbar/ReviewDock', () => ({
    default: () => <div data-testid="mock-review-dock" />,
}));

vi.mock('@/frontend/features/player/components/learning-toolbar/LearningSessionDock', () => ({
    default: () => <div data-testid="mock-learning-session-dock" />,
}));

describe('Playback experience enhancements', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useLayout.setState({ podcastMode: false, fullScreen: false });
        usePlayerUi.setState({
            controlBarPinned: false,
            hardsubMaskOn: false,
            hardsubMaskHovering: false,
            hardsubMaskDragging: false,
            showEn: true,
            showCn: true,
            showSourceZh: true,
        });
        usePlayer.setState({
            src: 'file:///media/lesson.mp4',
            playing: false,
            duration: 120,
            volume: 0.8,
            muted: false,
            playbackRate: 1,
            autoPause: false,
            singleRepeat: false,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('PlaybackControlBar reveals on stageActive and stays open while SpeedSlider popover is open', () => {
        const { container, rerender } = render(<PlaybackControlBar stageActive={false} />);
        const shell = () => container.querySelector('.\\@container') as HTMLElement;

        expect(shell().className).toContain('opacity-0');

        rerender(<PlaybackControlBar stageActive />);
        expect(shell().className).toContain('opacity-100');

        // 关闭舞台活跃态后，打开倍速弹层仍保持控制条显形
        rerender(<PlaybackControlBar stageActive={false} />);
        expect(shell().className).toContain('opacity-0');

        fireEvent.click(screen.getByRole('button', { name: '1.00x' }));
        expect(shell().className).toContain('opacity-100');
    });

    it('OverlayControlBar exposes fullscreen practice and sentence-learning quick actions', () => {
        useLayout.setState({ fullScreen: true, podcastMode: false });

        render(<OverlayControlBar />);

        expect(screen.getByRole('button', { name: 'panel.title' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'learning.title' })).toBeDefined();
    });

    it('LearningToolbar hides scroll arrows when content fits and reveals scroll cue on horizontal overflow', () => {
        const scrollWidthSpy = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);

        const { unmount } = render(<LearningToolbar pinned />);
        expect(screen.queryByTestId('learning-toolbar-scroll-right')).toBeNull();
        unmount();

        scrollWidthSpy.mockReturnValue(680);
        render(<LearningToolbar pinned />);
        const scrollRightButton = screen.getByTestId('learning-toolbar-scroll-right');
        const scrollBySpy = vi.fn();
        const scroller = scrollRightButton.parentElement?.previousElementSibling as HTMLElement;
        scroller.scrollBy = scrollBySpy;

        fireEvent.click(scrollRightButton);
        expect(scrollBySpy).toHaveBeenCalledWith({ left: 160, behavior: 'smooth' });
    });

    it('VolumeSlider in OverlayControlBar stays synced when store volume updates externally', () => {
        useLayout.setState({ fullScreen: true, podcastMode: false });
        usePlayer.setState({ volume: 0.8, muted: false });

        render(<OverlayControlBar />);
        expect(screen.getByRole('button', { name: 'volumeSlider.mute' }).textContent).toContain('80');

        // 模拟快捷键（PlayerShortcut）直接修改 playerStore.volume
        act(() => {
            usePlayer.setState({ volume: 0.4 });
        });
        expect(screen.getByRole('button', { name: 'volumeSlider.mute' }).textContent).toContain('40');
    });

    it('OverlayControlBar reports larger bottom reserve when pinned/visible to keep subtitles above the bar', () => {
        useLayout.setState({ fullScreen: true, podcastMode: false });
        const onReserve = vi.fn();

        render(<OverlayControlBar onReserveBottomChange={onReserve} />);
        expect(onReserve).toHaveBeenCalledWith(104, false);

        act(() => {
            usePlayerUi.setState({ controlBarPinned: true });
        });
        expect(onReserve).toHaveBeenLastCalledWith(104, false);
    });
});
