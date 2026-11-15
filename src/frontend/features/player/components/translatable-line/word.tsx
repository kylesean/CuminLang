import React from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { playWord, getTtsUrl, playAudioUrl } from '@/frontend/infrastructure/audio/AudioPlayer';
import { cn } from '@/frontend/lib/utils';
import { VOCAB_ANNOTATION_TESTIDS } from '@/common/constants/qa-testids';
import { getRendererLogger } from '@/frontend/log/simple-logger';
import { useVocabularyState } from '@/frontend/features/player/vocabularyStore';
import { useTransLineTheme } from './translatable-theme';
import useSetting from '@/frontend/features/settings/settingsStore';
import { usePlayer } from '@/frontend/features/player/playerStore';
import {
    VOCABULARY_GUIDANCE_LEVELS,
    type VocabularyGuidance,
} from '@/common/types/vocabulary';
import {
    resolveVocabularyAnnotation,
    type VocabularyAnnotationSurface,
} from '@/frontend/features/player/vocabularyAnnotations';
import { useWordPopoverStore, type WordPopoverTarget } from './wordPopoverStore';

const logger = getRendererLogger('Word');

/**
 * 单词交互组件的入参。
 */
export interface WordParam {
    word: string;
    original: string;
    lemma?: string;
    /** 单词所属句子原文，传给上下文语境解读。 */
    sentenceText?: string;
    /** 单词所属句子索引。 */
    sentenceIndex?: number;
    /** 单词所属字幕文件哈希，用于定位语境证据。 */
    sentenceHash?: string;
    /** 当前单词渲染在哪一层：主字幕只标 `learning`，文稿层按引导档位同时标 `familiar`。 */
    surface?: VocabularyAnnotationSurface;
    /** 可选外部高亮控制；未提供时由全局 WordPopoverStore 自动判定。 */
    pop?: boolean;
    /** 可选外部请求回调（兼容旧调用方）。 */
    requestPop?: () => void;
    /** 唯一浮层键；传入后仅该实例高亮。 */
    popKey?: string;
    show: boolean;
    alwaysDark?: boolean;
    /**
     * 细粒度样式覆盖（className 会与默认主题拼合，传空字符串可清空某项样式）
     */
    classNames?: {
        word?: string;
        hover?: string;
        vocab?: string;
        vocabFamiliar?: string;
        reference?: string;
        openaiContainer?: string;
        refreshButton?: string;
    };
    children?: React.ReactNode;
}

const buildCleanWord = (lemma: string | undefined, word: string): string => (
    (lemma || word)
        .toLowerCase()
        .replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, '')
);

const hasMeaningfulSelection = (target: HTMLElement): boolean => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return false;
    }
    return selection.containsNode(target, true);
};

async function playSingleWordAudio(word: string): Promise<void> {
    try {
        const ttsUrl = await getTtsUrl(word);
        if (ttsUrl) {
            await playAudioUrl(ttsUrl);
        } else {
            await playWord(word);
        }
    } catch (error) {
        logger.error('failed to play pronunciation', { error: error instanceof Error ? error.message : error });
    }
}

/**
 * 轻量级可交互单词节点。
 *
 * 仅订阅词汇注解布尔状态与全局激活态，将 Floating UI / SWR / AI 流式逻辑全部委托给 `WordPopoverHost`。
 */
