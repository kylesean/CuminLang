import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlayerSettingsPopover from '../PlayerSettingsPopover';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-i18next')>();
    return {
        ...actual,
        useTranslation: () => ({
            t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
        }),
    };
});

const mockDiscardEditedSubtitle = vi.fn();
vi.mock('@/frontend/features/player/playerApi', () => ({
    playerApi: {
        deleteTimestampAdjustment: vi.fn().mockResolvedValue(undefined),
        discardEditedSubtitle: (...args: unknown[]) => mockDiscardEditedSubtitle(...args),
    },
}));

vi.mock('@/frontend/features/player/components/learning-toolbar/TimeAdjustPanel', () => ({
    default: () => <div data-testid="mock-time-adjust-panel">TimeAdjustPanel</div>,
}));

describe('PlayerSettingsPopover', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the 3-line quick remote controls and opens popover', () => {
        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        const trigger = screen.getByRole('button', { name: /controlBox\.title/i });
        expect(trigger).toBeDefined();

        fireEvent.click(trigger);
        expect(screen.queryByTestId('player-setting-sentence-block')).toBeNull();
        expect(screen.getByTestId('player-setting-pause-on-hover')).toBeDefined();
        expect(screen.getByTestId('player-setting-auto-play-next')).toBeDefined();
    });

    it('exposes all four vocabulary guidance levels including intensive', () => {
        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        fireEvent.click(screen.getByRole('button', { name: /controlBox\.title/i }));

        for (const key of [
            'controlBox.vocabularyGuidanceOff',
            'controlBox.vocabularyGuidanceCalm',
            'controlBox.vocabularyGuidanceCoach',
            'controlBox.vocabularyGuidanceIntensive',
        ]) {
            expect(screen.getByText(key)).toBeDefined();
        }
    });

    it('can switch to timing calibration tab without opening secondary popover', () => {
        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        const trigger = screen.getByRole('button', { name: /controlBox\.title/i });
        fireEvent.click(trigger);

        // Click the timing tab segment
        const timingTab = screen.getByRole('radio', { name: /字幕时间/i });
        fireEvent.click(timingTab);

        expect(screen.getByTestId('mock-time-adjust-panel')).toBeDefined();
    });

    it('does not expose a sentence block mode switch', () => {
        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        const trigger = screen.getByRole('button', { name: /controlBox\.title/i });
        fireEvent.click(trigger);

        // 整句已是唯一行为，弹层里不应再出现该开关。
        expect(screen.queryByTestId('player-setting-sentence-block')).toBeNull();
    });

    it('exposes subtitle context as a display-only preference', async () => {
        const { usePlayerUi } = await import('@/frontend/features/player/playerUiStore');
        usePlayerUi.setState({ subtitleContext: 'sentence' });

        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        fireEvent.click(screen.getByRole('button', { name: /controlBox\.title/i }));

        // 选项存在；默认只显示当前句。
        expect(screen.getByText('controlBox.subtitleContext')).toBeDefined();
        expect(usePlayerUi.getState().subtitleContext).toBe('sentence');
    });

    it('navigates to full settings when clicking bottom entry', () => {
        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        const trigger = screen.getByRole('button', { name: /controlBox\.title/i });
        fireEvent.click(trigger);

        const allSettingsBtn = screen.getByRole('button', { name: /全部播放设置/i });
        fireEvent.click(allSettingsBtn);
        expect(mockNavigate).toHaveBeenCalledWith('/settings/appearance');
    });

    it('renders podcast mode switch', () => {
        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        const trigger = screen.getByRole('button', { name: /controlBox\.title/i });
        fireEvent.click(trigger);

        expect(screen.getByTestId('player-setting-podcast-mode')).toBeInTheDocument();
    });

    it('中文可见时显示自适应中文字幕开关', () => {
        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        const trigger = screen.getByRole('button', { name: /controlBox\.title/i });
        fireEvent.click(trigger);

        expect(screen.getByTestId('player-setting-adaptive-chinese')).toBeInTheDocument();
    });

    it('字幕时间选项卡内展示字幕轨道切换与本地重识入口', async () => {
        const { usePlaybackSession } = await import('@/frontend/features/player/playbackSessionStore');
        usePlaybackSession.setState({
            videoId: 'video-1',
            videoPath: '/tmp/talk.mp4',
            subtitlePath: '/tmp/talk.en.srt',
            subtitleOrigin: 'auto_asr',
            subtitleTracks: [
                { path: '/tmp/talk.en.srt', fileName: 'talk.en.srt', origin: 'auto_asr', active: true },
                { path: '/tmp/talk.local.srt', fileName: 'talk.local.srt', origin: 'local_asr', active: false },
            ],
        });

        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        fireEvent.click(screen.getByRole('button', { name: /controlBox\.title/i }));
        fireEvent.click(screen.getByRole('radio', { name: /字幕时间/i }));

        expect(screen.getByTestId('player-subtitle-track-section')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /subtitleOrigin\.regenerate/i })).toBeInTheDocument();
        usePlaybackSession.getState().clear();
    });

    it('全屏 overlay 控制条宿主下隐藏重复播客开关与不生效的场景路标开关', () => {
        render(<PlayerSettingsPopover tone="overlay" popoverOffset={44} />);
        fireEvent.click(screen.getByRole('button', { name: /controlBox\.title/i }));

        expect(screen.queryByTestId('player-setting-podcast-mode')).toBeNull();
        expect(screen.queryByTestId('player-setting-scene-cues')).toBeNull();
        expect(screen.getByTestId('player-setting-adaptive-chinese')).toBeInTheDocument();
    });

    it('字幕轨道下拉使用纯语义名称，不暴露 .local.srt/.en.srt 裸后缀也不拼入超长标题', async () => {
        const { usePlaybackSession } = await import('@/frontend/features/player/playbackSessionStore');
        const longStem = '2026 CMU Commencement Keynote Speaker： Jensen Huang [FZh_0uRgrg4]';
        usePlaybackSession.setState({
            videoId: 'video-long',
            videoPath: `/tmp/${longStem}.mp4`,
            subtitlePath: `/tmp/${longStem}.local.srt`,
            subtitleOrigin: 'local_asr',
            subtitleTracks: [
                { path: `/tmp/${longStem}.edited.srt`, fileName: `${longStem}.edited.srt`, origin: 'user_edited', active: false },
                { path: `/tmp/${longStem}.local.srt`, fileName: `${longStem}.local.srt`, origin: 'local_asr', active: true },
                { path: `/tmp/${longStem}.en.srt`, fileName: `${longStem}.en.srt`, origin: 'auto_asr', active: false },
            ],
        });

        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        fireEvent.click(screen.getByRole('button', { name: /controlBox\.title/i }));
        fireEvent.click(screen.getByRole('radio', { name: /字幕时间/i }));

        const combobox = screen.getByRole('combobox', { name: /subtitleOrigin\.trackLabel/i });
        expect(combobox.textContent).toContain('subtitleOrigin.localAsr');
        expect(combobox.textContent).not.toContain('.local.srt');
        expect(combobox.textContent).not.toContain('.edited.srt');
        expect(combobox.textContent).not.toContain('.en.srt');
        expect(combobox.textContent).not.toContain('Commencement Keynote');

        // 展开选项确认同类无重名时不带扩展名
        fireEvent.click(combobox);
        expect(screen.getByRole('option', { name: 'subtitleOrigin.userEdited' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'subtitleOrigin.autoAsr' })).toBeInTheDocument();
        usePlaybackSession.getState().clear();
    });

    it('同源存在多条轨道时用干净的语言变体标签消歧（不露出 .en.srt 裸后缀）', async () => {
        const { usePlaybackSession } = await import('@/frontend/features/player/playbackSessionStore');
        usePlaybackSession.setState({
            videoId: 'video-dup',
            videoPath: '/tmp/talk.mp4',
            subtitlePath: '/tmp/talk.en.srt',
            subtitleOrigin: 'auto_asr',
            subtitleTracks: [
                { path: '/tmp/talk.en.srt', fileName: 'talk.en.srt', origin: 'auto_asr', active: true },
                { path: '/tmp/talk.en-orig.srt', fileName: 'talk.en-orig.srt', origin: 'auto_asr', active: false },
            ],
        });

        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        fireEvent.click(screen.getByRole('button', { name: /controlBox\.title/i }));
        fireEvent.click(screen.getByRole('radio', { name: /字幕时间/i }));

        const combobox = screen.getByRole('combobox', { name: /subtitleOrigin\.trackLabel/i });
        fireEvent.click(combobox);
        expect(screen.getByRole('option', { name: 'subtitleOrigin.autoAsr (en)' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'subtitleOrigin.autoAsr (en-orig)' })).toBeInTheDocument();
        usePlaybackSession.getState().clear();
    });

    it('存在人工编辑轨与本地识别基线时，提供两步确认「放弃修订并恢复本地识别」闭环', async () => {
        const { usePlaybackSession } = await import('@/frontend/features/player/playbackSessionStore');
        const localResolution = {
            subtitlePath: '/tmp/talk.local.srt',
            mismatchSuspected: false,
            origin: 'local_asr' as const,
            tracks: [
                { path: '/tmp/talk.local.srt', fileName: 'talk.local.srt', origin: 'local_asr' as const, active: true },
            ],
        };
        mockDiscardEditedSubtitle.mockResolvedValueOnce({
            srt: { fileHash: 'hash-l2', filePath: '/tmp/talk.local.srt', sentences: [] },
            resolution: localResolution,
        });

        usePlaybackSession.setState({
            videoId: 'video-restore',
            videoPath: '/tmp/talk.mp4',
            subtitlePath: '/tmp/talk.edited.srt',
            subtitleOrigin: 'user_edited',
            srtHash: 'hash-l3',
            subtitleTracks: [
                { path: '/tmp/talk.edited.srt', fileName: 'talk.edited.srt', origin: 'user_edited', active: true },
                { path: '/tmp/talk.local.srt', fileName: 'talk.local.srt', origin: 'local_asr', active: false },
            ],
        });

        render(<PlayerSettingsPopover tone="panel" popoverOffset={8} />);
        fireEvent.click(screen.getByRole('button', { name: /controlBox\.title/i }));
        fireEvent.click(screen.getByRole('radio', { name: /字幕时间/i }));

        fireEvent.click(screen.getByTestId('player-restore-baseline-subtitle'));
        expect(screen.getByTestId('player-restore-baseline-confirm-box')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('player-restore-baseline-confirm'));
        await vi.waitFor(() => {
            expect(mockDiscardEditedSubtitle).toHaveBeenCalledWith({
                videoId: 'video-restore',
                videoPath: '/tmp/talk.mp4',
                editedSubtitlePath: '/tmp/talk.edited.srt',
                targetSubtitlePath: '/tmp/talk.local.srt',
                currentFileHash: 'hash-l3',
            });
        });

        await vi.waitFor(() => {
            expect(usePlaybackSession.getState().subtitlePath).toBe('/tmp/talk.local.srt');
            expect(usePlaybackSession.getState().subtitleOrigin).toBe('local_asr');
        });
        usePlaybackSession.getState().clear();
    });
});
