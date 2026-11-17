import { useEffect, useRef, type MouseEventHandler, type ReactNode } from 'react';
import { cn } from '@/frontend/lib/utils';

export type PlaybackBarTone = 'inline' | 'overlay';

/**
 * 窗口内嵌控制条的响应式行布局。
 *
 * - `inline`（普通视图）仅有看画面工具，宽于 760px 进入单行，窄于 760px 自动折为双行；
 * - `overlay`（全屏浮层）收纳完整学习与播放控制，固定采用「上行通栏进度条 + 下行操控栏」双行结构，
 *   确保进度条在全屏所有分辨率下都能拥有足够拖拽精度，且弹层不会与进度条碰撞。
 */
const INLINE_SINGLE_ROW_CLASSES = {
    gap: '@[760px]:gap-x-2.5',
    leading: '@[760px]:row-start-1',
    progress: '@[760px]:col-span-1 @[760px]:col-start-2',
    trailing: '@[760px]:row-start-1 @[760px]:gap-2',
} as const;

const INLINE_SINGLE_ROW_BREAKPOINT_PX = 760;

export interface PlaybackBarShellProps {
    /** 窗口内控制条或全屏浮层控制条。 */
    tone: PlaybackBarTone;
    /** 是否处于可交互的显形状态。 */
    visible: boolean;
    /** 遮挡贴片拖动期间降为半透明替身。 */
    ghost?: boolean;
    /** 左侧播放导航与时间。 */
    leading: ReactNode;
    /** 进度条；宽面板居中，窄面板/全屏独占一行。 */
    progress: ReactNode;
    /** 右侧按钮组。 */
    trailing: ReactNode;
    className?: string;
    onMouseMove?: MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: MouseEventHandler<HTMLDivElement>;
    /** 当前是否处于双行堆叠模式，供宿主选择匹配的二级弹层 offset。 */
    onLayoutModeChange?: (isStacked: boolean) => void;
}

/**
 * 播放控制条的共享外壳。
 */
export default function PlaybackBarShell({
    tone,
    visible,
    ghost = false,
    leading,
    progress,
    trailing,
    className,
    onMouseMove,
    onMouseLeave,
    onLayoutModeChange,
}: PlaybackBarShellProps) {
    const shellRef = useRef<HTMLDivElement>(null);
    const singleRow = tone === 'inline' ? INLINE_SINGLE_ROW_CLASSES : null;

    useEffect(() => {
        if (!onLayoutModeChange) return;
        if (tone === 'overlay') {
            onLayoutModeChange(true);
            return;
        }
        const el = shellRef.current;
        if (!el || typeof ResizeObserver === 'undefined') {
            onLayoutModeChange(false);
            return;
        }
        const sync = () => {
            const width = el.clientWidth;
            onLayoutModeChange(width > 0 && width < INLINE_SINGLE_ROW_BREAKPOINT_PX);
        };
        sync();
        const observer = new ResizeObserver(sync);
        observer.observe(el);
        return () => observer.disconnect();
    }, [tone, onLayoutModeChange]);

    return (
        <div
            ref={shellRef}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            className={cn(
                '@container relative z-20 w-full border bg-media-bg/60 text-media-fg/90 shadow-2xl backdrop-blur-md transition-[opacity,transform] duration-200 ease-out',
                tone === 'inline'
                    ? 'rounded-2xl border-media-fg/15 px-2 py-2.5 @[760px]:px-4'
                    : 'max-w-7xl rounded-2xl border-media-fg/15 px-4 py-2',
                ghost
                    ? 'pointer-events-none opacity-40'
                    : visible
                    ? 'pointer-events-auto translate-y-0 opacity-100'
                    : cn('pointer-events-none opacity-0', tone === 'overlay' && 'translate-y-2'),
                className,
            )}
        >
            <div
                className={cn(
                    'grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5',
                    singleRow?.gap,
                )}
            >
                <div
                    className={cn(
                        'col-start-1 row-start-2 flex min-w-0 items-center gap-2',
                        singleRow?.leading,
                    )}
                >
                    {leading}
                </div>
                <div
                    className={cn(
                        'col-span-3 col-start-1 row-start-1 min-w-0',
                        singleRow?.progress,
                    )}
                >
                    {progress}
                </div>
                <div
                    className={cn(
                        'col-start-3 row-start-2 flex min-w-0 items-center justify-end gap-1',
                        singleRow?.trailing,
                    )}
                >
                    {trailing}
                </div>
            </div>
        </div>
    );
}
