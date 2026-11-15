import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useWordPopoverStore, type WordPopoverTarget } from './wordPopoverStore';

const logger = getRendererLogger('WordPopoverHost');

const MAX_SELECTION_PHRASE_WORDS = 6;

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
    const { open, mode, target, openImmediately, closePopover } = useWordPopoverStore(
        useShallow((s) => ({
            open: s.open,
            mode: s.mode,
            target: s.target,
            openImmediately: s.openImmediately,
            closePopover: s.closePopover,
        })),
    );

    const { t } = useTranslation('common');
    const { t: tPlayer } = useTranslation('player');

    const pause = usePlayer((s) => s.pause);
    const [favoriting, setFavoriting] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
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

    // 划词多词自动识别为词组浮层（同一句内跨 2..6 个单词）
    useEffect(() => {
        const handleMouseUp = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                return;
            }
            const range = selection.getRangeAt(0);
            if (range.getBoundingClientRect().width < 4) {
                return;
            }

            const anchorEl = (
                selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement
            )?.closest('[data-word="true"]') as HTMLElement | null;
            const focusEl = (
                selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement
            )?.closest('[data-word="true"]') as HTMLElement | null;

            if (!anchorEl || !focusEl || anchorEl === focusEl) {
                return;
            }

            const sHash = anchorEl.dataset.sentenceHash ?? '';
            const sIndex = anchorEl.dataset.sentenceIndex ?? '';
            if (
                (focusEl.dataset.sentenceHash ?? '') !== sHash ||
                (focusEl.dataset.sentenceIndex ?? '') !== sIndex
            ) {
                return;
            }

            const rootEl = range.commonAncestorContainer instanceof Element
                ? range.commonAncestorContainer
                : range.commonAncestorContainer.parentElement;
            if (!rootEl) {
                return;
            }

            const intersected = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-word="true"]'))
                .filter((el) => (
                    (el.dataset.sentenceHash ?? '') === sHash &&
                    (el.dataset.sentenceIndex ?? '') === sIndex &&
                    range.intersectsNode(el)
                ));

            if (intersected.length < 2 || intersected.length > MAX_SELECTION_PHRASE_WORDS) {
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

            const rect = range.getBoundingClientRect();
            const parsedIndex = sIndex ? Number.parseInt(sIndex, 10) : undefined;
            const nextSentenceText = anchorEl.dataset.sentenceText || undefined;

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

    const { refs, floatingStyles, context } = useFloating({
        open: open && Boolean(target),
        onOpenChange: (next) => {
            if (!next) {
                closePopover();
            }
        },
        placement: 'top',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift({ padding: 8 })],
    });

    // 同步当前激活词元或虚拟划词矩形到 Floating UI reference
    useEffect(() => {
        if (!open || !target) {
            refs.setReference(null);
            return;
        }
        if (target.triggerEl) {
            refs.setReference(target.triggerEl);
            return;
        }
        if (target.virtualRect) {
            const snapshot = target.virtualRect;
            const virtualEl: VirtualElement = {
                getBoundingClientRect: () => new DOMRect(
                    snapshot.left,
                    snapshot.top,
                    snapshot.width,
                    snapshot.height,
                ),
            };
            refs.setReference(virtualEl);
        }
    }, [open, refs, target]);

    const hover = useHover(context, {
        enabled: open && mode === 'hover' && Boolean(target?.triggerEl),
        move: false,
        handleClose: safePolygon(),
    });
    const dismiss = useDismiss(context);
    const { getFloatingProps } = useInteractions([hover, dismiss]);

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
        original ? state.getActiveEntry(original) : undefined
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
            const requestId = createDictionaryRequestId(targetWord);
            useDictionaryStream.getState().startRequest(targetWord, requestId);

            try {
                const result = await playerApi.translateWord({
                    word: targetWord,
                    context: (sentenceParam as string) || undefined,
                    requestId,
                });
                const activeRequestId = useDictionaryStream.getState().wordActiveRequest.get(targetWord.toLowerCase());
                if (activeRequestId && activeRequestId !== requestId) {
                    return null;
                }
                useDictionaryStream.getState().setFinalResult(targetWord, requestId, isOpenAIDictionaryResult(result) ? result : null);
                return isOpenAIDictionaryResult(result) ? result : null;
            } catch (error) {
                const activeRequestId = useDictionaryStream.getState().wordActiveRequest.get(targetWord.toLowerCase());
                if (activeRequestId && activeRequestId !== requestId) {
                    return null;
                }
                logger.error('failed to lookup dictionary', { word: targetWord, error: error instanceof Error ? error.message : error });
                useDictionaryStream.getState().setFinalResult(targetWord, requestId, null);
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
        const requestId = createDictionaryRequestId(original);
        useDictionaryStream.getState().startRequest(original, requestId);

        try {
            const newData = await playerApi.translateWord({
                word: original,
                forceRefresh: true,
                context: sentenceText || undefined,
                requestId,
            });
            const activeRequestId = useDictionaryStream.getState().wordActiveRequest.get(original.toLowerCase());
            if (activeRequestId && activeRequestId !== requestId) {
                return;
            }
            const next = isOpenAIDictionaryResult(newData) ? newData : null;
            useDictionaryStream.getState().setFinalResult(original, requestId, next);
            await mutate(next, false);
        } catch (error) {
            const activeRequestId = useDictionaryStream.getState().wordActiveRequest.get(original.toLowerCase());
            if (activeRequestId && activeRequestId !== requestId) {
                return;
            }
            logger.error('failed to refresh dictionary', { word: original, error: error instanceof Error ? error.message : error });
            useDictionaryStream.getState().setFinalResult(original, requestId, null);
        }
    }, [mutate, original, sentenceText]);

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

    const handleFavorite = useCallback(async () => {
        if (!target || favoriting) return;
        const wasFavorited = effectiveFavorited;
        const deleteKey = getBaseWord(target.word) ?? getBaseWord(original) ?? (target.kind === 'phrase' ? cleanWord : original);

        setFavoriting(true);
        try {
            if (wasFavorited) {
                const result = await videoLearningApi.deleteWord(deleteKey);
                if (result.success) {
                    removeVocabularyWords([target.word, original, cleanWord, deleteKey]);
                    setOptimisticSaved(null);
                    setOptimisticStatusState(null);
                } else {
                    toast.error(result.error || t('unfavoriteWordFailed'));
                }
                return;
            }

            const result = await videoLearningApi.favoriteWord(original, buildFavoriteTranslate(dictionaryResponse));
            if (result.success) {
                setOptimisticSaved({
                    popKey: target.popKey,
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
            setFavoriting(false);
        }
    }, [cleanWord, dictionaryResponse, effectiveFavorited, favoriting, getBaseWord, original, removeVocabularyWords, sentenceHash, sentenceIndex, sentenceText, t, target]);

    const handleStatusChange = useCallback(async (next: WordStatus) => {
        if (!target || updatingStatus) return;
        const nextTarget: WordStatus = effectiveWordStatus === next ? 'learning' : next;
        setUpdatingStatus(true);
        try {
            const result = await videoLearningApi.updateWordState(cleanWord, nextTarget);
            if (result.success) {
                setWordStatus(cleanWord, nextTarget);
                setOptimisticStatusState({ popKey: target.popKey, status: nextTarget });
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
            setUpdatingStatus(false);
        }
    }, [cleanWord, effectiveWordStatus, sentenceHash, sentenceIndex, sentenceText, setWordStatus, t, target, updatingStatus]);

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
                floatingStyles={floatingStyles}
                getFloatingProps={getFloatingProps}
                setFloatingRef={refs.setFloating}
                contextWord={target.word}
                dialogLabel={target.word}
                contextSentence={sentenceText}
                wordMemory={wordMemory ?? null}
                promptReasons={promptReasons}
            />
        </Eb>
    );
};

export default WordPopoverHost;
