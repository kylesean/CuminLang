import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ALargeSmall,
    AppWindow,
    GripHorizontal,
    Languages,
    Lock,
    Palette,
    Pause,
    Play,
    Repeat1,
    SkipBack,
    SkipForward,
    SunMedium,
    X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/frontend/lib/utils';
import { rendererEvents } from '@/frontend/infrastructure/electron/rendererEvents';
import { desktopLyricsApi } from './desktopLyricsApi';
import {
    type DesktopLyricsFontSize,
    type DesktopLyricsOpacity,
    type DesktopLyricsStylePreset,
    useDesktopLyricsStore,
} from './desktopLyricsStore';

const PRESET_ORDER: DesktopLyricsStylePreset[] = ['frosted', 'outline', 'amber'];
const SIZE_ORDER: DesktopLyricsFontSize[] = ['sm', 'md', 'lg'];
const OPACITY_ORDER: DesktopLyricsOpacity[] = ['low', 'medium', 'high'];

const nextOf = <T,>(items: readonly T[], current: T): T => {
    const idx = items.indexOf(current);
    return items[(idx + 1) % items.length];
};

const BG_CLASSES: Record<DesktopLyricsStylePreset, Record<DesktopLyricsOpacity, string>> = {
    frosted: {
        low: 'bg-media-bg/45 backdrop-blur-md border border-media-fg/10 shadow-lg',
        medium: 'bg-media-bg/70 backdrop-blur-md border border-media-fg/15 shadow-xl',
        high: 'bg-media-matte/90 backdrop-blur-md border border-media-fg/20 shadow-2xl',
    },
    outline: {
        low: 'bg-transparent border border-transparent',
        medium: 'bg-media-bg/20 border border-transparent',
        high: 'bg-media-bg/40 backdrop-blur-xs border border-media-fg/10',
    },
    amber: {
        low: 'bg-media-bg/50 backdrop-blur-md border border-media-amber/20 shadow-lg',
        medium: 'bg-media-bg/75 backdrop-blur-md border border-media-amber/30 shadow-xl',
        high: 'bg-media-matte/90 backdrop-blur-md border border-media-amber/40 shadow-2xl',
    },
};

const EN_SIZE_CLASSES: Record<DesktopLyricsFontSize, string> = {
    sm: 'text-base leading-snug',
    md: 'text-lg leading-snug',
    lg: 'text-xl leading-snug',
};

const ZH_SIZE_CLASSES: Record<DesktopLyricsFontSize, string> = {
    sm: 'text-metadata leading-snug',
    md: 'text-sm leading-snug',
    lg: 'text-base leading-snug',
};

const CONTROL_BTN_CLASS =
    'flex h-7 w-7 items-center justify-center rounded-md text-media-fg/80 hover:bg-media-fg/15 hover:text-media-fg transition-colors cursor-pointer shrink-0';

/**
 * 独立透明悬浮“桌面整句字幕”窗口视图（路由 `#/desktop-lyrics`）。
 *
 * 设计要点：
 * - 非侵入式：默认 `focusable: false`，日常只保留紧凑控制条于悬停时浮现；
 * - 一键穿透：点击锁定图标后鼠标事件穿透至底层窗口，不影响工作区任何操作；
 * - 跨桌面拖拽：通过 `screenX/screenY` 位移调用主进程 `move-by`，兼容 Wayland/X11/macOS/Windows。
 */