function WordBase({
    word,
    original,
    lemma,
    sentenceText,
    sentenceIndex,
    sentenceHash,
    surface = 'transcript',
    pop,
    requestPop,
    popKey,
    show,
    alwaysDark = false,
    classNames,
    children,
}: WordParam) {
    const { t } = useTranslation('player');
    const theme = useTransLineTheme();
    const spanRef = React.useRef<HTMLSpanElement | null>(null);

    const cleanWord = buildCleanWord(lemma, word);
    const lookupKey = lemma || original || word;
    const resolvedPopKey = popKey ?? `${sentenceHash ?? ''}:${sentenceIndex ?? ''}:${original}:${cleanWord}`;

    const isActiveTarget = useWordPopoverStore(
        (s) => s.open && s.target?.popKey === resolvedPopKey,
    );
    const isOpen = pop !== undefined ? (pop && isActiveTarget) : isActiveTarget;

    const rawWordStatus = useVocabularyState(
        useShallow((s) => (cleanWord ? s.getWordStatus(lookupKey) : undefined)),
    );
    const guidanceRaw = useSetting((state) => state.values.get('player.vocabularyGuidance'));
    const pauseOnWordHover = useSetting((state) => state.values.get('player.pauseOnWordHover')) === 'true';

    const vocabularyGuidance: VocabularyGuidance = VOCABULARY_GUIDANCE_LEVELS.includes(guidanceRaw as VocabularyGuidance)
        ? (guidanceRaw as VocabularyGuidance)
        : 'coach';

    const annotationKind = resolveVocabularyAnnotation(
        rawWordStatus,
        vocabularyGuidance,
        surface,
    );

    const baseStyle = show ? undefined : { textShadow: '0 0 8px currentColor' };
    const hoverBg = classNames?.hover ?? (alwaysDark ? 'hover:bg-muted/70' : theme.word.hoverBgClass);
    const vocabStyle = classNames?.vocab ?? theme.word.vocabHighlightClass;
    const vocabFamiliarStyle = classNames?.vocabFamiliar ?? theme.word.vocabFamiliarClass;
    const referenceBg = classNames?.reference ?? theme.word.popReferenceBgClass;

    const buildTarget = (): WordPopoverTarget => ({
        kind: 'word',
        popKey: resolvedPopKey,
        word,
        original,
        cleanWord,
        lemma,
        sentenceText,
        sentenceIndex,
        sentenceHash,
        alwaysDark,
        wordClassNames: {
            openaiContainer: classNames?.openaiContainer,
            refreshButton: classNames?.refreshButton,
        },
        triggerEl: spanRef.current,
    });

    return (
        <span
            ref={spanRef}
            data-word="true"
            data-word-text={word}
            data-lemma={cleanWord}
            data-sentence-index={sentenceIndex !== undefined ? String(sentenceIndex) : undefined}
            data-sentence-hash={sentenceHash}
            data-sentence-text={sentenceText}
            data-vocab-annotation={annotationKind ?? undefined}
            data-testid={annotationKind ? VOCAB_ANNOTATION_TESTIDS[annotationKind] : undefined}
            className={cn(
                'rounded cursor-pointer inline',
                hoverBg,
                classNames?.word,
                isOpen && referenceBg,
                show && annotationKind === 'learning' && vocabStyle,
                show && annotationKind === 'familiar' && vocabFamiliarStyle,
            )}
            role="button"
            tabIndex={0}
            title={annotationKind === 'familiar' ? t('wordStatusFamiliar') : undefined}
            onMouseEnter={(e) => {
                if (pauseOnWordHover || e.altKey) {
                    usePlayer.getState().pause();
                }
                requestPop?.();
                useWordPopoverStore.getState().scheduleHoverOpen(buildTarget());
            }}
            onMouseLeave={() => {
                useWordPopoverStore.getState().cancelHoverOpen();
            }}
            onClick={(e) => {
                if (hasMeaningfulSelection(e.currentTarget)) {
                    return;
                }
                e.stopPropagation();
                usePlayer.getState().pause();
                requestPop?.();
                useWordPopoverStore.getState().openImmediately(buildTarget(), 'click');
                void playSingleWordAudio(word);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    usePlayer.getState().pause();
                    requestPop?.();
                    useWordPopoverStore.getState().openImmediately(buildTarget(), 'click');
                    void playSingleWordAudio(word);
                }
            }}
        >
            <span style={baseStyle} className={cn(!show && 'text-transparent')}>
                {children ?? word}
            </span>
        </span>
    );
}

const Word = React.memo(WordBase);
Word.displayName = 'Word';

export default Word;
