import { useCallback, useState } from 'react';
import { cn } from '@/frontend/lib/utils';
import MainSubtitle from '@/frontend/features/player/components/srt-layout/MainSubtitle';
import OverlayControlBar from './OverlayControlBar';
import { usePlayer } from '@/frontend/features/player/playerStore';

const FullscreenSubtitleOverlay = () => {
    const [{ reserveBottomPx, instant }, setReserve] = useState({
        reserveBottomPx: 104,
        instant: false,
    });

    const handleReserveChange = useCallback((px: number, nextInstant: boolean) => {
        setReserve((prev) => (
            prev.reserveBottomPx === px && prev.instant === nextInstant
                ? prev
                : { reserveBottomPx: px, instant: nextInstant }
        ));
    }, []);

    return (
        <div className={cn('w-full h-full absolute top-0 left-0 z-20 flex flex-col justify-end items-center pointer-events-none')}>
            {/* 为底部悬浮控制条动态预留安全边距，控制条呼出或钉住时自动将整组字幕抬升至控制条上方 */}
            <div
                className={cn(
                    'w-full flex justify-center transition-[padding-bottom] duration-200 ease-out',
                    instant && 'duration-0',
                )}
                style={{ paddingBottom: reserveBottomPx }}
            >
                <MainSubtitle variant="overlay" />
            </div>
            {/* 全屏控制条：上行通栏进度 + 下行完整播放与学习操控 */}
            <OverlayControlBar
                onReserveBottomChange={handleReserveChange}
                onTimeChange={(time) => usePlayer.getState().seekTo({ time })}
            />
        </div>
    );
};

export default FullscreenSubtitleOverlay;
