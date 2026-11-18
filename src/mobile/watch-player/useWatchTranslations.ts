import React from 'react';
import type { MobileSubtitleLine } from '@/common/contracts/mobile-web';
import { mobileApi } from '@/mobile/api';
import { PREF_KEYS, loadBoolPref, savePref } from '@/mobile/lib';

/**
 * 移动端字幕滑动窗按需翻译协调 Hook（隔离 detail 代次与重试窗口）。
 */
export const useWatchTranslations = (
    detailId: string,
    subtitles: MobileSubtitleLine[],
    currentIndexRef: React.RefObject<number>,
    mountedRef: React.RefObject<boolean>,
) => {
    const [showTranslation, setShowTranslation] = React.useState(() => loadBoolPref(PREF_KEYS.showTranslation, true));
    const showTranslationRef = React.useRef(showTranslation);
    const [translationsState, setTranslationsState] = React.useState<{
        detailId: string;
        subtitles: MobileSubtitleLine[];
        map: Record<number, string>;
    }>(() => ({
        detailId,
        subtitles,
        map: {},
    }));
    const translationsRef = React.useRef<Record<number, string>>({});
    const attemptedTranslationsRef = React.useRef<Set<number>>(new Set());
    const detailEpochRef = React.useRef(0);

    React.useEffect(() => {
        savePref(PREF_KEYS.showTranslation, showTranslation ? '1' : '0');
        showTranslationRef.current = showTranslation;
    }, [showTranslation]);

    const requestTranslationWindow = React.useCallback((index: number): void => {
        if (!showTranslationRef.current) {
            return;
        }
        const lines = subtitles;
        if (lines.length === 0) {
            return;
        }
        const probeStart = Math.max(0, index);
        const probeEnd = Math.min(lines.length, probeStart + 6);
        let hasUncoveredAhead = false;
        for (let i = probeStart; i < probeEnd; i += 1) {
            const line = lines[i];
            if (
                line.zh === ''
                && line.en.trim() !== ''
                && !attemptedTranslationsRef.current.has(i)
                && (translationsRef.current[i] ?? '') === ''
            ) {
                hasUncoveredAhead = true;
                break;
            }
        }
        if (!hasUncoveredAhead) {
            return;
        }

        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length, start + 20);
        const indexes: number[] = [];
        const texts: string[] = [];
        for (let i = start; i < end; i += 1) {
            const line = lines[i];
            if (line.zh !== '' || line.en.trim() === '') {
                continue;
            }
            if (attemptedTranslationsRef.current.has(i)) {
                continue;
            }
            if ((translationsRef.current[i] ?? '') !== '') {
                continue;
            }
            attemptedTranslationsRef.current.add(i);
            indexes.push(i);
            texts.push(line.en);
        }
        if (texts.length === 0) {
            return;
        }
        const epoch = detailEpochRef.current;
        const targetId = detailId;
        const targetSubtitles = subtitles;
        mobileApi.translateTexts(texts)
            .then((result) => {
                if (!mountedRef.current || detailEpochRef.current !== epoch) {
                    return;
                }
                const next = { ...translationsRef.current };
                indexes.forEach((lineIndex, position) => {
                    next[lineIndex] = result[position] ?? '';
                });
                translationsRef.current = next;
                setTranslationsState({
                    detailId: targetId,
                    subtitles: targetSubtitles,
                    map: next,
                });
            })
            .catch(() => {
                // 没有配置翻译服务时保持空白，已请求过的行不反复重试。
            });
    }, [detailId, mountedRef, subtitles]);

    const toggleTranslation = React.useCallback((): void => {
        const next = !showTranslationRef.current;
        showTranslationRef.current = next;
        setShowTranslation(next);
        if (next) {
            attemptedTranslationsRef.current.clear();
            requestTranslationWindow(currentIndexRef.current >= 0 ? currentIndexRef.current : 0);
        }
    }, [currentIndexRef, requestTranslationWindow]);

    const resetTranslations = React.useCallback((): void => {
        detailEpochRef.current += 1;
        translationsRef.current = {};
        attemptedTranslationsRef.current.clear();
    }, []);

    const activeTranslations = translationsState.detailId === detailId && translationsState.subtitles === subtitles
        ? translationsState.map
        : {};

    return {
        showTranslation,
        activeTranslations,
        requestTranslationWindow,
        toggleTranslation,
        resetTranslations,
    };
};
