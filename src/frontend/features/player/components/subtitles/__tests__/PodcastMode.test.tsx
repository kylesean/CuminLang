import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PlaybackProgressSlider } from '@/frontend/features/player/components/PlaybackProgressControls';
import PodcastControlBar from '@/frontend/features/player/components/subtitles/PodcastControlBar';
import PodcastViewer from '@/frontend/features/player/components/subtitles/PodcastViewer';
import PlaybackStage from '@/frontend/features/player/components/srt-layout/Stage';
import useLayout from '@/frontend/app/stores/layoutStore';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { usePlayer } from '@/frontend/features/player/playerStore';
import { usePlayerUi } from '@/frontend/features/player/playerUiStore';
import { playerApi } from '@/frontend/features/player/playerApi';

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

vi.mock('@/frontend/features/player/playerApi', () => ({
    playerApi: {
        setPodcastModePreference: vi.fn().mockResolvedValue(undefined),
        deleteTimestampAdjustment: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/frontend/features/player/components/srt-layout/SubtitleGenerationPanel', () => ({
    default: () => <div data-testid="mock-subtitle-generation-panel">SubtitleGenerationPanel</div>,
}));

vi.mock('@/frontend/features/player/components/subtitles/TranslatableLinePodcast', () => ({
    default: ({ sentence }: { sentence: { text: string } }) => (
        <div data-testid="mock-podcast-line">{sentence.text}</div>
    ),
}));

vi.mock('@/frontend/features/player/components/PlayerEngine', () => ({
    default: () => <div data-testid="mock-player-engine" />,
}));

vi.mock('@/frontend/features/player/components/HardsubMask', () => ({
    default: () => <div data-testid="mock-hardsub-mask" />,
}));

vi.mock('@/frontend/features/player/components/srt-layout/ControlBar', () => ({
    default: () => <div data-testid="mock-video-control-bar" />,
}));

vi.mock('@/frontend/features/player/components/subtitles/FullscreenSubtitleOverlay', () => ({
    default: () => <div data-testid="mock-fullscreen-subtitle-overlay" />,
}));

const sampleSentence = {
    key: '0:file-1',
    index: 0,
    text: 'First podcast sentence.',
    textZH: '第一句播客字幕。',
    start: 0,
    end: 4,
    adjustedStart: null,
    adjustedEnd: null,
    fileHash: 'file-1',
    translationKey: 'tk-1',
};

const secondSentence = {
    key: '1:file-1',
    index: 1,
    text: 'Second podcast sentence.',
    textZH: '第二句播客字幕。',
    start: 4,
    end: 8,
    adjustedStart: null,
    adjustedEnd: null,
    fileHash: 'file-1',
    translationKey: 'tk-2',
};

describe('Podcast mode behavior contracts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useLayout.setState({
            podcastMode: true,
            fullScreen: false,
            showTranscript: true,
            podcastTranscriptVisible: false,
        });
        usePlaybackSession.setState({
            videoId: 'video-42',
            subtitlePath: '/subs/sample.srt',
            videoPath: '/media/episode-01.mp3',
        });
        usePlayerUi.setState({
            showEn: true,
            showCn: true,
            showSourceZh: true,
            podcastBlindMode: false,
        });
        usePlayer.setState({
            src: 'file:///media/episode-01.mp3',
            playing: false,
            duration: 120,
            volume: 0.8,
            muted: false,
            playbackRate: 1,
            autoPause: false,
            singleRepeat: false,
            currentSentence: null,
            sentences: [],
            srtTender: null,
        });
    });

    it.each([
        { label: 'default', customClass: undefined },
        { label: 'podcast bar custom classes', customClass: 'cursor-pointer py-1' },
    ])('keeps w-full and min-w-0 on PlaybackProgressSlider wrapper ($label)', ({ customClass }) => {
        const { container } = render(
            <PlaybackProgressSlider
                previewTime={null}
                onPreviewTimeChange={vi.fn()}
                onScrubValueChange={vi.fn()}
                onScrubCommit={vi.fn()}
                className={customClass}
            />,
        );

        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper.className).toContain('w-full');
        expect(wrapper.className).toContain('min-w-0');
    });

    it('renders unified controls inside PodcastControlBar and exits podcast mode consistently', () => {
        render(<PodcastControlBar />);

        expect(screen.getByRole('button', { name: 'controlBar.prevSentence' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'controlBar.play' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'controlBar.nextSentence' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'controlBar.modeSingleRepeat' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'controlBar.modeAutoPause' })).toBeDefined();
        expect(screen.getByRole('button', { name: /controlBox\.title/i })).toBeDefined();

        fireEvent.click(screen.getByRole('button', { name: 'controlBar.exitPodcast' }));

        expect(useLayout.getState().podcastMode).toBe(false);
        expect(playerApi.setPodcastModePreference).toHaveBeenCalledWith('video-42', false);
    });

    it('PodcastViewer shows SubtitleGenerationPanel and retains control bar when no subtitle exists', () => {
        usePlaybackSession.setState({
            videoId: 'video-42',
            subtitlePath: '',
            videoPath: '/media/episode-01.mp3',
        });

        render(<PodcastViewer />);

        expect(screen.getByTestId('mock-subtitle-generation-panel')).toBeDefined();
        expect(screen.getByTestId('podcast-control-bar')).toBeDefined();
    });

    it('PodcastViewer shows preparing state with media filename while subtitle is loading', () => {
        usePlaybackSession.setState({
            videoId: 'video-42',
            subtitlePath: '/subs/episode-01.srt',
            videoPath: '/media/episode-01.mp3',
        });

        render(<PodcastViewer />);

        expect(screen.getByText('episode-01.mp3')).toBeDefined();
        expect(screen.getByText('podcast.loadingSubtitles')).toBeDefined();
        expect(screen.getByTestId('podcast-control-bar')).toBeDefined();
    });

    it('PodcastViewer renders lyrics, top context bar, sentence progress filament, and independent transcript toggle', () => {
        usePlayer.setState((prev) => ({
            currentSentence: sampleSentence as never,
            sentences: [sampleSentence, secondSentence] as never,
            srtTender: { clear: vi.fn(), adjusted: vi.fn(() => false) } as never,
            internal: { ...prev.internal, exactPlayTime: 2 },
        }));

        render(<PodcastViewer />);

        expect(screen.getAllByTestId('mock-podcast-line')).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: /controlBox\.title/i })).toHaveLength(1);
        expect(screen.getByTestId('podcast-sentence-counter').textContent).toBe('1 / 2');
        const filamentFill = screen.getByTestId('podcast-sentence-progress').firstElementChild as HTMLElement;
        expect(filamentFill.style.transform).toBe('scaleX(0.5)');

        fireEvent.click(screen.getByTestId('podcast-transcript-toggle'));

        expect(useLayout.getState().podcastTranscriptVisible).toBe(true);
        expect(useLayout.getState().showTranscript).toBe(true);
    });

    it('PodcastViewer blind listening hides text until clicked or hovered and re-veils on sentence advance', () => {
        usePlayer.setState({
            currentSentence: sampleSentence as never,
            sentences: [sampleSentence, secondSentence] as never,
            srtTender: { clear: vi.fn(), adjusted: vi.fn(() => false) } as never,
        });

        const { rerender } = render(<PodcastViewer />);

        fireEvent.click(screen.getByTestId('podcast-blind-toggle'));
        expect(usePlayerUi.getState().podcastBlindMode).toBe(true);
        expect(screen.getByTestId('podcast-blind-veil')).toBeDefined();
        expect(screen.queryByText('First podcast sentence.')).toBeNull();
        expect(screen.getByTestId('podcast-sentence-progress')).toBeDefined();

        // 点击遮罩临时揭晓当前句
        fireEvent.click(screen.getByTestId('podcast-blind-veil'));
        expect(screen.getByText('First podcast sentence.')).toBeDefined();
        expect(screen.queryByTestId('podcast-blind-veil')).toBeNull();

        // 切到下一句后自动重新进入盲听遮罩
        act(() => {
            usePlayer.setState({ currentSentence: secondSentence as never });
        });
        rerender(<PodcastViewer />);
        expect(screen.getByTestId('podcast-blind-veil')).toBeDefined();
        expect(screen.queryByText('Second podcast sentence.')).toBeNull();

        // 悬停当前句可临时窥视，移出即恢复遮罩
        const activeContainer = screen.getByTestId('podcast-blind-veil').parentElement as HTMLElement;
        fireEvent.mouseEnter(activeContainer);
        expect(screen.getByText('Second podcast sentence.')).toBeDefined();
        fireEvent.mouseLeave(activeContainer);
        expect(screen.getByTestId('podcast-blind-veil')).toBeDefined();

        // 按住反斜杠 `\` 可临时窥视当前句，松开后恢复盲听遮罩
        fireEvent.keyDown(window, { code: 'Backslash' });
        expect(screen.getByText('Second podcast sentence.')).toBeDefined();
        fireEvent.keyUp(window, { code: 'Backslash' });
        expect(screen.getByTestId('podcast-blind-veil')).toBeDefined();
    });

    it('PodcastViewer only triggers gotoSentence when clicking neighboring sentences, not the active sentence', () => {
        const gotoSentenceSpy = vi.fn().mockResolvedValue(undefined);
        usePlayer.setState({
            currentSentence: sampleSentence as never,
            sentences: [sampleSentence, secondSentence] as never,
            srtTender: { clear: vi.fn(), adjusted: vi.fn(() => false) } as never,
            gotoSentence: gotoSentenceSpy as never,
        });

        render(<PodcastViewer />);

        fireEvent.click(screen.getByText('First podcast sentence.'));
        expect(gotoSentenceSpy).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('Second podcast sentence.'));
        expect(gotoSentenceSpy).toHaveBeenCalledTimes(1);
        expect(gotoSentenceSpy).toHaveBeenCalledWith(secondSentence);
    });

    it('PlaybackStage hides FullscreenSubtitleOverlay while podcastMode is active', () => {
        useLayout.setState({ podcastMode: true, fullScreen: true });

        render(<PlaybackStage />);

        expect(screen.queryByTestId('mock-fullscreen-subtitle-overlay')).toBeNull();
    });

    it('PlaybackStage renders FullscreenSubtitleOverlay when fullScreen is active outside podcastMode', () => {
        useLayout.setState({ podcastMode: false, fullScreen: true });

        render(<PlaybackStage />);

        expect(screen.getByTestId('mock-fullscreen-subtitle-overlay')).toBeDefined();
    });
});
