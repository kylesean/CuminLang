import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as i18nT } from 'i18next';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { BookOpenText, FileText, Headphones, Loader2, Plus, Settings, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useShallow } from 'zustand/react/shallow';

import type {
    ReaderDocumentSummary,
    SavedSentenceTag,
    SavedSentenceVO,
} from '@/common/types/contextStudio';
import type { Sentence } from '@/common/types/SentenceC';
import MediaUtil, { SupportedAudioFormats } from '@/common/utils/MediaUtil';
import PageHeader from '@/frontend/components/shared/common/PageHeader';
import useDpTaskCenter from '@/frontend/app/stores/dpTaskStore';
import { contextStudioApi } from '@/frontend/features/context-studio/contextStudioApi';
import { useSavedSentences } from '@/frontend/features/context-studio/savedSentencesStore';
import {
    groupSentencesIntoBlocks,
    groupSentencesIntoParagraphs,
    type SentenceBlock,
} from '@/frontend/features/player/lib/sentence-grouping';
import {
    replaceSentenceRangeText,
} from '@/frontend/features/player/lib/transcript-edit-ops';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { playerApi } from '@/frontend/features/player/playerApi';
import { useSubtitleGenerationStore } from '@/frontend/features/player/subtitleGenerationStore';
import {
    EMPTY_SENTENCE_VOCABULARY_COUNT,
    sentenceVocabularyKey,
    useTranscriptVocabularyCounts,
} from '@/frontend/features/player/transcriptVocabulary';
import { useVocabularyState, useVocabularyStore } from '@/frontend/features/player/vocabularyStore';
import useSubtitleTranslation, { EMPTY_TRANSLATIONS } from '@/frontend/features/player/translationStore';
import { videoLearningApi } from '@/frontend/features/video-learning/videoLearningApi';
import { playContextAudio, stopActiveAudio } from '@/frontend/infrastructure/audio/AudioPlayer';
import { settingsApi } from '@/frontend/features/settings/settingsApi';
import { ScriptArticleParagraph } from './components/ScriptArticleParagraph';
import { ScriptDocDrawer } from './components/ScriptDocDrawer';
import { ScriptReaderInspector } from './components/ScriptReaderInspector';
import { ScriptReaderToolbar } from './components/ScriptReaderToolbar';
import { buildReaderMarkdown } from './lib/exportReaderMarkdown';
import {
    collectReaderVocabularySummary,
    filterReaderSentences,
    getSavedReaderProgress,
    saveReaderProgress,
    type ScriptReaderFilter,
} from './lib/readerProgress';

const VIRTUALIZE_PARAGRAPH_THRESHOLD = 40;
const AUDIO_EXTENSIONS = SupportedAudioFormats.map((ext) => ext.replace(/^\./, ''));
const AUDIO_AND_SRT_EXTENSIONS = [...AUDIO_EXTENSIONS, 'srt'];

async function isAnyLocalAsrModelReady(): Promise<boolean> {
    try {
        if (typeof settingsApi.getResourceStatus !== 'function') {
            return true;
        }
        const snapshot = await settingsApi.getResourceStatus();
        return Boolean(snapshot?.transcription?.ready);
    } catch {
        return true;
    }
}

