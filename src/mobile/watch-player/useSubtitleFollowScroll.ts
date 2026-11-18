import React from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import { tapFeedback } from '@/mobile/lib';

/** 程序滚动后多久没有 scroll 事件就算滚完（毫秒）。覆盖移动端 smooth scroll 步长。 */
const AUTO_SCROLL_SETTLE_MS = 220;

/** 用户停止滚动多久之后，再决定恢复跟随还是露出「回到当前」。 */
const BROWSE_SETTLE_MS = 400;

/**
 * 移动端字幕跟随 / 用户浏览状态机 Hook。
 */
export const useSubtitleFollowScroll = (
    virtuosoRef: React.RefObject<VirtuosoHandle | null>,
    dockRef: React.RefObject<HTMLDivElement | null>,
    currentIndexRef: React.RefObject<number>,
) => {
    const scrollerRef = React.useRef<HTMLElement | null>(null);
    const scrollPhaseRef = React.useRef<'idle' | 'auto-scrolling' | 'browsing'>('idle');
    const browseSettleTimerRef = React.useRef<number | null>(null);
    const autoScrollSettleTimerRef = React.useRef<number | null>(null);
    const renderedRangeRef = React.useRef<[number, number]>([0, -1]);

    const [showFollow, setShowFollow] = React.useState(false);
    const showFollowRef = React.useRef(false);
    const updateShowFollow = React.useCallback((next: boolean): void => {
        if (showFollowRef.current === next) return;
        showFollowRef.current = next;
        setShowFollow(next);
    }, []);

    const handleScrollerRef = React.useCallback((ref: HTMLElement | Window | null): void => {
        scrollerRef.current = ref instanceof HTMLElement ? ref : null;
    }, []);

    const isRowVisible = React.useCallback((index: number): boolean => {
        const [start, end] = renderedRangeRef.current;
        if (index < start || index > end) {
            return false;
        }
        const list = scrollerRef.current;
        const row = list?.querySelector<HTMLElement>(`[data-item-index="${index}"]`);
        if (!list || !row) {
            return false;
        }
        const listRect = list.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();

        const dockEl = dockRef.current;
        const visibleBottomLimit = dockEl
            ? dockEl.getBoundingClientRect().top - 12
            : listRect.bottom - 110;
        const visibleTopLimit = listRect.top + 8;

        return rowRect.top >= visibleTopLimit && rowRect.bottom <= visibleBottomLimit;
    }, [dockRef]);

    const settleAutoScroll = React.useCallback((delayMs = AUTO_SCROLL_SETTLE_MS): void => {
        if (autoScrollSettleTimerRef.current !== null) {
            window.clearTimeout(autoScrollSettleTimerRef.current);
        }
        autoScrollSettleTimerRef.current = window.setTimeout(() => {
            autoScrollSettleTimerRef.current = null;
            if (scrollPhaseRef.current === 'auto-scrolling') {
                scrollPhaseRef.current = 'idle';
            }
        }, delayMs);
    }, []);

    const ensureRowVisible = React.useCallback((index: number): void => {
        if (isRowVisible(index) || !virtuosoRef.current) {
            return;
        }
        scrollPhaseRef.current = 'auto-scrolling';
        settleAutoScroll(550);
        virtuosoRef.current.scrollIntoView({ index, align: 'start', behavior: 'smooth' });
    }, [isRowVisible, settleAutoScroll, virtuosoRef]);

    const settleBrowsing = React.useCallback((): void => {
        if (browseSettleTimerRef.current !== null) {
            window.clearTimeout(browseSettleTimerRef.current);
        }
        browseSettleTimerRef.current = window.setTimeout(() => {
            browseSettleTimerRef.current = null;
            if (scrollPhaseRef.current !== 'browsing') {
                return;
            }
            const index = currentIndexRef.current;
            if (index >= 0 && isRowVisible(index)) {
                scrollPhaseRef.current = 'idle';
                updateShowFollow(false);
                return;
            }
            updateShowFollow(true);
        }, BROWSE_SETTLE_MS);
    }, [currentIndexRef, isRowVisible, updateShowFollow]);

    const handleUserScroll = React.useCallback((): void => {
        if (scrollPhaseRef.current === 'auto-scrolling' && autoScrollSettleTimerRef.current !== null) {
            window.clearTimeout(autoScrollSettleTimerRef.current);
            autoScrollSettleTimerRef.current = null;
        }
        scrollPhaseRef.current = 'browsing';
        settleBrowsing();
    }, [settleBrowsing]);

    const handleScroll = React.useCallback((): void => {
        if (scrollPhaseRef.current === 'auto-scrolling') {
            settleAutoScroll();
            return;
        }
        scrollPhaseRef.current = 'browsing';
        settleBrowsing();
    }, [settleAutoScroll, settleBrowsing]);

    const handleRangeChanged = React.useCallback((range: { startIndex: number; endIndex: number }): void => {
        renderedRangeRef.current = [range.startIndex, range.endIndex];
    }, []);

    const followCurrent = React.useCallback((): void => {
        const index = currentIndexRef.current;
        if (index < 0) {
            return;
        }
        scrollPhaseRef.current = virtuosoRef.current ? 'auto-scrolling' : 'idle';
        updateShowFollow(false);
        if (browseSettleTimerRef.current !== null) {
            window.clearTimeout(browseSettleTimerRef.current);
            browseSettleTimerRef.current = null;
        }
        if (virtuosoRef.current) {
            settleAutoScroll(550);
            virtuosoRef.current.scrollToIndex({ index, align: 'start', behavior: 'smooth' });
        }
        tapFeedback();
    }, [currentIndexRef, settleAutoScroll, updateShowFollow, virtuosoRef]);

    const clearScrollTimers = React.useCallback((): void => {
        if (autoScrollSettleTimerRef.current !== null) {
            window.clearTimeout(autoScrollSettleTimerRef.current);
            autoScrollSettleTimerRef.current = null;
        }
        if (browseSettleTimerRef.current !== null) {
            window.clearTimeout(browseSettleTimerRef.current);
            browseSettleTimerRef.current = null;
        }
    }, []);

    const syncFollowOnIndexChange = React.useCallback((index: number): void => {
        if (index < 0) {
            return;
        }
        if (scrollPhaseRef.current === 'browsing') {
            if (browseSettleTimerRef.current === null && isRowVisible(index)) {
                scrollPhaseRef.current = 'idle';
                updateShowFollow(false);
            }
            return;
        }
        updateShowFollow(false);
        ensureRowVisible(index);
    }, [ensureRowVisible, isRowVisible, updateShowFollow]);

    const resetFollowForSeek = React.useCallback((): void => {
        scrollPhaseRef.current = 'idle';
        updateShowFollow(false);
        clearScrollTimers();
    }, [clearScrollTimers, updateShowFollow]);

    return {
        showFollow,
        handleScrollerRef,
        handleScroll,
        handleUserScroll,
        handleRangeChanged,
        followCurrent,
        syncFollowOnIndexChange,
        resetFollowForSeek,
        clearScrollTimers,
    };
};
