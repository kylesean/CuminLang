import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import VolumeSlider from '../VolumeSlider';
import { cn } from '@/frontend/lib/utils';
import SpeedSlider from '../SpeedSlider';
import { CONTROL_POPOVER_OFFSET_STACKED_BAR } from '@/frontend/features/player/components/ControlPopover';
import { MonitorPlay } from 'lucide-react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { getRendererLogger } from '@/frontend/log/simple-logger';
import { usePlayer } from '@/frontend/features/player/playerStore';
import { PlaybackNavControls } from '@/frontend/features/player/components/PlaybackGlobalControls';
import PodcastLearningBar from '@/frontend/features/player/components/learning-toolbar/PodcastLearningBar';
import {
    PlaybackProgressSlider,
    PlaybackTimeReadout,
} from '@/frontend/features/player/components/PlaybackProgressControls';
import { setPodcastModeForCurrentVideo } from '@/frontend/features/player/podcastMode';

const logger = getRendererLogger('PodcastControlBar');

/**
 * 播客沉浸式视图控制栏组件入参。
 */
export interface PodcastControlBarProps {
    className?: string;
    onTimeChange?: (time: number) => void;
}

/**
 * 播客沉浸视图底部的统一停靠控制条。
 * 进度条与播放时间订阅已被完全隔离在叶子组件中，避免 22Hz 刷新导致整条按钮频繁重渲染。
 */
export default function PodcastControlBar({
    className = '',
    onTimeChange,
}: PodcastControlBarProps) {
    const { volume, playbackRate, muted } = usePlayer(
        useShallow((s) => ({
            volume: s.volume,
            playbackRate: s.playbackRate,
            muted: s.muted,
        })),
    );

    const { t } = useI18nTranslation('player');
    const [previewTime, setPreviewTime] = useState<number | null>(null);

    const handleScrubCommit = useCallback((time: number) => {
        logger.debug('Podcast time slider scrub commit', { time });
        onTimeChange?.(time);
        usePlayer.getState().seekTo({ time });
        usePlayer.getState().setAutoPause(false);
        usePlayer.getState().setSingleRepeat(false);
    }, [onTimeChange]);

    return (
        <div
            data-testid="podcast-control-bar"
            className={cn(
                'w-full pointer-events-auto border-t border-border/40 bg-body/90 backdrop-blur-md transition-colors duration-300 pb-3.5 pt-2 px-6',
                className
            )}
        >
            <div className="w-full flex flex-col gap-2">
                {/* 铺满宽度的进度条 */}
                <div className="w-full flex items-center">
                    <PlaybackProgressSlider
                        previewTime={previewTime}
                        onPreviewTimeChange={setPreviewTime}
                        onScrubValueChange={(time) => {
                            usePlayer.getState().seekTo({ time });
                            usePlayer.getState().setAutoPause(false);
                            usePlayer.getState().setSingleRepeat(false);
                        }}
                        onScrubCommit={handleScrubCommit}
                        className="cursor-pointer py-1"
                    />
                </div>

                {/* 底部控制项与时间展示：播客播放导航 + 内嵌学习控件 + 倍速/音量/退出 */}
                <div className="w-full flex flex-wrap justify-between items-center gap-x-4 gap-y-2 text-secondary">
                    <div className="flex gap-3 items-center shrink-0">
                        <PlaybackNavControls tone="theme" />
                        <PlaybackTimeReadout
                            previewTime={previewTime}
                            className="flex items-center font-mono text-sm tabular-nums text-secondary"
                            currentClassName="text-primary font-medium"
                            separatorClassName="mx-1.5 opacity-40"
                            durationClassName=""
                            durationWrapperClassName="inline-flex items-center"
                        />
                    </div>

                    <PodcastLearningBar className="shrink-0" />

                    <div className="flex items-center gap-2.5 text-secondary shrink-0">
                        <SpeedSlider
                            speed={playbackRate}
                            popoverOffset={CONTROL_POPOVER_OFFSET_STACKED_BAR}
                            onSpeedChange={(speed) => usePlayer.getState().setPlaybackRate(speed)}
                        />
                        <VolumeSlider
                            muted={muted}
                            onMutedChange={(nextMuted) => usePlayer.getState().setMuted(nextMuted)}
                            volume={volume}
                            onVolumeChange={(nextVolume) => usePlayer.getState().setVolume(nextVolume)}
                        />
                        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border/70" />
                        {/* 播客模式会盖住视频条与学习台，这里必须留一个常显的出口，
                            否则用户只能在自动切换的 5 秒 toast 里点“恢复” */}
                        <button
                            type="button"
                            onClick={() => setPodcastModeForCurrentVideo(false)}
                            title={t('controlBar.exitPodcastHint')}
                            aria-label={t('controlBar.exitPodcast')}
                            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-secondary transition-colors hover:bg-muted hover:text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                            <MonitorPlay className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline whitespace-nowrap">{t('controlBar.exitPodcast')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
