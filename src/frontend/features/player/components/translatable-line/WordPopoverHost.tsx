import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    autoUpdate,
    flip,
    offset,
    safePolygon,
    shift,
    useDismiss,
    useFloating,
    useHover,
    useInteractions,
    useRole,
    type VirtualElement,
} from '@floating-ui/react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { useShallow } from 'zustand/react/shallow';

import WordPop from './word-pop';
import { playWord, getTtsUrl, playAudioUrl } from '@/frontend/infrastructure/audio/AudioPlayer';
import type { OpenAIDictionaryResult } from '@/common/types/DictionaryResult';
import { getRendererLogger } from '@/frontend/log/simple-logger';
import Eb from '@/frontend/components/shared/common/Eb';
import { useVocabularyState, useVocabularyStore } from '@/frontend/features/player/vocabularyStore';
import useSetting from '@/frontend/features/settings/settingsStore';
import { usePlayer } from '@/frontend/features/player/playerStore';
import useDictionaryStream, { createDictionaryRequestId } from '@/frontend/features/player/dictionaryStore';
import { playerApi } from '@/frontend/features/player/playerApi';
import { videoLearningApi } from '@/frontend/features/video-learning/videoLearningApi';
import { contextPackKey } from '@/frontend/features/player/contextPackKey';
import type { ContextReasonCode } from '@/common/types/contextPack';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import {
    isProactiveGuidance,
    VOCABULARY_GUIDANCE_LEVELS,
    type VocabularyGuidance,
    type WordStatus,
} from '@/common/types/vocabulary';
import { shouldRecordEncounter } from './encounterThrottle';
import { useWordPopoverStore, type WordPopoverRect, type WordPopoverTarget } from './wordPopoverStore';

const logger = getRendererLogger('WordPopoverHost');

const toVirtualElement = (rect: WordPopoverRect): VirtualElement => ({
    getBoundingClientRect: () => new DOMRect(rect.left, rect.top, rect.width, rect.height),
});

const readConnectedRect = (el: HTMLElement): WordPopoverRect | null => {
    if (!el.isConnected) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return null;
    return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    };
};

const MAX_SELECTION_PHRASE_WORDS = 8;

const isRangeTouchingZeroCharsAtBoundary = (range: Range, el: HTMLElement): boolean => {
    if (el.contains(range.startContainer) && range.startContainer.nodeType === Node.TEXT_NODE) {
        const len = range.startContainer.textContent?.length ?? 0;
        if (range.startOffset >= len) return true;
    }
    if (el.contains(range.endContainer) && range.endContainer.nodeType === Node.TEXT_NODE) {
        if (range.endOffset <= 0) return true;
    }
    return false;
};

const PART_OF_SPEECH_ABBR: Record<string, string> = {
    noun: 'n.',
    verb: 'v.',
    adjective: 'adj.',
    adverb: 'adv.',
    pronoun: 'pron.',
    preposition: 'prep.',
    conjunction: 'conj.',
    interjection: 'int.',
    determiner: 'det.',
    auxiliary: 'aux.',
};

const isOpenAIDictionaryResult = (data: unknown): data is OpenAIDictionaryResult => {
    return (
        typeof data === 'object' &&
        data !== null &&
        'definitions' in data &&
        Array.isArray((data as OpenAIDictionaryResult).definitions)
    );
};

const buildFavoriteTranslate = (data: OpenAIDictionaryResult | null | undefined): string => {
    if (!isOpenAIDictionaryResult(data) || data.definitions.length === 0) {
        return '';
    }
    return data.definitions
        .map((def) => {
            const rawPos = def.partOfSpeech?.trim() ?? '';
            const abbr = rawPos ? (PART_OF_SPEECH_ABBR[rawPos.toLowerCase()] ?? rawPos) : '';
            return abbr ? `${abbr} ${def.meaning}` : def.meaning;
        })
        .filter(Boolean)
        .join('；');
};

const normalizeCleanWord = (target: WordPopoverTarget): string => {
    const raw = (target.lemma || target.word).toLowerCase().trim();
    if (target.kind === 'phrase') {
        return raw.replace(/\s+/g, ' ').replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
    }
    return raw.replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, '');
};

/**
 * 全局唯一的查词与划词词组浮层宿主。
 *
 * 承接 Floating UI、词典查询 SWR、上下文学习档案 SWR、AI 流式增量更新及多词划词选区监听。
 */
