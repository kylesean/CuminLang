import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useSpring } from 'framer-motion';
import { AudioLines, BookOpen, Eye, EyeOff } from 'lucide-react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { cn } from '@/frontend/lib/utils';
import useLayout from '@/frontend/app/stores/layoutStore';
import { usePlayer } from '@/frontend/features/player/playerStore';
import { usePlayerUi } from '@/frontend/features/player/playerUiStore';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import type { Sentence } from '@/common/types/SentenceC';
import TranslatableLinePodcast from './TranslatableLinePodcast';
import PodcastControlBar from './PodcastControlBar';
import SourceBadge from './SourceBadge';
import SubtitleGenerationPanel from '@/frontend/features/player/components/srt-layout/SubtitleGenerationPanel';
import StrUtil from '@/common/utils/str-util';
import FuncUtil from '@/common/utils/func-util';
import { useWordPopoverStore } from '@/frontend/features/player/components/translatable-line/wordPopoverStore';
import useTranslation from '@/frontend/features/player/translationStore';
import { PLAYER_UI_TESTIDS } from '@/common/constants/qa-testids';

const AUDIO_PULSE_BARS = [
    { key: 'b1', idleScale: 0.45, frames: [0.45, 0.95, 0.55, 0.85, 0.45], duration: 1.05 },
    { key: 'b2', idleScale: 0.8, frames: [0.85, 0.4, 1, 0.5, 0.85], duration: 0.92 },
    { key: 'b3', idleScale: 0.55, frames: [0.55, 0.9, 0.42, 0.78, 0.55], duration: 1.15 },
] as const;

const BLIND_PLACEHOLDER_WIDTHS = ['w-44', 'w-60', 'w-48'] as const;

/**
 * 极简三竖条音频律动指示：播放时温和呼吸，暂停或开启减弱动态时立刻静止，避免高频频谱干扰阅读。
 */
const PodcastAudioPulse = memo(function PodcastAudioPulse({
    playing,
    reducedMotion,
}: {
    playing: boolean;
    reducedMotion: boolean;
}) {
    const animate = playing && !reducedMotion;
    return (
        <span aria-hidden="true" className="inline-flex h-3.5 w-3.5 items-end justify-center gap-0.5 shrink-0">
            {AUDIO_PULSE_BARS.map((bar) => (
                <motion.span
                    key={bar.key}
                    className="h-full w-0.5 origin-bottom rounded-full bg-accent"
                    initial={false}
                    animate={{ scaleY: animate ? [...bar.frames] : bar.idleScale }}
                    transition={
                        animate
                            ? { duration: bar.duration, repeat: Infinity, ease: 'easeInOut' }
                            : { duration: 0.2 }
                    }
                />
            ))}
        </span>
    );
});

/**
 * 隔离 22Hz 高频订阅的句内进度细线：让 8-12 秒长句保有安静的时间推进感，不干扰按意群扫视。
 */
const PodcastSentenceProgressBar = memo(function PodcastSentenceProgressBar({
    startTime,
    endTime,
}: {
    startTime: number;
    endTime: number;
}) {
    const playTime = usePlayer((s) => s.internal.exactPlayTime);
    const safeStart = Number.isFinite(startTime) ? startTime : 0;
    const safeEnd = Number.isFinite(endTime) ? endTime : safeStart;
    const span = Math.max(safeEnd - safeStart, 0.25);
    const rawProgress = Number.isFinite(playTime) ? (playTime - safeStart) / span : 0;
    const progress = Math.min(Math.max(rawProgress, 0), 1);

    return (
        <div
            aria-hidden="true"
            data-testid={PLAYER_UI_TESTIDS.podcastSentenceProgress}
            className="mx-auto mt-5 h-0.5 w-32 overflow-hidden rounded-full bg-border/50"
        >
            <div
                className="h-full w-full origin-left bg-accent/80 transition-transform duration-75 ease-linear"
                style={{ transform: `scaleX(${progress})` }}
            />
        </div>
    );
});

