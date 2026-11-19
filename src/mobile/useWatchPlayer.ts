import React from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { MobileSubtitleLine, MobileWatchDetail } from '@/common/contracts/mobile-web';
import { mobileApi } from './api';
import SubtitleTender from './subtitleTender';
import type { PositionChannel } from './VideoBar';
import { type AppTheme, applyTheme, readTheme, saveTheme } from './theme';
import {
    PREF_KEYS,
    loadBoolPref,
    loadSpeedPref,
    savePref,
    tapFeedback,
} from './lib';
import {
    toggleMobileSentenceEndMode,
    type MobileSentenceEndMode,
} from './watch-player/mobile-sentence-end';
import { useSubtitleFollowScroll } from './watch-player/useSubtitleFollowScroll';
import { type DictionaryState, useWatchDictionary } from './watch-player/useWatchDictionary';
import { useWatchTranslations } from './watch-player/useWatchTranslations';

export type { DictionaryState };

const createPositionStore = () => {
    let value = 0;
    const listeners = new Set<() => void>();
    const channel: PositionChannel = {
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot: () => value,
    };
    return {
        channel,
        set: (next: number) => {
            if (value === next) return;
            value = next;
            for (const listener of listeners) {
                listener();
            }
        },
    };
};

/** 播放页 hook 暴露给视图的状态和操作。 */
export interface WatchPlayerApi {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    virtuosoRef: React.RefObject<VirtuosoHandle | null>;
    handleScrollerRef: (ref: HTMLElement | Window | null) => void;
    /** 底部悬浮控制坞的 DOM 引用，用于计算字幕列表被遮挡的下边界。 */
    dockRef: React.RefObject<HTMLDivElement | null>;
    dictRef: React.RefObject<HTMLDivElement | null>;
    currentIndex: number;
    currentLine: MobileSubtitleLine | null;
    currentTranslation: string;
    /** 播放位置外部订阅通道，隔离 timeupdate 高频状态免于重渲染页面与字幕列表。 */
    positionChannel: PositionChannel;
    /** 视频总时长，单位秒；未知时为 0。 */
    duration: number;
    showEnglish: boolean;
    showTranslation: boolean;
    /** 列表滚离当前句时显示“回到当前”。 */
    showFollow: boolean;
    repeatOn: boolean;
    autoPauseOn: boolean;
    speed: number;
    theme: AppTheme;
    settingsOpen: boolean;
    dict: DictionaryState | null;
    videoError: boolean;
    /** 视频当前是否暂停；进入页面时是暂停状态。 */
    paused: boolean;
    openSettings: () => void;
    closeSettings: () => void;
    toggleEnglish: () => void;
    toggleTranslation: () => void;
    /** 滚回当前句并恢复跟随。 */
    followCurrent: () => void;
    toggleRepeat: () => void;
    toggleAutoPause: () => void;
    changeSpeed: (rate: number) => void;
    changeTheme: (theme: AppTheme) => void;
    seekLine: (index: number, play?: boolean) => void;
    /** 切播放 / 暂停：视频区自己画的播放键和点击视频都走这里。 */
    togglePlay: () => void;
    /** 跳到指定秒数，用于自绘进度条；不会自动开始播放。 */
    seekTo: (seconds: number) => void;
    /** 进全屏：iOS 走 webkitEnterFullscreen，其它平台走标准全屏。 */
    enterFullscreen: () => void;
    stepLine: (delta: number) => void;
    replayCurrent: () => void;
    lookupWord: (word: string) => void;
    closeDict: () => void;
    handleScroll: () => void;
    /** 用户开始拖动列表（touchmove / wheel）。 */
    handleUserScroll: () => void;
    /** Virtuoso 渲染范围变化。 */
    handleRangeChanged: (range: { startIndex: number; endIndex: number }) => void;
    handleLoadedMetadata: () => void;
    handleTimeUpdate: () => void;
    handleSeeking: () => void;
    handleSeeked: () => void;
    handlePause: () => void;
    handlePlay: () => void;
    handleEnded: () => void;
    handleError: () => void;
    handleLoadedData: () => void;
}