export const WordPopoverHost: React.FC = () => {
    const { open, mode, target, openImmediately, pinPopover, closePopover } = useWordPopoverStore(
        useShallow((s) => ({
            open: s.open,
            mode: s.mode,
            target: s.target,
            openImmediately: s.openImmediately,
            pinPopover: s.pinPopover,
            closePopover: s.closePopover,
        })),
    );

    const { t } = useTranslation('common');
    const { t: tPlayer } = useTranslation('player');

    const pause = usePlayer((s) => s.pause);
    const [favoritingPopKey, setFavoritingPopKey] = useState<string | null>(null);
    const [updatingStatusPopKey, setUpdatingStatusPopKey] = useState<string | null>(null);
    const [optimisticSaved, setOptimisticSaved] = useState<{ popKey: string; version: number } | null>(null);
    const [optimisticStatusState, setOptimisticStatusState] = useState<{ popKey: string; status: WordStatus } | null>(null);

    const guidanceRaw = useSetting((state) => state.values.get('player.vocabularyGuidance'));
    const pauseOnWordHover = useSetting((state) => state.values.get('player.pauseOnWordHover')) === 'true';
    const vocabularyGuidance: VocabularyGuidance = VOCABULARY_GUIDANCE_LEVELS.includes(guidanceRaw as VocabularyGuidance)
        ? (guidanceRaw as VocabularyGuidance)
        : 'coach';

    const {
        isVocabularyWord,
        getBaseWord,
        getWordStatus,
        setWordStatus,
        removeVocabularyWords,
        vocabularyVersion,
    } = useVocabularyState(
        useShallow((s) => ({
            isVocabularyWord: s.isVocabularyWord,
            getBaseWord: s.getBaseWord,
            getWordStatus: s.getWordStatus,
            setWordStatus: s.setWordStatus,
            removeVocabularyWords: s.removeVocabularyWords,
            vocabularyVersion: s.version,
        })),
    );

    const cleanWord = target ? normalizeCleanWord(target) : '';
    const original = target?.original ?? '';
    const sentenceText = target?.sentenceText;
    const sentenceIndex = target?.sentenceIndex;
    const sentenceHash = target?.sentenceHash;

    // 划词自动识别（支持单词/跨标点与空格/合并句跨行，单句内 1..8 词）
    useEffect(() => {
        const handleMouseUp = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                return;
            }
            if (!selection.toString().trim()) {
                return;
            }
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (rect.width < 4) {
                return;
            }

            const rootEl = range.commonAncestorContainer instanceof Element
                ? range.commonAncestorContainer
                : range.commonAncestorContainer.parentElement;
            if (!rootEl || rootEl.closest('[data-word-popover-card="true"]')) {
                return;
            }

            const ancestorWord = rootEl.closest('[data-word="true"]') as HTMLElement | null;
            const candidateWords = ancestorWord
                ? [ancestorWord]
                : Array.from(rootEl.querySelectorAll<HTMLElement>('[data-word="true"]'));

            const intersected = candidateWords.filter((el) => {
                const hits = typeof range.intersectsNode === 'function'
                    ? range.intersectsNode(el)
                    : selection.containsNode(el, true);
                return hits && !isRangeTouchingZeroCharsAtBoundary(range, el);
            });

            if (intersected.length === 0 || intersected.length > MAX_SELECTION_PHRASE_WORDS) {
                return;
            }

            const firstEl = intersected[0];
            const firstUnitEl = firstEl.closest('[data-sentence-unit]') as HTMLElement | null;
            const sHash = firstEl.dataset.sentenceHash ?? '';
            const sIndex = firstEl.dataset.sentenceIndex ?? '';
            const sameLogicalSentence = intersected.every((el) => {
                if (firstUnitEl && el.closest('[data-sentence-unit]') === firstUnitEl) {
                    return true;
                }
                return (
                    (el.dataset.sentenceHash ?? '') === sHash
                    && (el.dataset.sentenceIndex ?? '') === sIndex
                );
            });
            if (!sameLogicalSentence) {
                return;
            }

            const parsedIndex = sIndex ? Number.parseInt(sIndex, 10) : undefined;
            const nextSentenceText = firstUnitEl?.dataset.sentenceUnitText
                || firstEl.dataset.sentenceText
                || undefined;

            if (intersected.length === 1) {
                const wordText = (firstEl.dataset.wordText ?? firstEl.textContent ?? '').trim();
                const lemma = firstEl.dataset.lemma || undefined;
                const cleanSingle = (lemma || wordText)
                    .toLowerCase()
                    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, '');
                if (!wordText || !cleanSingle) {
                    return;
                }
                if (pauseOnWordHover || usePlayer.getState().playing) {
                    pause();
                }
                const elRect = readConnectedRect(firstEl);
                openImmediately(
                    {
                        kind: 'word',
                        popKey: `sel:${sHash}:${sIndex}:${wordText}:${cleanSingle}`,
                        word: wordText,
                        original: wordText,
                        cleanWord: cleanSingle,
                        lemma,
                        sentenceText: nextSentenceText,
                        sentenceIndex: Number.isFinite(parsedIndex) ? parsedIndex : undefined,
                        sentenceHash: sHash || undefined,
                        triggerEl: firstEl,
                        anchorRect: elRect,
                    },
                    'selection',
                );
                return;
            }

            const phraseTokens = intersected
                .map((el) => (el.dataset.wordText ?? el.textContent ?? '').trim())
                .filter(Boolean);
            if (phraseTokens.length < 2) {
                return;
            }

            const phraseText = phraseTokens.join(' ');
            const cleanPhrase = phraseText.toLowerCase().replace(/\s+/g, ' ').replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
            if (!cleanPhrase) {
                return;
            }

            if (pauseOnWordHover || usePlayer.getState().playing) {
                pause();
            }

            openImmediately(
                {
                    kind: 'phrase',
                    popKey: `phrase:${sHash}:${sIndex}:${cleanPhrase}`,
                    word: phraseText,
                    original: phraseText,
                    cleanWord: cleanPhrase,
                    lemma: cleanPhrase,
                    sentenceText: nextSentenceText,
                    sentenceIndex: Number.isFinite(parsedIndex) ? parsedIndex : undefined,
                    sentenceHash: sHash || undefined,
                    triggerEl: null,
                    virtualRect: {
                        left: rect.left,
                        top: rect.top,
                        right: rect.right,
                        bottom: rect.bottom,
                        width: rect.width,
                        height: rect.height,
                    },
                },
                'selection',
            );
        };

        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [openImmediately, pause, pauseOnWordHover]);

    const lastValidRectRef = useRef<WordPopoverRect | null>(null);
    const setReferenceRef = useRef<((node: HTMLElement | VirtualElement | null) => void) | null>(null);

    const { refs, floatingStyles, context, isPositioned } = useFloating({
        open: open && Boolean(target),
        onOpenChange: (next) => {
            if (!next) {
                closePopover();
            }
        },
        placement: 'top',
        whileElementsMounted: (reference, floating, update) =>
            autoUpdate(reference, floating, () => {
                const { target: currentTarget, mode: currentMode } = useWordPopoverStore.getState();
                if (currentTarget?.triggerEl && reference === currentTarget.triggerEl) {
                    if (!currentTarget.triggerEl.isConnected) {
                        if (currentMode === 'hover' || !lastValidRectRef.current) {
                            closePopover();
                            return;
                        }
                        // 原字幕行在播控切换后卸载时，改由最近一次有效矩形锚定（仅切换一次，避免 detached 元素的 (0,0) 把浮层推回窗口左上角）
                        setReferenceRef.current?.(toVirtualElement(lastValidRectRef.current));
                        return;
                    }
                    const connectedRect = readConnectedRect(currentTarget.triggerEl);
                    if (connectedRect) {
                        lastValidRectRef.current = connectedRect;
                    }
                }
                update();
            }),
        middleware: [offset(8), flip(), shift({ padding: 8 })],
    });

    // 在浏览器绘制前同步 Floating UI reference，避免首帧停在 (0,0) 再跳回目标词上方
    useLayoutEffect(() => {
        setReferenceRef.current = refs.setReference;
        if (!open || !target) {
            lastValidRectRef.current = null;
            refs.setReference(null);
            return;
        }
        lastValidRectRef.current = target.anchorRect ?? target.virtualRect ?? null;
        if (target.triggerEl) {
            if (target.triggerEl.isConnected) {
                const connectedRect = readConnectedRect(target.triggerEl);
                if (connectedRect) {
                    lastValidRectRef.current = connectedRect;
                }
                refs.setReference(target.triggerEl);
                return;
            }
            if (mode === 'hover' || !lastValidRectRef.current) {
                closePopover();
                return;
            }
            refs.setReference(toVirtualElement(lastValidRectRef.current));
            return;
        }
        if (target.virtualRect) {
            refs.setReference(toVirtualElement(target.virtualRect));
        }
    }, [closePopover, mode, open, refs, target]);

    const hover = useHover(context, {
        enabled: open && mode === 'hover' && Boolean(target?.triggerEl),
        move: false,
        handleClose: safePolygon(),
    });
    const dismiss = useDismiss(context);
    const role = useRole(context, { role: 'dialog' });
    const { getFloatingProps } = useInteractions([hover, dismiss, role]);

    // 弹窗打开时暂停播放并记录 open/hover 遭遇事件
    useEffect(() => {
        if (!open || !target || !cleanWord) {
            return;
        }
        const session = usePlaybackSession.getState();
        const action = mode === 'hover' ? 'hover' : 'open';
        if (action === 'hover' && !shouldRecordEncounter('hover', `${cleanWord}:${sentenceHash ?? ''}`)) {
            return;
        }
        if (action === 'open' && !shouldRecordEncounter('open', cleanWord)) {
            return;
        }
        void videoLearningApi.recordWordEncounter({
            word: cleanWord,
            action,
            videoId: session.videoId ?? undefined,
            fileHash: session.srtHash ?? undefined,
            sentenceIndex,
            sentenceHash,
            context: sentenceText,
        });
    }, [cleanWord, mode, open, sentenceHash, sentenceIndex, sentenceText, target]);

    const dictionaryEntry = useDictionaryStream((state) => (
        original ? state.getActiveEntry(original, sentenceText) : undefined
    ));
    const shouldFetch = open && Boolean(target) && Boolean(original);

    const { data: wordMemory } = useSWR(
        shouldFetch && cleanWord ? ['vocabulary/word-memory', cleanWord] : null,
        () => videoLearningApi.getWordMemory(cleanWord),
        {
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        },
    );

    const { data: contextPack } = useSWR(
        shouldFetch && sentenceText && target?.kind === 'word'
            ? contextPackKey(
                { fileHash: sentenceHash ?? '', index: sentenceIndex ?? 0, text: sentenceText },
                isProactiveGuidance(vocabularyGuidance) ? vocabularyGuidance : 'calm',
            )
            : null,
        () => videoLearningApi.contextPack({
            text: sentenceText ?? '',
            fileHash: sentenceHash,
            sentenceIndex,
            guidance: isProactiveGuidance(vocabularyGuidance) ? vocabularyGuidance : 'calm',
        }),
        {
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        },
    );

    const promptReasonCodes: ContextReasonCode[] | undefined = useMemo(() => {
        if (!contextPack || !cleanWord) return undefined;
        const hit = contextPack.candidates.find(
            (w) => w.word.toLowerCase() === cleanWord || w.surface.toLowerCase() === cleanWord,
        );
        return hit && hit.reasons.length > 0 ? hit.reasons : undefined;
    }, [cleanWord, contextPack]);

    const promptReasons = useMemo(
        () => promptReasonCodes?.map((code) => tPlayer(`contextSuggestion.reasons.${code}`)),
        [promptReasonCodes, tPlayer],
    );

    const {
        data: dictionaryResponse,
        isLoading: dictionaryLoading,
        mutate,
    } = useSWR(
        shouldFetch ? ['ai-trans/word', original, sentenceText ?? ''] : null,
        async ([_apiName, wordParam, sentenceParam]) => {
            const targetWord = wordParam as string;
            const ctxSentence = (sentenceParam as string) || undefined;
            const requestId = createDictionaryRequestId(targetWord);
            useDictionaryStream.getState().startRequest(targetWord, requestId, ctxSentence);

            try {
                const result = await playerApi.translateWord({
                    word: targetWord,
                    context: ctxSentence,
                    requestId,
                });
                const activeRequestId = useDictionaryStream.getState().getActiveEntry(targetWord, ctxSentence)?.requestId;
                if (activeRequestId && activeRequestId !== requestId) {
                    return null;
                }
                useDictionaryStream.getState().setFinalResult(targetWord, requestId, isOpenAIDictionaryResult(result) ? result : null, ctxSentence);
                return isOpenAIDictionaryResult(result) ? result : null;
            } catch (error) {
                const activeRequestId = useDictionaryStream.getState().getActiveEntry(targetWord, ctxSentence)?.requestId;
                if (activeRequestId && activeRequestId !== requestId) {
                    return null;
                }
                logger.error('failed to lookup dictionary', { word: targetWord, error: error instanceof Error ? error.message : error });
                useDictionaryStream.getState().setFinalResult(targetWord, requestId, null, ctxSentence);
                return null;
            }
        },
        {
            revalidateOnFocus: false,
            revalidateIfStale: false,
            shouldRetryOnError: false,
        },
    );

    const handleRefresh = useCallback(async () => {
        if (!original) return;
        const ctxSentence = sentenceText || undefined;
        const requestId = createDictionaryRequestId(original);
        useDictionaryStream.getState().startRequest(original, requestId, ctxSentence);

        try {
            const newData = await playerApi.translateWord({
                word: original,
                forceRefresh: true,
                context: ctxSentence,
                requestId,
            });
            const activeRequestId = useDictionaryStream.getState().getActiveEntry(original, ctxSentence)?.requestId;
            if (activeRequestId && activeRequestId !== requestId) {
                return;
            }
            const next = isOpenAIDictionaryResult(newData) ? newData : null;
            if (next) {
                await mutate(next, false);
            } else {
                toast.error(t('aiDictionaryFailed', { defaultValue: 'AI 释义生成失败，请稍后重试' }));
            }
            useDictionaryStream.getState().setFinalResult(original, requestId, next, ctxSentence);
        } catch (error) {
            const activeRequestId = useDictionaryStream.getState().getActiveEntry(original, ctxSentence)?.requestId;
            if (activeRequestId && activeRequestId !== requestId) {
                return;
            }
            logger.error('failed to refresh dictionary', { word: original, error: error instanceof Error ? error.message : error });
            toast.error(t('aiDictionaryFailed', { defaultValue: 'AI 释义生成失败，请稍后重试' }));
            useDictionaryStream.getState().setFinalResult(original, requestId, null, ctxSentence);
        }
    }, [mutate, original, sentenceText, t]);

    const vocabKey = target?.lemma || original || cleanWord;
    const isInVocabulary = target
        ? (target.kind === 'phrase'
            ? isVocabularyWord(cleanWord) || isVocabularyWord(original)
            : isVocabularyWord(target.word) || isVocabularyWord(original))
        : false;
    const optimisticSavedVersion = target && optimisticSaved?.popKey === target.popKey
        ? optimisticSaved.version
        : null;
    const optimisticStatus = target && optimisticStatusState?.popKey === target.popKey
        ? optimisticStatusState.status
        : null;
    const effectiveFavorited = isInVocabulary || (optimisticSavedVersion !== null && optimisticSavedVersion === vocabularyVersion);
    const rawWordStatus = cleanWord ? getWordStatus(vocabKey) : undefined;
    const effectiveWordStatus = optimisticStatus ?? rawWordStatus ?? null;

    const favoriting = Boolean(target && favoritingPopKey === target.popKey);
    const updatingStatus = Boolean(target && updatingStatusPopKey === target.popKey);

    const handleFavorite = useCallback(async () => {
        if (!target || favoritingPopKey === target.popKey) return;
        const activePopKey = target.popKey;
        const wasFavorited = effectiveFavorited;
        const deleteKey = getBaseWord(target.word) ?? getBaseWord(original) ?? (target.kind === 'phrase' ? cleanWord : original);

        setFavoritingPopKey(activePopKey);
        try {
            if (wasFavorited) {
                const result = await videoLearningApi.deleteWord(deleteKey);
                if (result.success) {
                    removeVocabularyWords([target.word, original, cleanWord, deleteKey]);
                    setOptimisticSaved((prev) => (prev?.popKey === activePopKey ? null : prev));
                    setOptimisticStatusState((prev) => (prev?.popKey === activePopKey ? null : prev));
                } else {
                    toast.error(result.error || t('unfavoriteWordFailed'));
                }
                return;
            }

            const result = await videoLearningApi.favoriteWord(original, buildFavoriteTranslate(dictionaryResponse));
            if (result.success) {
                setWordStatus(result.data?.word ?? cleanWord, 'learning');
                setOptimisticSaved({
                    popKey: activePopKey,
                    version: useVocabularyStore.getState().version,
                });
                const session = usePlaybackSession.getState();
                void videoLearningApi.recordWordEncounter({
                    word: cleanWord,
                    action: 'save',
                    videoId: session.videoId ?? undefined,
                    fileHash: session.srtHash ?? undefined,
                    sentenceIndex,
                    sentenceHash,
                    context: sentenceText,
                });
            } else {
                toast.error(result.error || t('favoriteWordFailed'));
            }
        } catch (error) {
            logger.error('toggle favorite word failed', { error: error instanceof Error ? error.message : error });
            toast.error(wasFavorited ? t('unfavoriteWordFailed') : t('favoriteWordFailed'));
        } finally {
            setFavoritingPopKey((prev) => (prev === activePopKey ? null : prev));
        }
    }, [cleanWord, dictionaryResponse, effectiveFavorited, favoritingPopKey, getBaseWord, original, removeVocabularyWords, sentenceHash, sentenceIndex, sentenceText, setWordStatus, t, target]);

    const handleStatusChange = useCallback(async (next: WordStatus) => {
        if (!target || updatingStatusPopKey === target.popKey) return;
        const activePopKey = target.popKey;
        const nextTarget: WordStatus = effectiveWordStatus === next ? 'learning' : next;
        setUpdatingStatusPopKey(activePopKey);
        try {
            const result = await videoLearningApi.updateWordState(cleanWord, nextTarget);
            if (result.success) {
                setWordStatus(cleanWord, nextTarget);
                setOptimisticStatusState({ popKey: activePopKey, status: nextTarget });
                const session = usePlaybackSession.getState();
                void videoLearningApi.recordWordEncounter({
                    word: cleanWord,
                    action: nextTarget === 'known' ? 'known' : nextTarget === 'ignored' ? 'ignore' : 'save',
                    videoId: session.videoId ?? undefined,
                    fileHash: session.srtHash ?? undefined,
                    sentenceIndex,
                    sentenceHash,
                    context: sentenceText,
                });
            } else {
                toast.error(result.error || t('updateWordStatusFailed'));
            }
        } catch (error) {
            logger.error('update word status failed', { error: error instanceof Error ? error.message : error });
            toast.error(t('updateWordStatusFailed'));
        } finally {
            setUpdatingStatusPopKey((prev) => (prev === activePopKey ? null : prev));
        }
    }, [cleanWord, effectiveWordStatus, sentenceHash, sentenceIndex, sentenceText, setWordStatus, t, target, updatingStatusPopKey]);

    // 划词短语弹出时自动提供可选短语朗读能力（点击收藏等仍不阻塞）
    useEffect(() => {
        if (open && mode === 'selection' && target?.word) {
            void (async () => {
                try {
                    const ttsUrl = await getTtsUrl(target.word);
                    if (ttsUrl) {
                        await playAudioUrl(ttsUrl);
                    } else {
                        await playWord(target.word);
                    }
                } catch {
                    // 静默忽略划词朗读失败
                }
            })();
        }
    }, [mode, open, target?.word, target?.popKey]);

    if (!open || !target) {
        return null;
    }

    const isStreaming = Boolean(dictionaryEntry && !dictionaryEntry.isComplete);
    const streamingData = isStreaming ? dictionaryEntry?.data ?? null : null;
    const showLoading = dictionaryLoading && !streamingData && !dictionaryResponse;

    const resolvedFloatingStyles: React.CSSProperties = isPositioned
        ? floatingStyles
        : { ...floatingStyles, visibility: 'hidden', pointerEvents: 'none' };

    return (
        <Eb key={`word-pop-${target.popKey}`}>
            <WordPop
                classNames={target.wordClassNames}
                translation={dictionaryResponse}
                isLoading={showLoading}
                openaiStreamingData={streamingData}
                isStreaming={isStreaming}
                onRefresh={handleRefresh}
                onFavorite={handleFavorite}
                isFavorited={effectiveFavorited}
                isFavoriting={favoriting}
                wordStatus={effectiveWordStatus}
                onMarkKnown={() => { void handleStatusChange('known'); }}
                onMarkIgnored={() => { void handleStatusChange('ignored'); }}
                isUpdatingStatus={updatingStatus}
                floatingStyles={resolvedFloatingStyles}
                getFloatingProps={getFloatingProps}
                setFloatingRef={refs.setFloating}
                contextWord={target.word}
                dialogLabel={target.word}
                contextSentence={sentenceText}
                sentenceIndex={sentenceIndex}
                sentenceHash={sentenceHash}
                onClose={closePopover}
                onPin={pinPopover}
                wordMemory={wordMemory ?? null}
                promptReasons={promptReasons}
            />
        </Eb>
    );
};

export default WordPopoverHost;