export default function ScriptReaderPage() {
    const { t } = useTranslation('pages');
    const navigate = useNavigate();
    const { videoId: routeVideoId } = useParams<{ videoId?: string }>();
    const [searchParams] = useSearchParams();
    const deepLinkSentenceRaw = searchParams.get('sentence');
    const playingVideoId = usePlaybackSession((s) => s.videoId);

    const [documents, setDocuments] = useState<ReaderDocumentSummary[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(true);
    const [docQuery, setDocQuery] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedVideoId, setSelectedVideoId] = useState<string>(routeVideoId ?? '');

    const [sentences, setSentences] = useState<Sentence[]>([]);
    const [loadedScriptVideoId, setLoadedScriptVideoId] = useState<string | null>(null);
    const [activeCursor, setActiveCursor] = useState<{ videoId?: string; index: number | null }>({
        videoId: routeVideoId,
        index: null,
    });
    const [playingAudioScope, setPlayingAudioScope] = useState<{ videoId: string; index: number } | null>(null);
    const [editingState, setEditingState] = useState<{ videoId: string; key: string } | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [importingAudio, setImportingAudio] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [asrMissingForVideoId, setAsrMissingForVideoId] = useState<string | null>(null);
    const [docReloadToken, setDocReloadToken] = useState(0);

    const [filter, setFilter] = useState<ScriptReaderFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showTranslation, setShowTranslation] = useState(true);
    const [savedByKey, setSavedByKey] = useState<Map<string, SavedSentenceVO>>(() => new Map());
    const [candidateState, setCandidateState] = useState<{ videoId: string; words: string[] }>({
        videoId: '',
        words: [],
    });

    const savedKeys = useSavedSentences((s) => s.savedKeys);
    const toggleSavedSentence = useSavedSentences((s) => s.toggleSentence);
    const { getWordStatus, version: vocabVersion } = useVocabularyState(
        useShallow((s) => ({
            getWordStatus: s.getWordStatus,
            version: s.version,
        })),
    );

    const taskIdsByVideo = useSubtitleGenerationStore((s) => s.taskIdsByVideo);
    const startingVideos = useSubtitleGenerationStore((s) => s.startingVideos);
    const cancellingVideos = useSubtitleGenerationStore((s) => s.cancellingVideos);
    const startGeneration = useSubtitleGenerationStore((s) => s.start);
    const cancelGeneration = useSubtitleGenerationStore((s) => s.cancel);
    const tasks = useDpTaskCenter((s) => s.tasks);

    const paragraphVirtuosoRef = useRef<VirtuosoHandle | null>(null);
    const plainScrollerRef = useRef<HTMLDivElement | null>(null);
    const audioEpochRef = useRef(0);
    const showTranslationRef = useRef(showTranslation);

    useEffect(() => {
        showTranslationRef.current = showTranslation;
    });

    const requestReaderTranslation = useCallback((fileHash: string | undefined, sentenceIndex: number) => {
        if (!fileHash || !showTranslationRef.current) {
            return;
        }
        const store = useSubtitleTranslation.getState();
        if (store.activeFileHash !== fileHash) {
            store.setActiveFileHash(fileHash);
        }
        store.requestTranslation(fileHash, Math.max(0, sentenceIndex));
    }, []);

    const refreshDocuments = useCallback(async (preferredVideoId?: string) => {
        const docs = await contextStudioApi.listReaderDocuments();
        setDocuments(docs);
        if (preferredVideoId) {
            setSelectedVideoId(preferredVideoId);
        } else {
            setSelectedVideoId((prev) => prev || docs[0]?.videoId || '');
        }
        return docs;
    }, []);

    // 初次挂载拉取全部精读篇目
    useEffect(() => {
        let cancelled = false;
        void contextStudioApi
            .listReaderDocuments()
            .then((docs) => {
                if (cancelled) return;
                setDocuments(docs);
                setSelectedVideoId((prev) => prev || docs[0]?.videoId || '');
            })
            .catch(() => {
                if (!cancelled) {
                    toast.error(i18nT('pages:scriptReader.loadDocsFailed', { defaultValue: '加载文稿列表失败' }));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingDocs(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    // 卸载页面时确保停止单句点读音频
    useEffect(() => () => {
        audioEpochRef.current += 1;
        stopActiveAudio();
    }, []);

    const effectiveVideoId = routeVideoId || selectedVideoId;
    const activeDoc = useMemo(
        () => documents.find((d) => d.videoId === effectiveVideoId) ?? null,
        [documents, effectiveVideoId],
    );
    const activeHasSubtitle = Boolean(activeDoc && activeDoc.srtFile.trim().length > 0);
    const loadingScript = Boolean(activeDoc && activeHasSubtitle) && loadedScriptVideoId !== activeDoc?.videoId;
    const activeSentences = useMemo(
        () => (activeDoc && activeHasSubtitle ? sentences : []),
        [activeDoc, activeHasSubtitle, sentences],
    );

    const stopSingleAudio = useCallback(() => {
        audioEpochRef.current += 1;
        stopActiveAudio();
        setPlayingAudioScope(null);
    }, []);

    const handleSelectDoc = useCallback((nextVideoId: string) => {
        stopSingleAudio();
        setSelectedVideoId(nextVideoId);
        setFilter('all');
        setSearchQuery('');
        setEditingState(null);
        setAsrMissingForVideoId(null);
        if (routeVideoId !== nextVideoId) {
            navigate(`/reader/${encodeURIComponent(nextVideoId)}`, { replace: true });
        }
    }, [navigate, routeVideoId, stopSingleAudio]);

    // 加载当前文档字幕、金句笔记、生词状态与场景分节
    useEffect(() => {
        if (!activeDoc) {
            return;
        }
        let cancelled = false;

        void useSavedSentences.getState().loadForVideo(activeDoc.videoId);
        if (typeof contextStudioApi.listSavedSentences === 'function') {
            void contextStudioApi
                .listSavedSentences()
                .then((items) => {
                    if (cancelled) return;
                    const map = new Map<string, SavedSentenceVO>();
                    for (const item of items) {
                        if (item.videoId === activeDoc.videoId) {
                            map.set(item.sentenceKey, item);
                        }
                    }
                    setSavedByKey(map);
                })
                .catch(() => {
                    // 忽略补充笔记加载失败
                });
        }

        if (!activeDoc.srtFile.trim()) {
            return () => {
                cancelled = true;
            };
        }

        const sessionId = `reader-${activeDoc.videoId}-${Date.now()}`;
        const activateDocSubtitle = async () => {
            if (typeof playerApi.getPlayerDetail === 'function') {
                try {
                    await playerApi.getPlayerDetail(activeDoc.videoId);
                } catch {
                    // 忽略详情读取失败，直接尝试解析字幕
                }
            }
            return playerApi.parseSubtitleToSentences({
                subtitlePath: activeDoc.srtFile,
                videoId: activeDoc.videoId,
                playbackSessionId: sessionId,
            });
        };

        void activateDocSubtitle()
            .then((parsed) => {
                if (cancelled) return;
                const parsedSentences = parsed?.sentences ?? [];
                setSentences(parsedSentences);

                const fileHash = parsed?.fileHash ?? parsedSentences[0]?.fileHash;
                if (fileHash) {
                    const resumeIdx = getSavedReaderProgress(activeDoc.videoId) ?? parsedSentences[0]?.index ?? 0;
                    requestReaderTranslation(fileHash, resumeIdx);
                }
                if (fileHash && typeof playerApi.matchSubtitleVocabulary === 'function') {
                    void playerApi
                        .matchSubtitleVocabulary({
                            fileHash,
                            videoId: activeDoc.videoId,
                            playbackSessionId: sessionId,
                        })
                        .then((match) => {
                            if (!cancelled && !match.cancelled && match.wordStates) {
                                useVocabularyStore.getState().setVocabularyStates(match.wordStates);
                            }
                        })
                        .catch(() => {
                            // 词汇状态匹配失败不影响正文渲染
                        });
                }
                if (parsedSentences.length > 0 && typeof playerApi.getDocumentDifficultWords === 'function') {
                    void playerApi
                        .getDocumentDifficultWords(parsedSentences.map((s) => s.text))
                        .then((res) => {
                            if (!cancelled && Array.isArray(res?.words)) {
                                setCandidateState({
                                    videoId: activeDoc.videoId,
                                    words: res.words,
                                });
                            }
                        })
                        .catch(() => {
                            // 冷启动候选词提取失败时静默退回个人词表
                        });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setSentences([]);
                    toast.error(i18nT('pages:scriptReader.parseFailed', { defaultValue: '解析文稿字幕失败' }));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadedScriptVideoId(activeDoc.videoId);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeDoc, docReloadToken, requestReaderTranslation]);

    const filteredDocs = useMemo(() => {
        const q = docQuery.trim().toLowerCase();
        if (!q) return documents;
        return documents.filter((d) => d.title.toLowerCase().includes(q));
    }, [documents, docQuery]);

    const vocabularyCounts = useTranscriptVocabularyCounts(activeSentences);
    const countOf = useCallback(
        (sentence: Sentence) =>
            vocabularyCounts.get(sentenceVocabularyKey(sentence)) ?? EMPTY_SENTENCE_VOCABULARY_COUNT,
        [vocabularyCounts],
    );

    const searchActive = searchQuery.trim() !== '';
    const allTranslations = useSubtitleTranslation((state) => state.translations);
    const searchTranslations = searchActive ? allTranslations : EMPTY_TRANSLATIONS;

    const effectiveCandidateWords = useMemo(() => {
        if (!activeDoc || candidateState.videoId !== activeDoc.videoId || candidateState.words.length === 0) {
            return new Set<string>();
        }
        const next = new Set<string>();
        for (const word of candidateState.words) {
            const status = getWordStatus(word);
            if (status !== 'known' && status !== 'ignored' && status !== 'familiar') {
                next.add(word);
            }
        }
        return next;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDoc, candidateState, getWordStatus, vocabVersion]);

    const displaySentences = useMemo(
        () => filterReaderSentences({
            sentences: activeSentences,
            filter,
            query: searchQuery,
            countOf,
            savedKeys,
            translations: searchTranslations,
            candidateWords: effectiveCandidateWords,
        }),
        [activeSentences, filter, searchQuery, countOf, savedKeys, searchTranslations, effectiveCandidateWords],
    );

    const paragraphs = useMemo(
        () => groupSentencesIntoParagraphs(displaySentences),
        [displaySentences],
    );

    const logicalUnits = useMemo(
        () => paragraphs.flatMap((p) => groupSentencesIntoBlocks(p.sentences)),
        [paragraphs],
    );

    const vocabSummary = useMemo(
        () => collectReaderVocabularySummary(activeSentences, getWordStatus, 10, effectiveCandidateWords),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [activeSentences, getWordStatus, vocabVersion, effectiveCandidateWords],
    );

    const fallbackSentenceIndex = useMemo(() => {
        if (!activeDoc || loadingScript || activeSentences.length === 0) {
            return null;
        }
        const parsedDeepLink =
            deepLinkSentenceRaw !== null && deepLinkSentenceRaw.trim() !== ''
                ? Number(deepLinkSentenceRaw)
                : NaN;
        if (
            Number.isInteger(parsedDeepLink) &&
            parsedDeepLink >= 0 &&
            (!routeVideoId || routeVideoId === activeDoc.videoId) &&
            activeSentences.some((s) => s.index === parsedDeepLink)
        ) {
            return parsedDeepLink;
        }
        const saved = getSavedReaderProgress(activeDoc.videoId);
        if (saved !== null && activeSentences.some((s) => s.index === saved)) {
            return saved;
        }
        return activeSentences[0].index;
    }, [activeDoc, activeSentences, deepLinkSentenceRaw, loadingScript, routeVideoId]);

    const activeSentenceIndex =
        activeDoc && activeCursor.videoId === activeDoc.videoId && activeCursor.index !== null
            ? activeCursor.index
            : fallbackSentenceIndex;

    const activeSentence = useMemo(
        () => (
            activeSentenceIndex !== null
                ? activeSentences.find((s) => s.index === activeSentenceIndex) ?? null
                : null
        ),
        [activeSentences, activeSentenceIndex],
    );

    const currentUnitOrder = useMemo(() => {
        if (activeSentenceIndex === null) return null;
        const pos = logicalUnits.findIndex((u) => u.sentences.some((s) => s.index === activeSentenceIndex));
        return pos >= 0 ? pos : null;
    }, [logicalUnits, activeSentenceIndex]);

    const activeUnit = currentUnitOrder !== null ? logicalUnits[currentUnitOrder] ?? null : null;

    const scrollToSentenceIndex = useCallback((sentenceIndex: number) => {
        const blockPos = paragraphs.findIndex((b) => b.sentences.some((s) => s.index === sentenceIndex));
        if (blockPos >= 0 && paragraphs.length > VIRTUALIZE_PARAGRAPH_THRESHOLD) {
            paragraphVirtuosoRef.current?.scrollToIndex({
                index: blockPos,
                align: 'center',
                behavior: 'smooth',
            });
            return;
        }

        const el = plainScrollerRef.current?.querySelector(
            `[data-testid="script-sentence-row-${sentenceIndex}"]`,
        );
        if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
            (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, [paragraphs]);

    const focusSentence = useCallback((sentenceIndex: number, shouldScroll = false) => {
        if (!activeDoc) return;
        setActiveCursor({ videoId: activeDoc.videoId, index: sentenceIndex });
        saveReaderProgress(activeDoc.videoId, sentenceIndex);
        requestReaderTranslation(activeSentences[0]?.fileHash, sentenceIndex);
        if (shouldScroll) {
            setTimeout(() => scrollToSentenceIndex(sentenceIndex), 0);
        }
    }, [activeDoc, activeSentences, requestReaderTranslation, scrollToSentenceIndex]);

    // 初次加载文档字幕完成时滚动到初始聚焦句并拉取译文
    useEffect(() => {
        if (fallbackSentenceIndex === null) {
            return;
        }
        requestReaderTranslation(activeSentences[0]?.fileHash, fallbackSentenceIndex);
        scrollToSentenceIndex(fallbackSentenceIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDoc?.videoId, loadingScript, deepLinkSentenceRaw]);

    const handleSelectSentence = useCallback((sentence: Sentence) => {
        focusSentence(sentence.index, false);
    }, [focusSentence]);

    const handleStepUnit = useCallback((delta: -1 | 1) => {
        if (logicalUnits.length === 0) return;
        const nextPos = currentUnitOrder === null
            ? (delta > 0 ? 0 : logicalUnits.length - 1)
            : Math.min(logicalUnits.length - 1, Math.max(0, currentUnitOrder + delta));
        const target = logicalUnits[nextPos];
        if (target) {
            focusSentence(target.repr.index, true);
        }
    }, [currentUnitOrder, focusSentence, logicalUnits]);

    // 键盘 ← / → 在正文区快速切上下句（焦点不在输入框或原地编辑器内时生效）
    useEffect(() => {
        if (!activeDoc || logicalUnits.length === 0) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
                return;
            }
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                return;
            }
            const target = event.target as HTMLElement | null;
            if (
                target
                && (
                    target.tagName === 'INPUT'
                    || target.tagName === 'TEXTAREA'
                    || target.tagName === 'SELECT'
                    || target.isContentEditable
                    || (typeof target.closest === 'function' && Boolean(target.closest('[data-inline-editor="true"]')))
                )
            ) {
                return;
            }
            event.preventDefault();
            handleStepUnit(event.key === 'ArrowLeft' ? -1 : 1);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeDoc, handleStepUnit, logicalUnits.length]);

    const handlePlaySingleUnit = useCallback(async (unit: SentenceBlock) => {
        if (!activeDoc || unit.sentences.length === 0) return;
        const docId = activeDoc.videoId;
        const epoch = ++audioEpochRef.current;
        const first = unit.sentences[0];
        const last = unit.sentences[unit.sentences.length - 1];
        const fullText = unit.sentences.map((s) => s.text.trim()).filter(Boolean).join(' ');
        setPlayingAudioScope({ videoId: docId, index: unit.repr.index });
        try {
            await playContextAudio({
                text: fullText,
                videoPath: activeDoc.videoPath,
                startTime: first.adjustedStart ?? first.start,
                endTime: last.adjustedEnd ?? last.end,
                playbackRate: 1,
                waitForEnd: true,
            });
        } catch {
            // 播放失败静默收回播放态
        } finally {
            if (audioEpochRef.current === epoch) {
                setPlayingAudioScope(null);
            }
        }
    }, [activeDoc]);

    const handleToggleTranslation = useCallback(() => {
        const next = !showTranslation;
        setShowTranslation(next);
        if (next) {
            const fileHash = activeSentences[0]?.fileHash;
            const targetIdx = activeSentenceIndex ?? activeSentences[0]?.index ?? 0;
            if (fileHash) {
                const store = useSubtitleTranslation.getState();
                if (store.activeFileHash !== fileHash) {
                    store.setActiveFileHash(fileHash);
                }
                store.requestTranslation(fileHash, Math.max(0, targetIdx));
            }
        }
    }, [showTranslation, activeSentences, activeSentenceIndex]);

    const handleToggleSave = useCallback((sentence: Sentence, displayText?: string) => {
        if (!activeDoc) return;
        const sentenceKey = `${sentence.fileHash}:${sentence.index}`;
        void toggleSavedSentence({
            sentenceKey,
            videoId: activeDoc.videoId,
            videoTitle: activeDoc.title,
            fileHash: sentence.fileHash,
            sentenceIndex: sentence.index,
            startTime: sentence.adjustedStart ?? sentence.start,
            endTime: sentence.adjustedEnd ?? sentence.end,
            text: displayText ?? sentence.text,
            textZh: sentence.textZH || '',
        })
            .then((saved) => {
                toast.success(
                    saved
                        ? t('scriptReader.savedToast', { defaultValue: '已收藏金句' })
                        : t('scriptReader.unsavedToast', { defaultValue: '已取消收藏' }),
                );
                if (!saved) {
                    setSavedByKey((prev) => {
                        const next = new Map(prev);
                        next.delete(sentenceKey);
                        return next;
                    });
                }
            })
            .catch(() => {
                toast.error(t('scriptReader.saveFailed', { defaultValue: '操作失败' }));
            });
    }, [activeDoc, toggleSavedSentence, t]);

    const persistNoteForSentence = useCallback(async (
        sentence: Sentence,
        displayText: string,
        tag: SavedSentenceTag,
        note: string,
        silentToast = false,
    ) => {
        if (!activeDoc) return;
        const sentenceKey = `${sentence.fileHash}:${sentence.index}`;
        try {
            if (!savedKeys.has(sentenceKey)) {
                const created = await contextStudioApi.saveSentence({
                    sentenceKey,
                    videoId: activeDoc.videoId,
                    videoTitle: activeDoc.title,
                    fileHash: sentence.fileHash,
                    sentenceIndex: sentence.index,
                    startTime: sentence.adjustedStart ?? sentence.start,
                    endTime: sentence.adjustedEnd ?? sentence.end,
                    text: displayText || sentence.text,
                    textZh: sentence.textZH || '',
                    tag,
                    note,
                });
                await useSavedSentences.getState().loadForVideo(activeDoc.videoId);
                setSavedByKey((prev) => new Map(prev).set(sentenceKey, created));
                if (!silentToast) {
                    toast.success(t('scriptReader.noteSavedAndBookmarkedToast', { defaultValue: '笔记已保存并收进金句' }));
                }
                return;
            }
            if (typeof contextStudioApi.updateSavedSentence === 'function') {
                const updated = await contextStudioApi.updateSavedSentence({
                    sentenceKey,
                    tag,
                    note,
                });
                if (updated) {
                    setSavedByKey((prev) => new Map(prev).set(sentenceKey, updated));
                }
            }
            if (!silentToast) {
                toast.success(t('scriptReader.noteSavedToast', { defaultValue: '笔记已保存' }));
            }
        } catch {
            toast.error(t('scriptReader.saveFailed', { defaultValue: '操作失败' }));
        }
    }, [activeDoc, savedKeys, t]);

    const handleSaveNote = useCallback(async (
        sentence: Sentence,
        displayText: string,
        tag: SavedSentenceTag,
        note: string,
    ) => {
        await persistNoteForSentence(sentence, displayText, tag, note, false);
    }, [persistNoteForSentence]);

    const handleAppendNoteText = useCallback(async (
        sentence: Sentence,
        displayText: string,
        extraText: string,
        inferredTag?: SavedSentenceTag,
    ) => {
        const key = `${sentence.fileHash}:${sentence.index}`;
        const existing = savedByKey.get(key);
        const mergedNote = existing?.note?.trim()
            ? `${existing.note.trim()}\n${extraText}`
            : extraText;
        const resolvedTag = existing?.tag && existing.tag !== 'general'
            ? existing.tag
            : (inferredTag ?? existing?.tag ?? 'general');
        await persistNoteForSentence(sentence, displayText, resolvedTag, mergedNote, true);
    }, [persistNoteForSentence, savedByKey]);

    const handleMarkWordKnown = useCallback(async (word: string) => {
        try {
            const res = await videoLearningApi.updateWordState(word, 'known');
            if (res.success) {
                useVocabularyStore.getState().setWordStatus(word, 'known');
                toast.success(t('scriptReader.wordMarkedKnown', { defaultValue: '已将 "{{word}}" 标为已掌握', word }));
            }
        } catch {
            toast.error(t('scriptReader.saveFailed', { defaultValue: '操作失败' }));
        }
    }, [t]);

    const handleCommitEdit = useCallback(async (startIndex: number, endIndex: number, nextText: string) => {
        if (!activeDoc || isSavingEdit) return;
        const targetSentence = activeSentences.find((s) => s.index === startIndex);
        if (!targetSentence) {
            setEditingState(null);
            return;
        }
        const nextLines = replaceSentenceRangeText(activeSentences, startIndex, endIndex, nextText);
        if (!nextLines) {
            setEditingState(null);
            return;
        }
        setIsSavingEdit(true);
        try {
            const response = await playerApi.saveEditedSubtitle({
                videoId: activeDoc.videoId,
                ...(activeDoc.videoPath ? { videoPath: activeDoc.videoPath } : {}),
                ...(activeDoc.srtFile ? { sourceSubtitlePath: activeDoc.srtFile } : {}),
                oldFileHash: targetSentence.fileHash,
                lines: nextLines,
            });
            setSentences(response.srt.sentences);
            setDocuments((prev) => prev.map((d) => (
                d.videoId === activeDoc.videoId
                    ? { ...d, srtFile: response.srt.filePath, hasSubtitle: true }
                    : d
            )));
            setEditingState(null);
            void useSavedSentences.getState().loadForVideo(activeDoc.videoId).catch(() => undefined);
            toast.success(t('scriptReader.proofreadSaved', { defaultValue: '已校对并保存为 .edited.srt' }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(t('scriptReader.proofreadFailed', { defaultValue: '保存校对失败: {{message}}', message }));
        } finally {
            setIsSavingEdit(false);
        }
    }, [activeDoc, activeSentences, isSavingEdit, t]);

    const startAudioTranscription = useCallback(async (videoId: string) => {
        const modelReady = await isAnyLocalAsrModelReady();
        if (!modelReady) {
            setAsrMissingForVideoId(videoId);
            return;
        }
        setAsrMissingForVideoId(null);
        await startGeneration(
            videoId,
            {
                done: t('scriptReader.transcribeDone', { defaultValue: '本地转写完成，精读文稿已就绪' }),
                formatFailed: (message) => t('scriptReader.transcribeFailed', { defaultValue: '转写失败: {{message}}', message }),
            },
            {
                onDone: (finishedId) => {
                    void refreshDocuments(finishedId).then(() => {
                        setDocReloadToken((v) => v + 1);
                    });
                },
            },
        );
    }, [refreshDocuments, startGeneration, t]);

    const handleImportAudio = useCallback(async () => {
        if (importingAudio) return;
        setImportingAudio(true);
        try {
            const selected = await playerApi.selectFiles(AUDIO_AND_SRT_EXTENSIONS);
            if (!selected || selected.length === 0) {
                return;
            }
            const audioPaths = selected.filter((p) => MediaUtil.isAudio(p));
            const srtPaths = selected.filter((p) => MediaUtil.isSrt(p));
            if (audioPaths.length === 0) {
                toast.error(t('scriptReader.noAudioSelected', { defaultValue: '请选择至少一个音频文件（MP3 / M4A / WAV 等）' }));
                return;
            }
            const createdIds = await playerApi.createWatchHistoryEntries(audioPaths);
            if (createdIds.length === 0) {
                toast.error(t('scriptReader.importAudioFailed', { defaultValue: '未能导入音频文件' }));
                return;
            }
            if (audioPaths.length === 1 && srtPaths.length === 1) {
                await playerApi.attachSubtitleTrack(audioPaths[0], srtPaths[0]);
            }
            const firstId = createdIds[0];
            const docs = await refreshDocuments(firstId);
            setLoadedScriptVideoId(null);
            setDrawerOpen(false);
            if (routeVideoId !== firstId) {
                navigate(`/reader/${encodeURIComponent(firstId)}`, { replace: true });
            }

            const firstDoc = docs.find((d) => d.videoId === firstId);
            if (firstDoc && !(firstDoc.hasSubtitle ?? Boolean(firstDoc.srtFile))) {
                void startAudioTranscription(firstId);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(t('scriptReader.importAudioFailed', { defaultValue: '导入音频失败: {{message}}', message }));
        } finally {
            setImportingAudio(false);
        }
    }, [importingAudio, navigate, refreshDocuments, routeVideoId, startAudioTranscription, t]);

    const handleAttachExternalSrt = useCallback(async (doc: ReaderDocumentSummary) => {
        try {
            const selected = await playerApi.selectFiles(['srt']);
            const srtPath = selected?.[0];
            if (!srtPath) return;
            await playerApi.attachSubtitleTrack(doc.videoPath, srtPath);
            await refreshDocuments(doc.videoId);
            setLoadedScriptVideoId(null);
            setAsrMissingForVideoId(null);
            setDocReloadToken((v) => v + 1);
            toast.success(t('scriptReader.attachSrtSuccess', { defaultValue: '字幕文稿已挂载' }));
        } catch {
            toast.error(t('scriptReader.attachSrtFailed', { defaultValue: '挂载字幕失败' }));
        }
    }, [refreshDocuments, t]);

    const handleExportMarkdown = useCallback(async () => {
        if (!activeDoc || paragraphs.length === 0 || exporting) return;
        setExporting(true);
        try {
            const markdown = buildReaderMarkdown({
                doc: activeDoc,
                paragraphs,
                translations: allTranslations,
                savedByKey,
                vocabSummary,
                includeTranslation: showTranslation,
            });
            const res = await contextStudioApi.exportReaderMarkdown({
                defaultFileName: activeDoc.title,
                markdown,
            });
            if (res.success && !res.canceled) {
                toast.success(t('scriptReader.exportSuccess', { defaultValue: '已导出精读讲义 (.md)' }));
            } else if (!res.canceled && res.error) {
                toast.error(res.error);
            }
        } catch {
            toast.error(t('scriptReader.exportFailed', { defaultValue: '导出讲义失败' }));
        } finally {
            setExporting(false);
        }
    }, [activeDoc, allTranslations, exporting, paragraphs, savedByKey, showTranslation, t, vocabSummary]);

    const handleJumpToPlayer = useCallback(
        (targetSentence: Sentence | null, withPractice = false) => {
            if (!activeDoc) return;
            const query = new URLSearchParams();
            if (targetSentence) {
                const tSec = Math.max(0, Math.floor(targetSentence.adjustedStart ?? targetSentence.start));
                if (tSec > 0) {
                    query.set('t', String(tSec));
                }
            }
            if (withPractice) {
                query.set('practice', 'shadowing');
            }
            const qs = query.toString();
            navigate(`/player/${activeDoc.videoId}${qs ? `?${qs}` : ''}`);
        },
        [activeDoc, navigate],
    );

    const handleJumpToSentenceFromNav = useCallback((sentenceIndex: number) => {
        if (filter !== 'all') {
            setFilter('all');
        }
        if (searchQuery) {
            setSearchQuery('');
        }
        focusSentence(sentenceIndex, true);
    }, [filter, focusSentence, searchQuery]);

    const savedInDocCount = useMemo(() => {
        let count = 0;
        for (const s of activeSentences) {
            if (savedKeys.has(`${s.fileHash}:${s.index}`)) {
                count += 1;
            }
        }
        return count;
    }, [activeSentences, savedKeys]);

    // 当前待转写纯音频文档的任务状态
    const activeTaskId = activeDoc ? taskIdsByVideo[activeDoc.videoId] : undefined;
    const activeStarting = activeDoc ? Boolean(startingVideos[activeDoc.videoId]) : false;
    const activeCancelling = activeDoc ? Boolean(cancellingVideos[activeDoc.videoId]) : false;
    const activeTask = activeTaskId !== undefined ? tasks.get(activeTaskId) : undefined;
    const activeProgress = activeTask && activeTask !== 'init' ? activeTask.progress : null;
    const activePercent = activeTask && activeTask !== 'init' ? activeTask.progressMeta?.percent : undefined;
    const isTranscribingActive = activeStarting || activeTaskId !== undefined;

    const editingSentenceKey = activeDoc && editingState?.videoId === activeDoc.videoId
        ? editingState.key
        : null;

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-body">
            {/* 顶栏标题 */}
            <div className="px-6 pt-5 pb-2 shrink-0">
                <PageHeader
                    title={t('scriptReader.title', { defaultValue: '精读文稿' })}
                    description={t('scriptReader.description', {
                        defaultValue: '书卷排版阅读、词汇难点诊断、AI 精读搭档与双语讲义沉淀',
                    })}
                />
            </div>

            {/* 篇目切换与纯音频导入抽屉 */}
            <ScriptDocDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                documents={filteredDocs}
                loadingDocs={loadingDocs}
                docQuery={docQuery}
                onDocQueryChange={setDocQuery}
                activeVideoId={activeDoc?.videoId}
                playingVideoId={playingVideoId}
                onSelectDoc={handleSelectDoc}
                onImportAudio={() => void handleImportAudio()}
                importingAudio={importingAudio}
            />

            {/* 主工作区：默认两栏（左文阅读 + 右精读案头） */}
            <div className="flex-1 min-h-0 px-6 pb-5 pt-2 overflow-hidden">
                <Card padding={0} height="100%" className="h-full min-h-0 flex flex-col overflow-hidden">
                    {activeDoc ? (
                        <>
                            <ScriptReaderToolbar
                                title={activeDoc.title}
                                mediaType={activeDoc.mediaType}
                                hasSubtitle={activeHasSubtitle}
                                totalSentences={activeSentences.length}
                                savedCount={savedInDocCount}
                                docCount={documents.length}
                                onOpenDocDrawer={() => setDrawerOpen(true)}
                                onImportAudio={() => void handleImportAudio()}
                                importingAudio={importingAudio}
                                filter={filter}
                                onChangeFilter={setFilter}
                                searchQuery={searchQuery}
                                onChangeSearchQuery={setSearchQuery}
                                showTranslation={showTranslation}
                                onToggleTranslation={handleToggleTranslation}
                                onExportMarkdown={() => void handleExportMarkdown()}
                                exporting={exporting}
                                onOpenInPlayer={() => handleJumpToPlayer(activeSentence, false)}
                                vocabSummary={vocabSummary}
                                onJumpToSentenceIndex={handleJumpToSentenceFromNav}
                            />

                            <div className="flex-1 min-h-0 flex overflow-hidden">
                                {/* 左栏：书卷文稿画布（或纯音频转写引导/进度态） */}
                                <section
                                    aria-label={t('scriptReader.canvasLabel', { defaultValue: '文稿阅读画布' })}
                                    className="flex-1 min-w-0 flex flex-col min-h-0 bg-body/60"
                                >
                                    {!activeHasSubtitle ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                                            {isTranscribingActive ? (
                                                <>
                                                    <Loader2 className="h-8 w-8 text-accent animate-spin" />
                                                    <Text type="body" weight="medium">
                                                        {t('scriptReader.transcribingTitle', { defaultValue: '正在本地语音转写生成精读文稿...' })}
                                                    </Text>
                                                    <Text type="supporting" color="secondary" role="status" aria-live="polite">
                                                        {activeProgress ?? t('scriptReader.transcribingPreparing', { defaultValue: '准备声学识别引擎中...' })}
                                                    </Text>
                                                    {typeof activePercent === 'number' && (
                                                        <div className="w-64 h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div
                                                                className="h-full bg-accent transition-all duration-300"
                                                                style={{ width: `${Math.min(100, Math.max(4, activePercent))}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        isDisabled={activeCancelling || activeTaskId === undefined}
                                                        label={t('scriptReader.cancelTranscribe', { defaultValue: '取消转写' })}
                                                        onClick={() => void cancelGeneration(
                                                            activeDoc.videoId,
                                                            (msg) => t('scriptReader.transcribeFailed', { defaultValue: '转写失败: {{message}}', message: msg }),
                                                        )}
                                                    />
                                                </>
                                            ) : asrMissingForVideoId === activeDoc.videoId ? (
                                                <>
                                                    <Headphones className="h-8 w-8 text-secondary/70" />
                                                    <Text type="body" weight="medium">
                                                        {t('scriptReader.asrMissingTitle', { defaultValue: '尚未安装本地语音识别模型' })}
                                                    </Text>
                                                    <Text type="supporting" color="secondary" className="max-w-md">
                                                        {t('scriptReader.asrMissingDesc', {
                                                            defaultValue: '纯音频转写需要本地离线语音识别模型，你可以前往设置一键安装，或直接挂载同音频对应的 .srt 字幕文件。',
                                                        })}
                                                    </Text>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="primary"
                                                            icon={<Settings className="h-3.5 w-3.5" />}
                                                            label={t('scriptReader.goInstallAsr', { defaultValue: '前往设置安装模型' })}
                                                            onClick={() => navigate('/settings/resources')}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            icon={<Upload className="h-3.5 w-3.5" />}
                                                            label={t('scriptReader.attachSrtBtn', { defaultValue: '挂载已有 .srt' })}
                                                            onClick={() => void handleAttachExternalSrt(activeDoc)}
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <Headphones className="h-8 w-8 text-accent/80" />
                                                    <Text type="body" weight="medium">
                                                        {t('scriptReader.audioPendingTitle', { defaultValue: '该音频尚无配套文稿' })}
                                                    </Text>
                                                    <Text type="supporting" color="secondary" className="max-w-md">
                                                        {t('scriptReader.audioPendingDesc', {
                                                            defaultValue: '可直接使用本地识别模型转写为按意群排版的精读文稿，或挂载已有的 .srt 字幕文件。',
                                                        })}
                                                    </Text>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="primary"
                                                            label={t('scriptReader.startTranscribe', { defaultValue: '开始本地识别转写' })}
                                                            onClick={() => void startAudioTranscription(activeDoc.videoId)}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            icon={<Upload className="h-3.5 w-3.5" />}
                                                            label={t('scriptReader.attachSrtBtn', { defaultValue: '挂载已有 .srt' })}
                                                            onClick={() => void handleAttachExternalSrt(activeDoc)}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ) : loadingScript ? (
                                        <div className="py-12 text-center text-sm text-secondary">
                                            {t('scriptReader.loadingScript', { defaultValue: '加载文稿中...' })}
                                        </div>
                                    ) : activeSentences.length === 0 ? (
                                        <div className="py-12 text-center text-sm text-secondary">
                                            {t('scriptReader.emptyScript', { defaultValue: '暂无字幕内容' })}
                                        </div>
                                    ) : displaySentences.length === 0 ? (
                                        <div className="py-12 text-center text-sm text-secondary">
                                            {t('scriptReader.emptyFiltered', { defaultValue: '当前筛选或搜索条件没有匹配句子' })}
                                        </div>
                                    ) : paragraphs.length > VIRTUALIZE_PARAGRAPH_THRESHOLD ? (
                                        <Virtuoso
                                            ref={paragraphVirtuosoRef}
                                            className="flex-1 min-h-0 scrollbar-thin scrollbar-thumb-rounded-full"
                                            data={paragraphs}
                                            computeItemKey={(idx, block) => `para-${block.sentences[0]?.index ?? idx}`}
                                            rangeChanged={({ startIndex, endIndex }) => {
                                                const midBlockIdx = Math.min(
                                                    paragraphs.length - 1,
                                                    Math.max(0, Math.floor((startIndex + endIndex) / 2)),
                                                );
                                                const target = paragraphs[midBlockIdx]?.sentences[0];
                                                if (target) {
                                                    requestReaderTranslation(target.fileHash, target.index);
                                                }
                                            }}
                                            itemContent={(_, block) => (
                                                <div className="px-10 py-3">
                                                    <ScriptArticleParagraph
                                                        block={block}
                                                        activeSentenceIndex={activeSentenceIndex}
                                                        editingSentenceKey={editingSentenceKey}
                                                        isSavingEdit={isSavingEdit}
                                                        showTranslation={showTranslation}
                                                        searchQuery={searchQuery}
                                                        savedKeys={savedKeys}
                                                        savedByKey={savedByKey}
                                                        onSelectSentence={handleSelectSentence}
                                                        onCommitEdit={(startIdx, endIdx, nextText) => void handleCommitEdit(startIdx, endIdx, nextText)}
                                                        onCancelEdit={() => setEditingState(null)}
                                                    />
                                                </div>
                                            )}
                                        />
                                    ) : (
                                        <div
                                            ref={plainScrollerRef}
                                            onScroll={(e) => {
                                                if (paragraphs.length === 0) return;
                                                const el = e.currentTarget;
                                                const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
                                                const ratio = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
                                                const approxIdx = Math.min(
                                                    paragraphs.length - 1,
                                                    Math.floor(ratio * paragraphs.length),
                                                );
                                                const target = paragraphs[approxIdx]?.sentences[0];
                                                if (target) {
                                                    requestReaderTranslation(target.fileHash, target.index);
                                                }
                                            }}
                                            className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full px-10 py-8 flex flex-col gap-6"
                                        >
                                            {paragraphs.map((block, idx) => (
                                                <ScriptArticleParagraph
                                                    key={`para-${block.sentences[0]?.index ?? idx}`}
                                                    block={block}
                                                    activeSentenceIndex={activeSentenceIndex}
                                                    editingSentenceKey={editingSentenceKey}
                                                    isSavingEdit={isSavingEdit}
                                                    showTranslation={showTranslation}
                                                    searchQuery={searchQuery}
                                                    savedKeys={savedKeys}
                                                    savedByKey={savedByKey}
                                                    onSelectSentence={handleSelectSentence}
                                                    onCommitEdit={(startIdx, endIdx, nextText) => void handleCommitEdit(startIdx, endIdx, nextText)}
                                                    onCancelEdit={() => setEditingState(null)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </section>

                                {/* 右栏：固定精读案头（诊断 + 笔记 + 按需 AI 精读搭档） */}
                                {activeHasSubtitle && activeSentences.length > 0 && (
                                    <ScriptReaderInspector
                                        videoId={activeDoc.videoId}
                                        totalUnits={logicalUnits.length}
                                        currentUnitOrder={currentUnitOrder}
                                        allSentences={activeSentences}
                                        activeUnit={activeUnit}
                                        savedRecord={
                                            activeUnit
                                                ? savedByKey.get(`${activeUnit.repr.fileHash}:${activeUnit.repr.index}`)
                                                : undefined
                                        }
                                        isSaved={
                                            activeUnit
                                                ? savedKeys.has(`${activeUnit.repr.fileHash}:${activeUnit.repr.index}`)
                                                : false
                                        }
                                        isAudioPlayingHere={Boolean(
                                            activeUnit
                                            && playingAudioScope?.videoId === activeDoc.videoId
                                            && playingAudioScope?.index === activeUnit.repr.index,
                                        )}
                                        isEditingHere={Boolean(
                                            activeUnit
                                            && editingSentenceKey === `${activeUnit.repr.fileHash}:${activeUnit.repr.index}`,
                                        )}
                                        onStepUnit={handleStepUnit}
                                        onPlaySingleUnit={(u) => void handlePlaySingleUnit(u)}
                                        onStopAudio={stopSingleAudio}
                                        onToggleSave={handleToggleSave}
                                        onSaveNote={handleSaveNote}
                                        onAppendNoteText={handleAppendNoteText}
                                        onStartEdit={(s) => {
                                            setEditingState({
                                                videoId: activeDoc.videoId,
                                                key: `${s.fileHash}:${s.index}`,
                                            });
                                        }}
                                        onJumpToPlayer={handleJumpToPlayer}
                                        onMarkWordKnown={(word) => void handleMarkWordKnown(word)}
                                        onJumpToSentenceIndex={handleJumpToSentenceFromNav}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-4">
                            <BookOpenText className="h-9 w-9 text-secondary/60" />
                            <Text type="body" weight="medium">
                                {loadingDocs
                                    ? t('scriptReader.loadingDocs', { defaultValue: '加载文稿中...' })
                                    : t('scriptReader.emptySelectTitle', { defaultValue: '暂无可精读的文稿' })}
                            </Text>
                            <Text type="supporting" color="secondary" className="max-w-sm">
                                {t('scriptReader.emptySelectDesc', {
                                    defaultValue: '可以从媒体库导入带字幕的视频，或直接导入 MP3 / M4A 播客音频生成精读文稿。',
                                })}
                            </Text>
                            {!loadingDocs && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        icon={<Plus className="h-3.5 w-3.5" />}
                                        label={t('scriptReader.importAudioShort', { defaultValue: '导入音频' })}
                                        isDisabled={importingAudio}
                                        onClick={() => void handleImportAudio()}
                                    />
                                    {documents.length > 0 && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            icon={<FileText className="h-3.5 w-3.5" />}
                                            label={t('scriptReader.openDocListBtn', { defaultValue: '浏览文稿列表' })}
                                            onClick={() => setDrawerOpen(true)}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