export default function DesktopLyricsPage() {
    const { t } = useTranslation('player');
    const locked = useDesktopLyricsStore((s) => s.locked);
    const snapshot = useDesktopLyricsStore((s) => s.snapshot);
    const prefs = useDesktopLyricsStore((s) => s.prefs);
    const applyPayload = useDesktopLyricsStore((s) => s.applyPayload);
    const applyWindowState = useDesktopLyricsStore((s) => s.applyWindowState);
    const updatePrefs = useDesktopLyricsStore((s) => s.updatePrefs);
    const [hovered, setHovered] = useState(false);

    const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
    const pendingDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
    const rafRef = useRef<number | null>(null);

    // 透明窗口根节点去底色，避免主应用主题 bg-body 盖住透明合成层
    useEffect(() => {
        const prevHtmlBg = document.documentElement.style.background;
        const prevBodyBg = document.body.style.background;
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        return () => {
            document.documentElement.style.background = prevHtmlBg;
            document.body.style.background = prevBodyBg;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        void desktopLyricsApi.getState()
            .then((payload) => {
                if (!cancelled) {
                    applyPayload(payload);
                }
            })
            .catch(() => undefined);

        const unsub = rendererEvents.onDesktopLyricsSync((payload) => {
            applyPayload(payload);
        });
        return () => {
            cancelled = true;
            unsub();
        };
    }, [applyPayload]);

    const flushDragDelta = useCallback(() => {
        rafRef.current = null;
        const { dx, dy } = pendingDeltaRef.current;
        if (dx === 0 && dy === 0) return;
        pendingDeltaRef.current = { dx: 0, dy: 0 };
        void desktopLyricsApi.moveBy(dx, dy).catch(() => undefined);
    }, []);

    const handleDragPointerDown = (event: React.PointerEvent<HTMLElement>) => {
        if (locked || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragOriginRef.current = { x: event.screenX, y: event.screenY };
    };

    const handleDragPointerMove = (event: React.PointerEvent<HTMLElement>) => {
        if (!dragOriginRef.current) return;
        const dx = event.screenX - dragOriginRef.current.x;
        const dy = event.screenY - dragOriginRef.current.y;
        dragOriginRef.current = { x: event.screenX, y: event.screenY };
        pendingDeltaRef.current.dx += dx;
        pendingDeltaRef.current.dy += dy;
        if (rafRef.current === null) {
            rafRef.current = window.requestAnimationFrame(flushDragDelta);
        }
    };

    const handleDragPointerUp = (event: React.PointerEvent<HTMLElement>) => {
        if (!dragOriginRef.current) return;
        dragOriginRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        flushDragDelta();
    };

    const sendCommand = (type: Parameters<typeof desktopLyricsApi.sendCommand>[0]) => {
        void desktopLyricsApi.sendCommand(type).catch(() => undefined);
    };

    const handleLock = () => {
        setHovered(false);
        void desktopLyricsApi.setLocked(true)
            .then((next) => applyWindowState(next))
            .catch(() => undefined);
    };

    const handleClose = () => {
        void desktopLyricsApi.toggle(false)
            .then((next) => applyWindowState(next))
            .catch(() => undefined);
    };

    const showControls = !locked && hovered;
    const isOutline = prefs.preset === 'outline';
    const hasSentence = Boolean(snapshot.text.trim());
    const showTranslationLine = prefs.showTranslation && Boolean(snapshot.translation.trim());

    const presetLabel = {
        frosted: t('desktopLyrics.presetFrosted', { defaultValue: '磨砂底板' }),
        outline: t('desktopLyrics.presetOutline', { defaultValue: '极简通透' }),
        amber: t('desktopLyrics.presetAmber', { defaultValue: '琥珀高亮' }),
    }[prefs.preset];

    return (
        <div
            data-testid="desktop-lyrics-root"
            onMouseEnter={() => { if (!locked) setHovered(true); }}
            onMouseLeave={() => {
                setHovered(false);
                dragOriginRef.current = null;
            }}
            className="flex h-screen w-screen flex-col items-center justify-end p-2 select-none bg-transparent"
        >
            {/* 顶部紧凑互动控制条：仅未锁定且悬停时露出，零日常遮挡 */}
            <div
                className={cn(
                    'mb-1.5 flex items-center gap-0.5 rounded-full border border-media-fg/15 bg-media-bg/85 px-2 py-1 backdrop-blur-md shadow-lg transition-all duration-150',
                    showControls ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-1 pointer-events-none',
                )}
            >
                <button
                    type="button"
                    onPointerDown={handleDragPointerDown}
                    onPointerMove={handleDragPointerMove}
                    onPointerUp={handleDragPointerUp}
                    onPointerCancel={handleDragPointerUp}
                    title={t('desktopLyrics.dragHint', { defaultValue: '按住拖动位置' })}
                    aria-label={t('desktopLyrics.dragHint', { defaultValue: '按住拖动位置' })}
                    className={cn(CONTROL_BTN_CLASS, 'cursor-grab active:cursor-grabbing')}
                >
                    <GripHorizontal className="h-4 w-4" />
                </button>

                <span className="mx-0.5 h-3.5 w-px bg-media-fg/15" />

                <button
                    type="button"
                    onClick={() => sendCommand('prev-sentence')}
                    title={t('controlBar.prevSentence')}
                    aria-label={t('controlBar.prevSentence')}
                    className={CONTROL_BTN_CLASS}
                >
                    <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => sendCommand('toggle-play')}
                    title={snapshot.playing ? t('controlBar.pause') : t('controlBar.play')}
                    aria-label={snapshot.playing ? t('controlBar.pause') : t('controlBar.play')}
                    className={cn(CONTROL_BTN_CLASS, 'bg-media-fg/15 text-media-fg')}
                >
                    {snapshot.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
                </button>
                <button
                    type="button"
                    onClick={() => sendCommand('next-sentence')}
                    title={t('controlBar.nextSentence')}
                    aria-label={t('controlBar.nextSentence')}
                    className={CONTROL_BTN_CLASS}
                >
                    <SkipForward className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => sendCommand('toggle-single-repeat')}
                    title={t('controlBar.modeSingleRepeat')}
                    aria-label={t('controlBar.modeSingleRepeat')}
                    aria-pressed={snapshot.singleRepeat}
                    className={cn(
                        CONTROL_BTN_CLASS,
                        snapshot.singleRepeat && 'bg-media-amber/25 text-media-amber',
                    )}
                >
                    <Repeat1 className="h-3.5 w-3.5" />
                </button>

                <span className="mx-0.5 h-3.5 w-px bg-media-fg/15" />

                <button
                    type="button"
                    onClick={() => updatePrefs({ showTranslation: !prefs.showTranslation })}
                    title={t('desktopLyrics.toggleTranslation', { defaultValue: '显示/隐藏中文译文' })}
                    aria-label={t('desktopLyrics.toggleTranslation', { defaultValue: '显示/隐藏中文译文' })}
                    aria-pressed={prefs.showTranslation}
                    className={cn(
                        CONTROL_BTN_CLASS,
                        prefs.showTranslation && 'bg-media-fg/15 text-media-fg',
                    )}
                >
                    <Languages className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => updatePrefs({ preset: nextOf(PRESET_ORDER, prefs.preset) })}
                    title={`${t('desktopLyrics.cycleStyle', { defaultValue: '切换样式' })}：${presetLabel}`}
                    aria-label={t('desktopLyrics.cycleStyle', { defaultValue: '切换样式' })}
                    className={CONTROL_BTN_CLASS}
                >
                    <Palette className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => updatePrefs({ fontSize: nextOf(SIZE_ORDER, prefs.fontSize) })}
                    title={t('desktopLyrics.cycleSize', { defaultValue: '切换字号' })}
                    aria-label={t('desktopLyrics.cycleSize', { defaultValue: '切换字号' })}
                    className={CONTROL_BTN_CLASS}
                >
                    <ALargeSmall className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => updatePrefs({ opacity: nextOf(OPACITY_ORDER, prefs.opacity) })}
                    title={t('desktopLyrics.cycleOpacity', { defaultValue: '调节透明度' })}
                    aria-label={t('desktopLyrics.cycleOpacity', { defaultValue: '调节透明度' })}
                    className={CONTROL_BTN_CLASS}
                >
                    <SunMedium className="h-3.5 w-3.5" />
                </button>

                <span className="mx-0.5 h-3.5 w-px bg-media-fg/15" />

                <button
                    type="button"
                    onClick={handleLock}
                    title={t('desktopLyrics.lockClickThrough', { defaultValue: '锁定鼠标穿透（从托盘或主窗口可解锁）' })}
                    aria-label={t('desktopLyrics.lockClickThrough', { defaultValue: '锁定鼠标穿透' })}
                    className={CONTROL_BTN_CLASS}
                >
                    <Lock className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => sendCommand('focus-main')}
                    title={t('desktopLyrics.focusMain', { defaultValue: '回到主窗口' })}
                    aria-label={t('desktopLyrics.focusMain', { defaultValue: '回到主窗口' })}
                    className={CONTROL_BTN_CLASS}
                >
                    <AppWindow className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={handleClose}
                    title={t('desktopLyrics.close', { defaultValue: '关闭桌面字幕' })}
                    aria-label={t('desktopLyrics.close', { defaultValue: '关闭桌面字幕' })}
                    className={CONTROL_BTN_CLASS}
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* 整句展示主卡片：支持在内容区域直接拖拽移动 */}
            <div
                onPointerDown={handleDragPointerDown}
                onPointerMove={handleDragPointerMove}
                onPointerUp={handleDragPointerUp}
                onPointerCancel={handleDragPointerUp}
                className={cn(
                    'w-full max-w-full rounded-2xl px-5 py-3 text-center transition-colors duration-150',
                    !locked && 'cursor-grab active:cursor-grabbing',
                    BG_CLASSES[prefs.preset][prefs.opacity],
                )}
            >
                {hasSentence ? (
                    <div className="flex flex-col items-center gap-1">
                        <p
                            className={cn(
                                'font-medium tracking-normal line-clamp-2 break-words',
                                EN_SIZE_CLASSES[prefs.fontSize],
                                prefs.preset === 'amber' ? 'text-media-amber' : 'text-media-fg',
                                isOutline && '[text-shadow:0_2px_8px_rgba(0,0,0,0.92),0_0_2px_rgba(0,0,0,0.98)]',
                            )}
                        >
                            {snapshot.text}
                        </p>
                        {showTranslationLine && (
                            <p
                                className={cn(
                                    'font-normal line-clamp-1 break-words text-media-fg/80',
                                    ZH_SIZE_CLASSES[prefs.fontSize],
                                    isOutline && '[text-shadow:0_1px_6px_rgba(0,0,0,0.9),0_0_2px_rgba(0,0,0,0.95)]',
                                )}
                            >
                                {snapshot.translation}
                            </p>
                        )}
                    </div>
                ) : (
                    <p
                        className={cn(
                            'text-sm font-medium text-media-fg/70',
                            isOutline && '[text-shadow:0_1px_6px_rgba(0,0,0,0.9)]',
                        )}
                    >
                        {snapshot.hasMedia
                            ? t('desktopLyrics.waitingSentence', { defaultValue: '当前位置暂无字幕句' })
                            : t('desktopLyrics.noMedia', { defaultValue: '在主窗口打开视频或音频后，这里将同步当前正在学习的整句' })}
                    </p>
                )}
            </div>
        </div>
    );
}