/** seek 期间暂停循环判定的时间窗口（秒）。 */
const LOOP_EPSILON = 0.1;

/** 跳句时提前多少秒起播，避免把第一个音切掉。 */
const SEEK_PREROLL = 0.2;

/**
 * 移动端播放页总控 Hook：编排字幕跟随滚动、按需翻译、查词、句末互斥模式与 seek/resume 代次。
 *
 * @param detail 播放详情。
 * @returns 视图需要的 ref、状态和操作（逐字段解构供 WatchPlayer 消费）。
 */
export const useWatchPlayer = (detail: MobileWatchDetail): WatchPlayerApi => {
    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    const virtuosoRef = React.useRef<VirtuosoHandle | null>(null);
    const dockRef = React.useRef<HTMLDivElement | null>(null);
    const dictRef = React.useRef<HTMLDivElement | null>(null);
    const mountedRef = React.useRef(true);

    const [currentIndex, setCurrentIndex] = React.useState(-1);
    const currentIndexRef = React.useRef(-1);

    const {
        showFollow,
        handleScrollerRef,
        handleScroll,
        handleUserScroll,
        handleRangeChanged,
        followCurrent,
        syncFollowOnIndexChange,
        resetFollowForSeek,
        clearScrollTimers,
    } = useSubtitleFollowScroll(virtuosoRef, dockRef, currentIndexRef);

    const {
        showTranslation,
        activeTranslations,
        requestTranslationWindow,
        toggleTranslation,
        resetTranslations,
    } = useWatchTranslations(detail.id, detail.subtitles, currentIndexRef, mountedRef);

    const {
        dict,
        lookupWord,
        closeDict,
        clearDictTimer,
    } = useWatchDictionary(dictRef, mountedRef);

    const [showEnglish, setShowEnglish] = React.useState(() => loadBoolPref(PREF_KEYS.showEnglish, true));
    const [sentenceEndMode, setSentenceEndMode] = React.useState<MobileSentenceEndMode>('off');
    const sentenceEndModeRef = React.useRef<MobileSentenceEndMode>('off');
    const repeatStartRef = React.useRef<number | null>(null);
    const repeatEndRef = React.useRef<number | null>(null);
    const autoPauseArmedRef = React.useRef(true);

    const [speed, setSpeed] = React.useState(() => loadSpeedPref());
    const speedRef = React.useRef(speed);
    const [theme, setTheme] = React.useState<AppTheme>(() => readTheme());

    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [videoError, setVideoError] = React.useState(false);
    const [paused, setPaused] = React.useState(true);
    const positionStore = React.useMemo(() => createPositionStore(), []);
    const [duration, setDuration] = React.useState(0);

    const resumeDoneRef = React.useRef(detail.currentPosition <= 3);
    const resumeTimerRef = React.useRef<number | null>(null);
    const seekInFlightRef = React.useRef(false);
    const seekTargetIndexRef = React.useRef<number | null>(null);
    const seekTokenRef = React.useRef(0);
    /** 当前进行中的程序化 seek 代次；null 表示当前为原生拖进度条产生的 seeking。 */
    const activeProgrammaticTokenRef = React.useRef<number | null>(null);
    /** 续播定位对应的 seek 代次；若中途用户主动跳转，旧续播 token 自动失活。 */
    const resumeTokenRef = React.useRef<number | null>(null);
    const lastSavedRef = React.useRef(-1);

    const tender = React.useMemo(() => new SubtitleTender(detail.subtitles), [detail.subtitles]);

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    React.useEffect(() => {
        savePref(PREF_KEYS.showEnglish, showEnglish ? '1' : '0');
    }, [showEnglish]);

    React.useEffect(() => {
        speedRef.current = speed;
        if (videoRef.current) {
            videoRef.current.playbackRate = speed;
        }
    }, [speed]);

    const saveProgress = React.useCallback((force: boolean, targetVideo?: HTMLVideoElement | null): void => {
        if (!resumeDoneRef.current) {
            return;
        }
        const video = targetVideo ?? videoRef.current;
        const currentTime = video ? video.currentTime : positionStore.channel.getSnapshot();
        if (!video && currentTime <= 0 && lastSavedRef.current < 0) {
            return;
        }
        const second = Math.max(0, Math.floor(currentTime || 0));
        if (!force && lastSavedRef.current >= 0 && Math.abs(second - lastSavedRef.current) < 5) {
            return;
        }
        lastSavedRef.current = second;
        void mobileApi.saveProgress(detail.id, second, force).catch(() => undefined);
    }, [detail.id, positionStore]);

    const applyIndex = React.useCallback((index: number): void => {
        if (index !== currentIndexRef.current) {
            currentIndexRef.current = index;
            setCurrentIndex(index);
            autoPauseArmedRef.current = true;
            if (index >= 0) {
                requestTranslationWindow(index);
            }
        }

        const line = index >= 0 ? detail.subtitles[index] : null;
        const repeating = sentenceEndModeRef.current === 'repeat';
        repeatStartRef.current = repeating && line ? line.start : null;
        repeatEndRef.current = repeating && line ? line.end : null;

        syncFollowOnIndexChange(index);
    }, [detail.subtitles, requestTranslationWindow, syncFollowOnIndexChange]);

    const resolveCurrentIndex = React.useCallback((time: number): number => {
        const target = seekTargetIndexRef.current;
        if (target !== null) {
            const targetLine = detail.subtitles[target];
            if (targetLine && time < targetLine.start) {
                return target;
            }
            seekTargetIndexRef.current = null;
        }
        return tender.getIndexByTime(time);
    }, [detail.subtitles, tender]);

    const startProgrammaticSeek = React.useCallback((
        video: HTMLVideoElement,
        targetTime: number,
        targetIndex: number | null,
    ): number | null => {
        const alreadyAtTarget = Math.abs(video.currentTime - targetTime) < 1e-4;
        const token = ++seekTokenRef.current;
        activeProgrammaticTokenRef.current = alreadyAtTarget ? null : token;
        seekInFlightRef.current = !alreadyAtTarget;
        seekTargetIndexRef.current = targetIndex;
        try {
            video.currentTime = targetTime;
            return token;
        } catch {
            if (activeProgrammaticTokenRef.current === token) {
                activeProgrammaticTokenRef.current = null;
                seekInFlightRef.current = false;
                seekTargetIndexRef.current = null;
            }
            return null;
        }
    }, []);

    const handleTimeUpdate = React.useCallback((): void => {
        const video = videoRef.current;
        if (!video) {
            return;
        }
        positionStore.set(video.currentTime);
        if (!resumeDoneRef.current) {
            return;
        }

        const line = currentIndexRef.current >= 0 ? detail.subtitles[currentIndexRef.current] : null;
        if (
            sentenceEndModeRef.current === 'repeat'
            && !seekInFlightRef.current
            && repeatEndRef.current !== null
            && video.currentTime >= repeatEndRef.current - LOOP_EPSILON
        ) {
            const target = currentIndexRef.current;
            startProgrammaticSeek(
                video,
                Math.max(0, (repeatStartRef.current ?? 0) - SEEK_PREROLL),
                target >= 0 ? target : null,
            );
            return;
        }

        if (
            sentenceEndModeRef.current === 'auto-pause'
            && autoPauseArmedRef.current
            && line
            && video.currentTime >= line.end - LOOP_EPSILON
        ) {
            autoPauseArmedRef.current = false;
            video.pause();
            return;
        }

        applyIndex(resolveCurrentIndex(video.currentTime));
        saveProgress(false);
    }, [detail.subtitles, applyIndex, saveProgress, resolveCurrentIndex, positionStore, startProgrammaticSeek]);

    const handleSeeking = React.useCallback((): void => {
        if (activeProgrammaticTokenRef.current === null) {
            seekTargetIndexRef.current = null;
        }
        seekInFlightRef.current = true;
        autoPauseArmedRef.current = false;
    }, []);

    const handleSeeked = React.useCallback((): void => {
        const settledToken = activeProgrammaticTokenRef.current;
        // 用户发起了更新的 seek 时，忽略尚未对齐到最新 token 的旧 seeked 事件
        if (settledToken !== null && settledToken !== seekTokenRef.current) {
            return;
        }
        if (resumeTokenRef.current !== null && settledToken === resumeTokenRef.current) {
            resumeTokenRef.current = null;
            resumeDoneRef.current = true;
            if (resumeTimerRef.current !== null) {
                window.clearTimeout(resumeTimerRef.current);
                resumeTimerRef.current = null;
            }
        } else if (!resumeDoneRef.current && settledToken === null) {
            resumeDoneRef.current = true;
            if (resumeTimerRef.current !== null) {
                window.clearTimeout(resumeTimerRef.current);
                resumeTimerRef.current = null;
            }
        }
        activeProgrammaticTokenRef.current = null;
        seekInFlightRef.current = false;
        autoPauseArmedRef.current = true;
        const video = videoRef.current;
        if (video) {
            applyIndex(resolveCurrentIndex(video.currentTime));
        }
    }, [applyIndex, resolveCurrentIndex]);

    const handleLoadedMetadata = React.useCallback((): void => {
        const video = videoRef.current;
        if (!video) {
            return;
        }
        video.playbackRate = speedRef.current;
        setDuration(Number.isFinite(video.duration) ? video.duration : 0);

        if (!resumeDoneRef.current) {
            const totalDuration = Number.isFinite(video.duration) ? video.duration : 0;
            const target = totalDuration > 5
                ? Math.min(detail.currentPosition, totalDuration - 2)
                : detail.currentPosition;
            const token = startProgrammaticSeek(video, Math.max(0, target), null);
            if (token === null) {
                resumeDoneRef.current = true;
            } else {
                resumeTokenRef.current = token;
                if (resumeTimerRef.current !== null) {
                    window.clearTimeout(resumeTimerRef.current);
                }
                resumeTimerRef.current = window.setTimeout(() => {
                    resumeTimerRef.current = null;
                    if (!mountedRef.current || resumeTokenRef.current !== token) {
                        return;
                    }
                    resumeTokenRef.current = null;
                    resumeDoneRef.current = true;
                    if (activeProgrammaticTokenRef.current === token) {
                        activeProgrammaticTokenRef.current = null;
                        seekInFlightRef.current = false;
                    }
                    const current = videoRef.current;
                    if (current) {
                        applyIndex(resolveCurrentIndex(current.currentTime));
                    }
                }, 1500);
            }
        }

        if (resumeDoneRef.current) {
            applyIndex(resolveCurrentIndex(video.currentTime));
        }
        positionStore.set(video.currentTime);
    }, [detail.currentPosition, applyIndex, resolveCurrentIndex, positionStore, startProgrammaticSeek]);

    const handlePause = React.useCallback((): void => {
        setPaused(true);
        saveProgress(true);
    }, [saveProgress]);

    const handlePlay = React.useCallback((): void => {
        setPaused(false);
        const video = videoRef.current;
        const line = currentIndexRef.current >= 0 ? detail.subtitles[currentIndexRef.current] : null;
        autoPauseArmedRef.current = !video || !line || video.currentTime < line.end - LOOP_EPSILON;
    }, [detail.subtitles]);

    const handleEnded = React.useCallback((): void => {
        setPaused(true);
        saveProgress(true);
    }, [saveProgress]);

    const handleError = React.useCallback((): void => {
        if (videoRef.current?.error?.code === 1) {
            return;
        }
        setVideoError(true);
    }, []);

    const handleLoadedData = React.useCallback((): void => {
        setVideoError(false);
    }, []);

    const seekLine = React.useCallback((index: number, play = true): void => {
        const video = videoRef.current;
        const line = detail.subtitles[index];
        if (!video || !line) {
            return;
        }
        // 用户明确跳句，提前结束旧的续播等待窗口避免误阻塞高亮
        if (!resumeDoneRef.current) {
            resumeDoneRef.current = true;
            resumeTokenRef.current = null;
            if (resumeTimerRef.current !== null) {
                window.clearTimeout(resumeTimerRef.current);
                resumeTimerRef.current = null;
            }
        }
        const token = startProgrammaticSeek(video, Math.max(0, line.start - SEEK_PREROLL), index);
        if (token === null) {
            return;
        }
        resetFollowForSeek();
        closeDict();
        applyIndex(index);
        if (play) {
            void video.play().catch(() => undefined);
        }
        tapFeedback();
    }, [detail.subtitles, applyIndex, closeDict, resetFollowForSeek, startProgrammaticSeek]);

    const stepLine = React.useCallback((delta: number): void => {
        if (detail.subtitles.length === 0) {
            return;
        }
        const base = currentIndexRef.current >= 0
            ? currentIndexRef.current
            : tender.getIndexByTime(videoRef.current?.currentTime ?? 0);
        const target = Math.max(0, Math.min(detail.subtitles.length - 1, (base < 0 ? -1 : base) + delta));
        seekLine(target, true);
    }, [detail.subtitles, seekLine, tender]);

    const replayCurrent = React.useCallback((): void => {
        if (detail.subtitles.length === 0) {
            return;
        }
        const base = currentIndexRef.current >= 0
            ? currentIndexRef.current
            : tender.getIndexByTime(videoRef.current?.currentTime ?? 0);
        seekLine(base < 0 ? 0 : base, true);
    }, [detail.subtitles, seekLine, tender]);

    const togglePlay = React.useCallback((): void => {
        closeDict();
        const video = videoRef.current;
        if (!video) {
            return;
        }
        if (video.paused) {
            void video.play().catch(() => undefined);
            return;
        }
        video.pause();
    }, [closeDict]);

    const seekTo = React.useCallback((seconds: number): void => {
        closeDict();
        const video = videoRef.current;
        if (!video) {
            return;
        }
        const total = Number.isFinite(video.duration) ? video.duration : 0;
        const upper = total > 0 ? Math.max(0, total - 0.3) : seconds;
        const target = Math.max(0, Math.min(seconds, upper));
        if (!resumeDoneRef.current) {
            resumeDoneRef.current = true;
            resumeTokenRef.current = null;
        }
        const token = startProgrammaticSeek(video, target, null);
        if (token === null) {
            return;
        }
        positionStore.set(target);
        applyIndex(resolveCurrentIndex(target));
        autoPauseArmedRef.current = true;
    }, [applyIndex, resolveCurrentIndex, closeDict, positionStore, startProgrammaticSeek]);

    const enterFullscreen = React.useCallback((): void => {
        const video = videoRef.current;
        if (!video) {
            return;
        }
        const legacy = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
        if (typeof legacy.webkitEnterFullscreen === 'function') {
            legacy.webkitEnterFullscreen();
            return;
        }
        void video.requestFullscreen?.()?.catch(() => undefined);
    }, []);

    const openSettings = React.useCallback((): void => setSettingsOpen(true), []);
    const closeSettings = React.useCallback((): void => setSettingsOpen(false), []);
    const toggleEnglish = React.useCallback((): void => setShowEnglish((value) => !value), []);

    const toggleRepeat = React.useCallback((): void => {
        const nextMode = toggleMobileSentenceEndMode(sentenceEndModeRef.current, 'repeat');
        sentenceEndModeRef.current = nextMode;
        setSentenceEndMode(nextMode);
        const line = currentIndexRef.current >= 0 ? detail.subtitles[currentIndexRef.current] : null;
        repeatStartRef.current = nextMode === 'repeat' && line ? line.start : null;
        repeatEndRef.current = nextMode === 'repeat' && line ? line.end : null;
    }, [detail.subtitles]);

    const toggleAutoPause = React.useCallback((): void => {
        const nextMode = toggleMobileSentenceEndMode(sentenceEndModeRef.current, 'auto-pause');
        sentenceEndModeRef.current = nextMode;
        setSentenceEndMode(nextMode);
        repeatStartRef.current = null;
        repeatEndRef.current = null;
        autoPauseArmedRef.current = true;
    }, []);

    const changeSpeed = React.useCallback((rate: number): void => {
        speedRef.current = rate;
        setSpeed(rate);
        savePref(PREF_KEYS.speed, String(rate));
    }, []);

    const changeTheme = React.useCallback((next: AppTheme): void => {
        setTheme(next);
        applyTheme(next);
        saveTheme(next);
    }, []);

    React.useEffect(() => {
        const onPageHide = (): void => saveProgress(true);
        const onVisibilityChange = (): void => {
            if (document.visibilityState === 'hidden') {
                saveProgress(true);
            }
        };
        window.addEventListener('pagehide', onPageHide);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            window.removeEventListener('pagehide', onPageHide);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [saveProgress]);

    React.useEffect(() => {
        resetTranslations();
        seekTokenRef.current += 1;
        activeProgrammaticTokenRef.current = null;
        resumeTokenRef.current = null;
        resumeDoneRef.current = detail.currentPosition <= 3;
        seekInFlightRef.current = false;
        seekTargetIndexRef.current = null;
        lastSavedRef.current = -1;
        autoPauseArmedRef.current = true;
    }, [detail.id, detail.currentPosition, detail.subtitles, resetTranslations]);

    React.useEffect(() => {
        const video = videoRef.current;
        return () => {
            saveProgress(true, video);
            if (video) {
                try {
                    video.pause();
                } catch {
                    // 忽略暂停失败。
                }
                video.removeAttribute('src');
                try {
                    video.load();
                } catch {
                    // 元素可能已经脱离文档。
                }
            }
            if (resumeTimerRef.current !== null) {
                window.clearTimeout(resumeTimerRef.current);
                resumeTimerRef.current = null;
            }
            clearScrollTimers();
            clearDictTimer();
        };
    }, [saveProgress, clearScrollTimers, clearDictTimer]);

    const repeatOn = sentenceEndMode === 'repeat';
    const autoPauseOn = sentenceEndMode === 'auto-pause';
    const currentLine = currentIndex >= 0 ? detail.subtitles[currentIndex] : detail.subtitles[0] ?? null;
    const currentTranslation = currentLine
        ? (currentLine.zh || activeTranslations[currentIndex >= 0 ? currentIndex : 0] || '')
        : '';

    return {
        videoRef,
        virtuosoRef,
        handleScrollerRef,
        dockRef,
        dictRef,
        currentIndex,
        currentLine,
        currentTranslation,
        positionChannel: positionStore.channel,
        duration,
        showEnglish,
        showTranslation,
        showFollow,
        repeatOn,
        autoPauseOn,
        speed,
        theme,
        settingsOpen,
        dict,
        videoError,
        paused,
        openSettings,
        closeSettings,
        toggleEnglish,
        toggleTranslation,
        followCurrent,
        toggleRepeat,
        toggleAutoPause,
        changeSpeed,
        changeTheme,
        seekLine,
        togglePlay,
        seekTo,
        enterFullscreen,
        stepLine,
        replayCurrent,
        lookupWord,
        closeDict,
        handleScroll,
        handleUserScroll,
        handleRangeChanged,
        handleLoadedMetadata,
        handleTimeUpdate,
        handleSeeking,
        handleSeeked,
        handlePause,
        handlePlay,
        handleEnded,
        handleError,
        handleLoadedData,
    };
};