/**
 * 播客视图顶部轻语境条：呈现播放微律动、句序位置、盲听模式与文稿侧栏开关。
 */
function PodcastTopBar({
    currentIndex,
    totalCount,
    mediaTitle,
    playing,
    reducedMotion,
}: {
    currentIndex: number;
    totalCount: number;
    mediaTitle: string;
    playing: boolean;
    reducedMotion: boolean;
}) {
    const { t } = useI18nTranslation('player');
    const podcastBlindMode = usePlayerUi((s) => s.podcastBlindMode);
    const togglePodcastBlindMode = usePlayerUi((s) => s.togglePodcastBlindMode);
    const podcastTranscriptVisible = useLayout((s) => s.podcastTranscriptVisible);
    const togglePodcastTranscript = useLayout((s) => s.togglePodcastTranscript);

    const padWidth = String(Math.max(totalCount, 1)).length;
    const formattedIndex = `${String(currentIndex + 1).padStart(padWidth, '0')} / ${String(totalCount).padStart(padWidth, '0')}`;

    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 px-6 py-3">
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-border/50 bg-body/80 px-3 py-1 backdrop-blur-md">
                <PodcastAudioPulse playing={playing} reducedMotion={reducedMotion} />
                <span
                    data-testid={PLAYER_UI_TESTIDS.podcastSentenceCounter}
                    aria-label={t('podcast.sentenceCounter', { current: currentIndex + 1, total: totalCount })}
                    className="font-mono text-xs font-medium tabular-nums text-secondary"
                >
                    {formattedIndex}
                </span>
                {mediaTitle && (
                    <>
                        <span aria-hidden="true" className="h-3 w-px bg-border/70 hidden sm:inline-block" />
                        <span className="hidden sm:inline max-w-[220px] truncate text-xs text-secondary/80">
                            {mediaTitle}
                        </span>
                    </>
                )}
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
                <Tooltip content={t('podcast.blindListeningHint')} placement="below">
                    <button
                        type="button"
                        data-testid={PLAYER_UI_TESTIDS.podcastBlindToggle}
                        aria-pressed={podcastBlindMode}
                        onClick={togglePodcastBlindMode}
                        className={cn(
                            'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors cursor-pointer',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                            podcastBlindMode
                                ? 'border-accent/40 bg-accent/12 text-accent'
                                : 'border-border/60 bg-body/80 text-secondary hover:bg-surface hover:text-primary backdrop-blur-md'
                        )}
                    >
                        {podcastBlindMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span className="whitespace-nowrap">{t('podcast.blindListening')}</span>
                    </button>
                </Tooltip>

                <Tooltip
                    content={t(podcastTranscriptVisible ? 'controlButton.closeTranscript' : 'controlButton.openTranscript')}
                    placement="below"
                >
                    <button
                        type="button"
                        data-testid={PLAYER_UI_TESTIDS.podcastTranscriptToggle}
                        aria-pressed={podcastTranscriptVisible}
                        onClick={togglePodcastTranscript}
                        className={cn(
                            'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors cursor-pointer',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                            podcastTranscriptVisible
                                ? 'border-accent/40 bg-accent/12 text-accent'
                                : 'border-border/60 bg-body/80 text-secondary hover:bg-surface hover:text-primary backdrop-blur-md'
                        )}
                    >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span className="whitespace-nowrap">{t('subtitleScript', { defaultValue: '字幕文稿' })}</span>
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}

/**
 * 播客沉浸式听读主视图。
 * 居中呈现当前焦点句与柔化景深上下文，支持盲听防剧透、句内时间细线与底部统一停靠控制条。
 */
const PodcastViewer = ({ className }: { className?: string }) => {
    const { t } = useI18nTranslation('player');
    const current: Sentence | null = usePlayer((s) => s.currentSentence);
    const sentences = usePlayer((s) => s.sentences);
    const playing = usePlayer((s) => s.playing);
    const hasSubTitle = usePlaybackSession((s) => StrUtil.isNotBlank(s.subtitlePath));
    const videoPath = usePlaybackSession((s) => s.videoPath);
    const mediaTitle = videoPath ? (videoPath.split(/[\\/]/).pop() ?? '') : '';

    const translationKey = current?.translationKey || '';
    const newTranslation = useTranslation((state) => state.translations.get(translationKey)) || '';

    const showCn = usePlayerUi((s) => s.showCn);
    const showSourceZh = usePlayerUi((s) => s.showSourceZh);
    const podcastBlindMode = usePlayerUi((s) => s.podcastBlindMode);
    const srtTender = usePlayer((s) => s.srtTender);
    const clearAdjust = () => { void usePlayer.getState().clearAdjust(); };

    // 按当前句 key 记录点击解锁，切到下一句时无需 effect 自动回到盲听遮罩，避免闪帧；
    // 同时支持按住反斜杠 `\` 键盘临时窥视（与听写模式保持一致的肌肉记忆）。
    const [hoverPeeking, setHoverPeeking] = useState(false);
    const [keyPeeking, setKeyPeeking] = useState(false);
    const [peekLockedKey, setPeekLockedKey] = useState<string | null>(null);
    const wordPopoverOpen = useWordPopoverStore((s) => s.open);
    const isPeekLocked = current !== null && peekLockedKey === current.key;
    const isCurrentRevealed = !podcastBlindMode || hoverPeeking || keyPeeking || isPeekLocked || wordPopoverOpen;

    useEffect(() => {
        const isEditableTarget = (target: EventTarget | null): boolean => {
            if (!(target instanceof HTMLElement)) return false;
            const tag = target.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!usePlayerUi.getState().podcastBlindMode) return;
            if (e.code === 'Backslash' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
                if (isEditableTarget(e.target)) return;
                e.preventDefault();
                setKeyPeeking(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Backslash') {
                setKeyPeeking(false);
            }
        };
        const resetKeyPeek = () => setKeyPeeking(false);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', resetKeyPeek);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', resetKeyPeek);
        };
    }, []);

    const viewerContainerRef = useRef<HTMLDivElement>(null);
    const activeItemRef = useRef<HTMLDivElement>(null);
    const prefersReducedMotion = Boolean(useReducedMotion());

    // 针对高刷屏调校的阻尼弹簧（尊重系统减弱动画偏好）
    const springY = useSpring(0, prefersReducedMotion ? {
        stiffness: 10000,
        damping: 1000,
        mass: 0.1,
    } : {
        stiffness: 340,
        damping: 32,
        mass: 0.6,
        restDelta: 0.2
    });

    const currentIndex = current
        ? sentences.findIndex((x) => x.index === current.index && x.fileHash === current.fileHash)
        : -1;

    const recenterActiveSentence = useCallback(() => {
        if (!viewerContainerRef.current || !activeItemRef.current) return;
        const container = viewerContainerRef.current;
        const activeElem = activeItemRef.current;
        const availableHeight = Math.max(container.clientHeight - 96, 120);
        const viewportCenter = availableHeight * 0.45;
        const targetY = -(activeElem.offsetTop + activeElem.offsetHeight / 2 - viewportCenter);
        springY.set(targetY);
    }, [springY]);

    // 零延迟测量：将当前焦点句几何中心对齐到扣除底部控制条后的可用视口焦点区
    useLayoutEffect(() => {
        if (!current) return;
        recenterActiveSentence();
    }, [current, newTranslation, showCn, showSourceZh, podcastBlindMode, isCurrentRevealed, recenterActiveSentence]);

    // 容器尺寸变化（如窗口缩放、展开/收起侧栏文稿）时自动重算居中位置
    useEffect(() => {
        const container = viewerContainerRef.current;
        if (!container || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => {
            recenterActiveSentence();
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [recenterActiveSentence]);

    if (!current || !srtTender) {
        return (
            <div
                className={cn(
                    'relative flex h-full w-full items-center justify-center overflow-hidden',
                    'bg-body transition-colors duration-300',
                    className
                )}
            >
                <div className="flex flex-col items-center justify-center gap-3 px-6 pb-24 text-center">
                    {!hasSubTitle ? (
                        <SubtitleGenerationPanel />
                    ) : (
                        <>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-surface text-accent shadow-xs">
                                <AudioLines className="h-5 w-5" />
                            </div>
                            {mediaTitle && (
                                <p className="max-w-md truncate text-sm font-medium text-primary">
                                    {mediaTitle}
                                </p>
                            )}
                            <p className="text-sm text-secondary">
                                {t('podcast.loadingSubtitles')}
                            </p>
                        </>
                    )}
                </div>
                {/* 没有字幕也要保留控制条：保证用户在任何空态都有明确退出路径 */}
                <PodcastControlBar className="absolute left-0 bottom-0 z-30" />
            </div>
        );
    }

    const hasAiZh = showCn && !StrUtil.isBlank(newTranslation);
    const hasSourceZh = showSourceZh && !StrUtil.isBlank(current.textZH);
    const hasMultipleZh = hasAiZh && hasSourceZh;
    const activeTimeRange = typeof srtTender.mapSeekTime === 'function'
        ? srtTender.mapSeekTime(current)
        : { start: current.adjustedStart ?? current.start, end: current.adjustedEnd ?? current.end };

    return (
        <div
            ref={viewerContainerRef}
            className={cn(
                'relative h-full w-full overflow-hidden select-none',
                'bg-body transition-colors duration-300',
                className
            )}
        >
            {/* 顶部轻语境条：句序游标 + 盲听与文稿开关 */}
            <PodcastTopBar
                currentIndex={Math.max(currentIndex, 0)}
                totalCount={sentences.length}
                mediaTitle={mediaTitle}
                playing={playing}
                reducedMotion={prefersReducedMotion}
            />

            {/* 上下方渐变柔化遮罩 */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-body via-body/85 to-transparent z-20" />
            <div className="pointer-events-none absolute inset-x-0 bottom-20 h-32 bg-gradient-to-t from-body via-body/85 to-transparent z-20" />

            {/* 硬件合成沉浸字幕流 */}
            <motion.div
                style={{ y: springY }}
                className="absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-6 px-6 md:px-8 pt-[44vh] pb-[60vh] will-change-transform pointer-events-none"
            >
                {sentences.map((sentence, idx) => {
                    const isCurrent = sentence.key === current.key;
                    const dist = Math.abs(idx - currentIndex);

                    if (dist > 12) {
                        return <div key={sentence.key} className="w-full h-10" />;
                    }

                    // 温和景深梯度：保留相邻上下文余光预读清晰度，避免重影干扰
                    const opacity = isCurrent ? 1 : dist === 1 ? 0.58 : dist === 2 ? 0.3 : 0.14;
                    const scale = isCurrent ? 1 : dist === 1 ? 0.94 : dist === 2 ? 0.88 : 0.84;
                    const blur = isCurrent ? 0 : dist === 1 ? 0.4 : dist === 2 ? 1.0 : 1.6;

                    if (isCurrent) {
                        return (
                            <div
                                key={sentence.key}
                                ref={activeItemRef}
                                onMouseEnter={() => {
                                    if (podcastBlindMode) setHoverPeeking(true);
                                }}
                                onMouseLeave={() => {
                                    if (podcastBlindMode) setHoverPeeking(false);
                                }}
                                className="w-full max-w-2xl px-6 py-2 text-center pointer-events-auto rounded-2xl origin-center"
                            >
                                {isCurrentRevealed ? (
                                    <>
                                        <TranslatableLinePodcast
                                            className="text-2xl sm:text-3xl md:text-podcast font-bold leading-relaxed tracking-tight text-primary transition-colors duration-300"
                                            adjusted={srtTender.adjusted(current) ?? false}
                                            clearAdjust={clearAdjust}
                                            sentence={sentence}
                                        />

                                        {hasAiZh && (
                                            <div className="mt-4 flex items-baseline justify-center gap-2 text-xl md:text-2xl font-normal text-secondary leading-relaxed">
                                                {hasMultipleZh && <SourceBadge source="ai" />}
                                                <span>{newTranslation}</span>
                                            </div>
                                        )}
                                        {hasSourceZh && (
                                            <div className={cn(
                                                'flex items-baseline justify-center gap-2 font-normal text-secondary/85 leading-relaxed',
                                                hasMultipleZh ? 'mt-2 text-lg md:text-xl' : 'mt-4 text-xl md:text-2xl'
                                            )}>
                                                {hasMultipleZh && <SourceBadge source="source" />}
                                                <span>{current.textZH}</span>
                                            </div>
                                        )}

                                        <PodcastSentenceProgressBar
                                            startTime={activeTimeRange.start}
                                            endTime={activeTimeRange.end}
                                        />

                                        {podcastBlindMode && isPeekLocked && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPeekLockedKey(null);
                                                    setHoverPeeking(false);
                                                }}
                                                className="mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-secondary hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors cursor-pointer"
                                            >
                                                <EyeOff className="h-3 w-3" />
                                                <span>{t('podcast.blindHide')}</span>
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        data-testid="podcast-blind-veil"
                                        onClick={() => setPeekLockedKey(current.key)}
                                        className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 bg-surface/65 px-6 py-7 text-center transition-colors hover:border-border hover:bg-surface cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-secondary">
                                            <EyeOff className="h-4 w-4" />
                                        </div>
                                        <p className="text-base font-medium text-primary">
                                            {t('podcast.blindPrompt')}
                                        </p>
                                        <p className="text-xs text-secondary">
                                            {t('podcast.blindHint')}
                                        </p>
                                        <PodcastSentenceProgressBar
                                            startTime={activeTimeRange.start}
                                            endTime={activeTimeRange.end}
                                        />
                                    </button>
                                )}
                            </div>
                        );
                    }

                    const placeholderWidth = BLIND_PLACEHOLDER_WIDTHS[idx % BLIND_PLACEHOLDER_WIDTHS.length];

                    return (
                        <div
                            key={sentence.key}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                                usePlayer.getState().gotoSentence(sentence);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    usePlayer.getState().gotoSentence(sentence);
                                }
                            }}
                            style={{
                                transform: `scale(${scale})`,
                                opacity: podcastBlindMode ? opacity * 0.6 : opacity,
                                filter: !prefersReducedMotion && blur > 0 ? `blur(${blur}px)` : 'none',
                            }}
                            className={cn(
                                'w-full max-w-2xl px-6 py-2 text-center pointer-events-auto cursor-pointer rounded-2xl origin-center',
                                !prefersReducedMotion && 'transition-[transform,opacity,filter] duration-300 ease-out will-change-transform will-change-[filter]',
                                'hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
                            )}
                        >
                            {podcastBlindMode ? (
                                <div aria-hidden="true" className="flex justify-center py-3">
                                    <span className={cn('h-3 rounded-full bg-secondary/20', placeholderWidth)} />
                                </div>
                            ) : (
                                <TranslatableLinePodcast
                                    className="text-2xl sm:text-3xl md:text-podcast font-normal leading-relaxed tracking-tight text-secondary/75 transition-colors duration-300"
                                    adjusted={false}
                                    clearAdjust={FuncUtil.blank}
                                    sentence={sentence}
                                />
                            )}
                        </div>
                    );
                })}
            </motion.div>

            {/* 统一底部停靠控制条 */}
            <PodcastControlBar className="absolute left-0 bottom-0 z-30" />
        </div>
    );
};

export default PodcastViewer;
