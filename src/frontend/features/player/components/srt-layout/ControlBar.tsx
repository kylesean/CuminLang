import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import VolumeSlider from '../VolumeSlider';
import SpeedSlider from '../SpeedSlider';
import { cn } from '@/frontend/lib/utils';
import useLayout from '@/frontend/app/stores/layoutStore';
import { getRendererLogger } from '@/frontend/log/simple-logger';
import { usePlayer } from '@/frontend/features/player/playerStore';
import { usePlayerUi } from '@/frontend/features/player/playerUiStore';
import FullscreenToggleButton from '@/frontend/features/player/components/subtitles/FullscreenToggleButton';
import ControlBarPinButton from '@/frontend/features/player/components/subtitles/ControlBarPinButton';
import {
    DARK_BAR_BUTTON_HOVER,
    MEDIA_BAR_DIVIDER,
    MEDIA_BAR_GROUP,
    PlaybackNavControls
} from '@/frontend/features/player/components/PlaybackGlobalControls';
import PlaybackBarShell from '@/frontend/features/player/components/PlaybackBarShell';
import HardsubMaskButton from '@/frontend/features/player/components/HardsubMaskButton';
import PodcastModeButton from '@/frontend/features/player/components/PodcastModeButton';
import {
    CONTROL_POPOVER_OFFSET_SINGLE_ROW_BAR,
    CONTROL_POPOVER_OFFSET_STACKED_BAR,
} from '@/frontend/features/player/components/ControlPopover';
import {
    CONTROL_BAR_GAP_PX,
    CONTROL_BAR_PANEL_HEIGHT_PX,
    CONTROL_BAR_ZONE_PX,
} from '@/frontend/features/player/components/controlBarZone';
import { useHardsubMaskBarAdjust } from '@/frontend/features/player/components/hardsubMaskBarLayout';
import {
    PlaybackProgressSlider,
    PlaybackTimeReadout,
} from '@/frontend/features/player/components/PlaybackProgressControls';

const logger = getRendererLogger('PlaybackControlBar');

/**
 * 嵌入式播放控制条组件入参。
 */
export interface PlaybackControlBarProps {
    className?: string;
    onTimeChange?: (time: number) => void;
    /** 视频舞台区存在近期指针活动时唤醒控制条（不局限于底部窄条热区）。 */
    stageActive?: boolean;
}

/**
 * 视频区域底部悬浮的主播放控制栏。
 * 进度条与播放时间高频订阅已被完全隔离在叶子组件中，避免 22Hz 刷新导致整条按钮频繁重渲染。
 */
export default function PlaybackControlBar({
    className = '',
    onTimeChange,
    stageActive = false,
}: PlaybackControlBarProps) {
    const {
        volume,
        playbackRate,
        muted
    } = usePlayer(
        useShallow((state) => ({
            volume: state.volume,
            playbackRate: state.playbackRate,
            muted: state.muted
        }))
    );

    const [previewTime, setPreviewTime] = useState<number | null>(null);
    const [speedMenuOpen, setSpeedMenuOpen] = useState<boolean>(false);
    const [isStackedLayout, setIsStackedLayout] = useState<boolean>(true);
    const fullScreen = useLayout((s) => s.fullScreen);
    const changeFullScreen = useLayout((s) => s.changeFullScreen);
    // 用户钉住后控制条常显，不再受鼠标超时隐藏影响
    const pinned = usePlayerUi((s) => s.controlBarPinned);
    // 遮挡贴片对本条的让位 / 幽灵态 / 抬起量：与全屏条共用同一份判断，只是面板尺寸不同
    const maskAdjust = useHardsubMaskBarAdjust({
        panelHeightPx: CONTROL_BAR_PANEL_HEIGHT_PX,
        zonePx: CONTROL_BAR_ZONE_PX,
        gapPx: CONTROL_BAR_GAP_PX,
    });

    const [mouseOverOut, setMouseOverOut] = useState<boolean>(false);
    // 本条是否该显形：鼠标在舞台活跃 / 停在条上 / 倍速弹层开启 / 用户钉住，且未压在贴片上
    const barVisible = (mouseOverOut || stageActive || speedMenuOpen || pinned) && !maskAdjust.hiddenByMask;

    const onMouseLeave = () => {
        setMouseOverOut(false);
    };

    const handleMouseMoveIn = () => {
        if (!mouseOverOut) {
            setMouseOverOut(true);
        }
    };

    const handleScrubCommit = useCallback((time: number) => {
        logger.debug('time slider commit', { time });
        onTimeChange?.(time);
        usePlayer.getState().setAutoPause(false);
        usePlayer.getState().setSingleRepeat(false);
    }, [onTimeChange]);

    return (
        <div
            style={{ bottom: maskAdjust.liftPx + CONTROL_BAR_GAP_PX }}
            className={cn(
                'w-full flex flex-col-reverse text-media-fg/90 px-4 py-1 pointer-events-none',
                'transition-[bottom] duration-200 ease-out',
                className
            )}
        >
            <PlaybackBarShell
                tone="inline"
                visible={barVisible}
                ghost={maskAdjust.ghost}
                onLayoutModeChange={setIsStackedLayout}
                leading={(
                    <>
                        {/* 上一句 / 播放暂停 / 下一句：与全屏控制条共用同一份控件 */}
                        <PlaybackNavControls />
                        <PlaybackTimeReadout previewTime={previewTime} />
                    </>
                )}
                progress={(
                    <PlaybackProgressSlider
                        tone="media"
                        previewTime={previewTime}
                        onPreviewTimeChange={setPreviewTime}
                        onScrubCommit={handleScrubCommit}
                    />
                )}
                trailing={(
                    <>
                        {/* 「看画面」的模式开关成组：硬字幕遮挡 / 播客 */}
                        <div className={MEDIA_BAR_GROUP}>
                            <HardsubMaskButton />
                            <PodcastModeButton />
                        </div>
                        <span className={MEDIA_BAR_DIVIDER} aria-hidden />
                        {/* 播放工具成组：倍速 / 音量 / 钉住 / 全屏 */}
                        <div className={MEDIA_BAR_GROUP}>
                            <SpeedSlider
                                speed={playbackRate}
                                popoverOffset={isStackedLayout
                                    ? CONTROL_POPOVER_OFFSET_STACKED_BAR
                                    : CONTROL_POPOVER_OFFSET_SINGLE_ROW_BAR}
                                triggerClassName={DARK_BAR_BUTTON_HOVER}
                                onSpeedChange={(speed) => usePlayer.getState().setPlaybackRate(speed)}
                                onMenuOpenChange={setSpeedMenuOpen}
                            />
                            <VolumeSlider
                                tone="media"
                                muted={muted}
                                onMutedChange={(nextMuted) => usePlayer.getState().setMuted(nextMuted)}
                                volume={volume}
                                onVolumeChange={(nextVolume) => usePlayer.getState().setVolume(nextVolume)}
                                triggerClassName={DARK_BAR_BUTTON_HOVER}
                                collapseSliderBelowXl
                            />
                            <ControlBarPinButton />
                            <FullscreenToggleButton fullScreen={fullScreen} changeFullScreen={changeFullScreen} />
                        </div>
                    </>
                )}
                onMouseMove={(e) => {
                    e.stopPropagation();
                    handleMouseMoveIn();
                }}
                onMouseLeave={onMouseLeave}
            />
        </div>
    );
}
