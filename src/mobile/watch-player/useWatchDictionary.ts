import React from 'react';
import type { OpenAIDictionaryResult } from '@/common/types/DictionaryResult';
import { mobileApi } from '@/mobile/api';

/** 顶部查词条对外展示的数据结构（由显式阶段推导，避免 loading+error 矛盾组合）。 */
export interface DictionaryState {
    /** 查询词。 */
    word: string;
    /** 词典结果；加载中或失败时为 null。 */
    data: OpenAIDictionaryResult | null;
    /** 是否仍在查询。 */
    loading: boolean;
    /** 查询失败信息。 */
    error: string | null;
}

type DictPhase =
    | { status: 'idle' }
    | { status: 'loading'; word: string }
    | { status: 'ready'; word: string; data: OpenAIDictionaryResult | null }
    | { status: 'error'; word: string; error: string };

const toDictionaryState = (phase: DictPhase): DictionaryState | null => {
    switch (phase.status) {
        case 'idle':
            return null;
        case 'loading':
            return { word: phase.word, data: null, loading: true, error: null };
        case 'ready':
            return { word: phase.word, data: phase.data, loading: false, error: null };
        case 'error':
            return { word: phase.word, data: null, loading: false, error: phase.error };
    }
};

/**
 * 移动端查词弹窗状态机 Hook。
 */
export const useWatchDictionary = (
    dictRef: React.RefObject<HTMLDivElement | null>,
    mountedRef: React.RefObject<boolean>,
) => {
    const dictCacheRef = React.useRef(new Map<string, OpenAIDictionaryResult | null>());
    const activeWordRef = React.useRef<string | null>(null);
    const dictRequestIdRef = React.useRef(0);
    const dictTimerRef = React.useRef<number | null>(null);
    const [phase, setPhase] = React.useState<DictPhase>({ status: 'idle' });

    const clearTimer = React.useCallback((): void => {
        if (dictTimerRef.current !== null) {
            window.clearTimeout(dictTimerRef.current);
            dictTimerRef.current = null;
        }
    }, []);

    const closeDict = React.useCallback((): void => {
        clearTimer();
        activeWordRef.current = null;
        setPhase({ status: 'idle' });
    }, [clearTimer]);

    const scheduleDictHide = React.useCallback((delay: number): void => {
        clearTimer();
        dictTimerRef.current = window.setTimeout(() => {
            dictTimerRef.current = null;
            activeWordRef.current = null;
            setPhase({ status: 'idle' });
        }, delay);
    }, [clearTimer]);

    const lookupWord = React.useCallback((raw: string): void => {
        const word = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
        if (word === '') {
            return;
        }
        const key = word.toLowerCase();
        activeWordRef.current = key;

        const cached = dictCacheRef.current.get(key);
        if (cached !== undefined) {
            setPhase({ status: 'ready', word, data: cached });
            scheduleDictHide(9000);
            return;
        }

        setPhase({ status: 'loading', word });
        clearTimer();
        const requestId = ++dictRequestIdRef.current;
        mobileApi.lookupWord(word)
            .then((result) => {
                if (!mountedRef.current) {
                    return;
                }
                dictCacheRef.current.set(key, result);
                if (activeWordRef.current === key && dictRequestIdRef.current === requestId) {
                    setPhase({ status: 'ready', word, data: result });
                    scheduleDictHide(9000);
                }
            })
            .catch((reason: unknown) => {
                if (!mountedRef.current) {
                    return;
                }
                if (activeWordRef.current === key && dictRequestIdRef.current === requestId) {
                    setPhase({
                        status: 'error',
                        word,
                        error: reason instanceof Error ? reason.message : String(reason),
                    });
                    scheduleDictHide(12000);
                }
            });
    }, [clearTimer, mountedRef, scheduleDictHide]);

    const dict = React.useMemo(() => toDictionaryState(phase), [phase]);

    React.useEffect(() => {
        if (!dict) {
            return;
        }
        const onPointerDown = (event: PointerEvent): void => {
            if (!(event.target instanceof Node) || dictRef.current?.contains(event.target)) {
                return;
            }
            if (event.target instanceof Element && event.target.closest('.word')) {
                return;
            }
            closeDict();
        };

        const onScrollOrTouch = (event: Event): void => {
            if (event.target instanceof Node && dictRef.current?.contains(event.target)) {
                return;
            }
            closeDict();
        };

        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('scroll', onScrollOrTouch, { capture: true, passive: true });
        window.addEventListener('touchmove', onScrollOrTouch, { passive: true });
        window.addEventListener('wheel', onScrollOrTouch, { passive: true });
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('scroll', onScrollOrTouch, true);
            window.removeEventListener('touchmove', onScrollOrTouch);
            window.removeEventListener('wheel', onScrollOrTouch);
        };
    }, [dict, dictRef, closeDict]);

    return {
        dict,
        lookupWord,
        closeDict,
        clearDictTimer: clearTimer,
    };
};
