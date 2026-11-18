import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as i18nT } from 'i18next';
import { Virtuoso } from 'react-virtuoso';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import {
    Bookmark,
    BookOpen,
    BookOpenText,
    Clock,
    Download,
    Headphones,
    Layers,
    NotebookPen,
    Search,
    Square,
    Upload,
    Volume2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import PageHeader from '@/frontend/components/shared/common/PageHeader';
import { ContextStudioListSkeleton } from '@/frontend/components/shared/LoadingStates';
import MemoryMapSection from '@/frontend/features/learning-data/MemoryMapSection';
import WordEditDialog from '@/frontend/features/video-learning/components/WordEditDialog';
import type { WordItem } from '@/frontend/features/video-learning/components/WordSidebar';
import { videoLearningApi } from '@/frontend/features/video-learning/videoLearningApi';
import { playContextAudio, stopActiveAudio } from '@/frontend/infrastructure/audio/AudioPlayer';
import { contextStudioApi } from './contextStudioApi';
import WordDetailCanvas from './components/WordDetailCanvas';
import SentenceDetailCanvas from './components/SentenceDetailCanvas';
import { ReviewSessionCanvas } from './components/ReviewSessionCanvas';
import {
    type SavedSentenceTag,
    type SavedSentenceVO,
} from '@/common/types/contextStudio';
import type { ReviewCardVO } from '@/common/types/review';
import type { WordStatus } from '@/common/types/vocabulary';
import MediaUtil from '@/common/utils/MediaUtil';
import { cn } from '@/frontend/lib/utils';

type AssetFilter = 'all' | 'words' | 'sentences' | 'due' | 'learning' | 'familiar' | 'known';
type StudioViewMode = 'workspace' | 'review' | 'memory';

const VALID_FILTERS = new Set<AssetFilter>(['all', 'words', 'sentences', 'due', 'learning', 'familiar', 'known']);
const OPTIONAL_DISPLAY_TAGS: readonly Exclude<SavedSentenceTag, 'general'>[] = [
    'expression',
    'grammar',
    'pronunciation',
];

type StudioSelection =
    | { kind: 'word'; word: WordItem }
    | { kind: 'sentence'; sentence: SavedSentenceVO }
    | null;

type FilteredAssetEntry =
    | { kind: 'word'; word: WordItem }
    | { kind: 'sentence'; sentence: SavedSentenceVO };

const STATUS_BADGE_VARIANT: Record<WordStatus, 'warning' | 'teal' | 'success' | 'neutral'> = {
    learning: 'warning',
    familiar: 'teal',
    known: 'success',
    ignored: 'neutral',
};

const SENTENCE_TAG_DEFAULT_LABEL: Record<SavedSentenceTag, string> = {
    expression: '地道表达',
    pronunciation: '发音连读',
    grammar: '长难句',
    general: '未分类',
};

const REVIEW_QUEUE_LIMIT = 50;
const VIRTUALIZE_ASSET_THRESHOLD = 60;

interface StudioAssetsSnapshot {
    words?: WordItem[];
    sentences?: SavedSentenceVO[];
    dueWords?: Set<string>;
    dueCards?: ReviewCardVO[];
    dueCount?: number;
}

async function fetchStudioAssetsSnapshot(): Promise<StudioAssetsSnapshot> {
    const [wordsRes, sentencesRes, reviewRes] = await Promise.allSettled([
        videoLearningApi.getVocabulary(),
        contextStudioApi.listSavedSentences(),
        videoLearningApi.getReviewQueue(REVIEW_QUEUE_LIMIT),
    ]);

    const snapshot: StudioAssetsSnapshot = {};
    if (wordsRes.status === 'fulfilled' && wordsRes.value.success && Array.isArray(wordsRes.value.data)) {
        snapshot.words = wordsRes.value.data as WordItem[];
    }
    if (sentencesRes.status === 'fulfilled') {
        snapshot.sentences = sentencesRes.value;
    }
    if (reviewRes.status === 'fulfilled' && Array.isArray(reviewRes.value.items)) {
        snapshot.dueCards = reviewRes.value.items;
        snapshot.dueWords = new Set(reviewRes.value.items.map((card) => card.word.toLowerCase()));
        snapshot.dueCount = reviewRes.value.dueCount ?? reviewRes.value.items.length;
    }
    return snapshot;
}

export default function ContextStudioPage() {
    const { t } = useTranslation('pages');
    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkWord = searchParams.get('word')?.trim() ?? '';
    const deepLinkSentenceKey = searchParams.get('sentenceKey')?.trim() ?? '';

    const [words, setWords] = useState<WordItem[]>([]);
    const [sentences, setSentences] = useState<SavedSentenceVO[]>([]);
    const [dueWords, setDueWords] = useState<Set<string>>(new Set());
    const [dueCards, setDueCards] = useState<ReviewCardVO[]>([]);
    const [dueTotalCount, setDueTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const viewParam = searchParams.get('view');
    const studioView: StudioViewMode =
        viewParam === 'review'
            ? 'review'
            : viewParam === 'memory' || viewParam === 'map'
                ? 'memory'
                : 'workspace';

    const setStudioView = useCallback(
        (nextView: StudioViewMode) => {
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (nextView === 'workspace') {
                        next.delete('view');
                    } else {
                        next.set('view', nextView);
                    }
                    return next;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );

    const [topicCards, setTopicCards] = useState<ReviewCardVO[] | null>(null);
    const [activeReviewTopic, setActiveReviewTopic] = useState<string | null>(null);
    const [reviewSessionKey, setReviewSessionKey] = useState(0);

    const [activeFilter, setActiveFilter] = useState<AssetFilter>(() => {
        const filterParam = searchParams.get('filter') as AssetFilter | null;
        return filterParam && VALID_FILTERS.has(filterParam) ? filterParam : 'all';
    });
    const [activeSentenceTag, setActiveSentenceTag] = useState<SavedSentenceTag | 'all'>(() => {
        const tagParam = searchParams.get('tag') as SavedSentenceTag | null;
        return tagParam && ['expression', 'pronunciation', 'grammar', 'general'].includes(tagParam) ? tagParam : 'all';
    });
    const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [explicitSelection, setExplicitSelection] = useState<StudioSelection>(null);
    const [editingWord, setEditingWord] = useState<WordItem | null>(null);
    const [playlistPlaying, setPlaylistPlaying] = useState(false);
    const playlistRunIdRef = useRef(0);

    const stopSentencePlaylist = useCallback(() => {
        playlistRunIdRef.current += 1;
        setPlaylistPlaying(false);
        stopActiveAudio();
    }, []);

    useEffect(() => {
        return () => {
            playlistRunIdRef.current += 1;
            stopActiveAudio();
        };
    }, []);

    // 快照应用此前在初始 effect 里复制了一份，收敛到 applySnapshot；
    // 失败提示与 loading 复位随调用方语境各自收尾。
    const applySnapshot = useCallback((snapshot: StudioAssetsSnapshot) => {
        if (snapshot.words) setWords(snapshot.words);
        if (snapshot.sentences) setSentences(snapshot.sentences);
        if (snapshot.dueWords) setDueWords(snapshot.dueWords);
        if (snapshot.dueCards) setDueCards(snapshot.dueCards);
        if (snapshot.dueCount !== undefined) setDueTotalCount(snapshot.dueCount);
    }, []);

    // isCancelled 由调用方提供，防卸载后的迟到 setState/toast。
    const loadAllAssets = useCallback(async (isCancelled?: () => boolean) => {
        setLoading(true);
        try {
            const snapshot = await fetchStudioAssetsSnapshot();
            if (isCancelled?.()) return;
            applySnapshot(snapshot);
        } catch {
            if (!isCancelled?.()) {
                toast.error(i18nT('pages:contextStudio.loadFailed', { defaultValue: '加载语境资产失败' }));
            }
        } finally {
            if (!isCancelled?.()) {
                setLoading(false);
            }
        }
    }, [applySnapshot]);

    useEffect(() => {
        let cancelled = false;
        // 挂载路径不走 loadAllAssets：其同步前缀 setLoading 会触发
        // react-hooks/set-state-in-effect（loading 初值本就是 true）；async 续体内
        // setState 是允许的，与原实现形态一致。
        void fetchStudioAssetsSnapshot()
            .then((snapshot) => {
                if (!cancelled) applySnapshot(snapshot);
            })
            .catch(() => {
                if (!cancelled) {
                    toast.error(i18nT('pages:contextStudio.loadFailed', { defaultValue: '加载语境资产失败' }));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [applySnapshot]);

    // 统计各分类数量
    const counts = useMemo(() => {
        let learning = 0;
        let familiar = 0;
        let known = 0;
        let due = 0;
        for (const w of words) {
            const st = w.status ?? 'learning';
            if (st === 'learning') learning += 1;
            else if (st === 'familiar') familiar += 1;
            else if (st === 'known') known += 1;
            if (dueWords.has(w.word.toLowerCase())) due += 1;
        }
        return {
            all: words.length + sentences.length,
            words: words.length,
            sentences: sentences.length,
            dueWordsCount: dueWords.size,
            due: Math.max(due, dueTotalCount),
            learning,
            familiar,
            known,
        };
    }, [words, sentences, dueWords, dueTotalCount]);

    const sentenceSources = useMemo(() => {
        const map = new Map<string, string>();
        for (const item of sentences) {
            if (item.videoId && !map.has(item.videoId)) {
                map.set(item.videoId, item.videoTitle || item.videoId);
            }
        }
        return Array.from(map.entries()).map(([videoId, title]) => ({ videoId, title }));
    }, [sentences]);

    const effectiveSourceId =
        activeFilter === 'sentences'
        && selectedSourceId !== 'all'
        && sentenceSources.some((src) => src.videoId === selectedSourceId)
            ? selectedSourceId
            : 'all';

    const sentenceTagCounts = useMemo(() => {
        const result: Record<SavedSentenceTag, number> = {
            expression: 0,
            pronunciation: 0,
            grammar: 0,
            general: 0,
        };
        for (const item of sentences) {
            const tag = item.tag ?? 'general';
            if (tag in result) {
                result[tag] += 1;
            }
        }
        return result;
    }, [sentences]);

    const filteredItems = useMemo<FilteredAssetEntry[]>(() => {
        const q = searchTerm.trim().toLowerCase();
        const showWords = activeFilter !== 'sentences';
        const showSentences = activeFilter === 'all' || activeFilter === 'sentences';

        const wordEntries: FilteredAssetEntry[] = showWords
            ? words
                  .filter((w) => {
                      const st = w.status ?? 'learning';
                      if (activeFilter === 'due' && !dueWords.has(w.word.toLowerCase())) return false;
                      if (activeFilter === 'learning' && st !== 'learning') return false;
                      if (activeFilter === 'familiar' && st !== 'familiar') return false;
                      if (activeFilter === 'known' && st !== 'known') return false;
                      if (!q) return true;
                      return (
                          w.word.toLowerCase().includes(q) ||
                          (w.translate && w.translate.toLowerCase().includes(q))
                      );
                  })
                  .map((word) => ({ kind: 'word' as const, word }))
            : [];

        const sentenceEntries: FilteredAssetEntry[] = showSentences
            ? sentences
                  .filter((s) => {
                      if (activeFilter === 'sentences' && activeSentenceTag !== 'all' && s.tag !== activeSentenceTag) {
                          return false;
                      }
                      if (effectiveSourceId !== 'all' && s.videoId !== effectiveSourceId) {
                          return false;
                      }
                      if (!q) return true;
                      return (
                          s.text.toLowerCase().includes(q) ||
                          s.textZh.toLowerCase().includes(q) ||
                          s.videoTitle.toLowerCase().includes(q) ||
                          (s.note && s.note.toLowerCase().includes(q))
                      );
                  })
                  .map((sentence) => ({ kind: 'sentence' as const, sentence }))
            : [];

        return [...sentenceEntries, ...wordEntries];
    }, [activeFilter, activeSentenceTag, effectiveSourceId, words, sentences, dueWords, searchTerm]);

    // 根据深链 ?word=、显式选中或当前筛选队列首项派生右侧画布聚焦资产。
    // 显式选中与筛选模式不匹配时回落到深链/首项（筛选切换入口已统一清空
    // explicitSelection，这里的守卫只是类型层面的兜底）。
    const selection = useMemo<StudioSelection>(() => {
        if (explicitSelection) {
            const kindMatchesFilter = activeFilter === 'all'
                || (activeFilter === 'sentences'
                    ? explicitSelection.kind === 'sentence'
                    : explicitSelection.kind === 'word');
            if (kindMatchesFilter) {
                return explicitSelection;
            }
        }
        if (deepLinkWord && activeFilter !== 'sentences') {
            const matched = words.find((w) => w.word.toLowerCase() === deepLinkWord.toLowerCase());
            if (matched) {
                return { kind: 'word', word: matched };
            }
            return {
                kind: 'word',
                word: {
                    id: -1,
                    word: deepLinkWord,
                    translate: '',
                    created_at: '',
                    updated_at: '',
                },
            };
        }
        if (deepLinkSentenceKey && (activeFilter === 'all' || activeFilter === 'sentences')) {
            const matchedSentence = sentences.find((s) => s.sentenceKey === deepLinkSentenceKey);
            if (matchedSentence) {
                return { kind: 'sentence', sentence: matchedSentence };
            }
        }
        if (activeFilter === 'sentences') {
            const firstSentence = filteredItems.find((item) => item.kind === 'sentence');
            if (firstSentence) {
                return { kind: 'sentence', sentence: firstSentence.sentence };
            }
        } else {
            const firstWord = filteredItems.find((item) => item.kind === 'word');
            if (firstWord) {
                return { kind: 'word', word: firstWord.word };
            }
            const first = filteredItems[0];
            if (first) {
                return first.kind === 'sentence'
                    ? { kind: 'sentence', sentence: first.sentence }
                    : { kind: 'word', word: first.word };
            }
        }
        if (words.length > 0 && activeFilter !== 'sentences') {
            return { kind: 'word', word: words[0] };
        }
        if (sentences.length > 0 && (activeFilter === 'all' || activeFilter === 'sentences')) {
            return { kind: 'sentence', sentence: sentences[0] };
        }
        return null;
    }, [activeFilter, deepLinkSentenceKey, deepLinkWord, explicitSelection, filteredItems, words, sentences]);

    const handleSelectFilter = useCallback(
        (nextFilter: AssetFilter) => {
            stopSentencePlaylist();
            if (nextFilter !== 'sentences') {
                setActiveSentenceTag('all');
                setSelectedSourceId('all');
            }
            setExplicitSelection(null);
            setActiveFilter(nextFilter);
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (nextFilter === 'all') {
                        next.delete('filter');
                    } else {
                        next.set('filter', nextFilter);
                    }
                    if (nextFilter !== 'sentences') {
                        next.delete('tag');
                    }
                    next.delete('word');
                    next.delete('sentenceKey');
                    return next;
                },
                { replace: true },
            );
        },
        [setSearchParams, stopSentencePlaylist],
    );

    const handleSelectSentenceTag = useCallback(
        (nextTag: SavedSentenceTag | 'all') => {
            stopSentencePlaylist();
            setExplicitSelection(null);
            setActiveSentenceTag(nextTag);
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (nextTag === 'all') {
                        next.delete('tag');
                    } else {
                        next.set('tag', nextTag);
                    }
                    next.delete('sentenceKey');
                    return next;
                },
                { replace: true },
            );
        },
        [setSearchParams, stopSentencePlaylist],
    );

    const handleSelectAsset = useCallback(
        (entry: Exclude<StudioSelection, null>) => {
            stopSentencePlaylist();
            setExplicitSelection(entry);
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (entry.kind === 'word') {
                        next.set('word', entry.word.word);
                        next.delete('sentenceKey');
                    } else {
                        next.set('sentenceKey', entry.sentence.sentenceKey);
                        next.delete('word');
                    }
                    return next;
                },
                { replace: true },
            );
        },
        [setSearchParams, stopSentencePlaylist],
    );

    const startSentencePlaylist = useCallback(async () => {
        const sentenceQueue = filteredItems
            .filter((entry): entry is { kind: 'sentence'; sentence: SavedSentenceVO } => entry.kind === 'sentence')
            .map((entry) => entry.sentence);
        if (sentenceQueue.length === 0) return;

        const runId = playlistRunIdRef.current + 1;
        playlistRunIdRef.current = runId;
        setPlaylistPlaying(true);

        for (const item of sentenceQueue) {
            if (playlistRunIdRef.current !== runId) {
                break;
            }
            setExplicitSelection({ kind: 'sentence', sentence: item });
            await playContextAudio({
                text: item.text,
                videoPath: item.videoPath,
                startTime: item.startTime,
                endTime: item.endTime,
                waitForEnd: true,
            });
        }

        if (playlistRunIdRef.current === runId) {
            setPlaylistPlaying(false);
        }
    }, [filteredItems]);

    const removeWordFromDueQueue = useCallback((wordText: string) => {
        const normalized = wordText.toLowerCase();
        if (dueWords.has(normalized)) {
            setDueWords((prev) => {
                const next = new Set(prev);
                next.delete(normalized);
                return next;
            });
            setDueTotalCount((prev) => Math.max(0, prev - 1));
        }
        setDueCards((prev) => prev.filter((card) => card.word.toLowerCase() !== normalized));
    }, [dueWords]);

    const handleReviewWordCompleted = useCallback((wordText: string, nextStatus?: WordStatus) => {
        const normalized = wordText.toLowerCase();
        removeWordFromDueQueue(wordText);
        if (nextStatus) {
            setWords((prev) =>
                prev.map((w) => (w.word.toLowerCase() === normalized ? { ...w, status: nextStatus } : w)),
            );
        }
    }, [removeWordFromDueQueue]);

    const handleMemoryMapWord = useCallback(
        (wordText: string) => {
            const found = words.find((w) => w.word.toLowerCase() === wordText.toLowerCase());
            if (found) {
                setExplicitSelection({ kind: 'word', word: found });
            } else {
                setSearchParams({ word: wordText });
                setExplicitSelection(null);
            }
            setActiveFilter('words');
            setStudioView('workspace');
        },
        [words, setSearchParams, setStudioView],
    );

    const handleLaunchTopicReview = useCallback(
        async (topicWords: string[], topicLabel: string) => {
            if (topicWords.length === 0) return;
            try {
                const res = await videoLearningApi.getReviewQueue(REVIEW_QUEUE_LIMIT, topicWords);
                const items = Array.isArray(res.items) ? res.items : [];
                if (items.length === 0) {
                    toast(
                        t('contextStudio.topicReviewEmpty', {
                            defaultValue: '该专题暂无可复习词汇',
                        }),
                    );
                    return;
                }
                setTopicCards(items);
                setActiveReviewTopic(topicLabel);
                setReviewSessionKey((prev) => prev + 1);
                setStudioView('review');
            } catch {
                // IPC 边界（registerRoute）已自动向全局事件总线发送错误提示，此处避免重复弹窗
            }
        },
        [setStudioView, t],
    );

    const handleExportTemplate = async () => {
        try {
            const res = await videoLearningApi.exportVocabularyTemplate();
            if (res.success && res.data) {
                const binary = atob(res.data);
                const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
                const blob = new Blob([bytes], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'context-studio-words.xlsx';
                a.click();
                URL.revokeObjectURL(url);
                toast.success(t('vocabularyStudio.exportSuccess', { defaultValue: '导出成功' }));
            }
        } catch {
            toast.error(t('vocabularyStudio.exportFailed', { defaultValue: '导出失败' }));
        }
    };

    const handleImportWords = async () => {
        try {
            const selectedFiles = await videoLearningApi.selectVocabularyFile();
            const filePath = selectedFiles?.[0];
            if (!filePath) return;
            const res = await videoLearningApi.importVocabulary(filePath);
            if (res.success) {
                toast.success(res.message || t('vocabularyStudio.importSuccess', { defaultValue: '导入成功' }));
                void loadAllAssets();
            } else {
                toast.error(res.error || t('vocabularyStudio.importFailed', { defaultValue: '导入失败' }));
            }
        } catch {
            toast.error(t('vocabularyStudio.importFailed', { defaultValue: '导入失败' }));
        }
    };

    const navButtonClass = (active: boolean) =>
        cn(
            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer text-left',
            active
                ? 'bg-accent-bg/12 text-accent font-medium'
                : 'text-secondary hover:text-primary hover:bg-muted/60',
        );

    const renderAssetCard = (entry: FilteredAssetEntry) => {
        if (entry.kind === 'sentence') {
            const isSelected =
                selection?.kind === 'sentence' &&
                selection.sentence.sentenceKey === entry.sentence.sentenceKey;
            const sentenceTag = entry.sentence.tag ?? 'general';
            const isCategorized = sentenceTag !== 'general';
            const isAudioSource = Boolean(entry.sentence.videoPath && MediaUtil.isAudio(entry.sentence.videoPath));
            const noteText = entry.sentence.note?.trim() ?? '';
            return (
                <button
                    key={`sent-${entry.sentence.sentenceKey}`}
                    type="button"
                    onClick={() => handleSelectAsset({ kind: 'sentence', sentence: entry.sentence })}
                    className={cn(
                        'w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer flex flex-col gap-1',
                        isSelected
                            ? 'bg-accent-bg/10 border-accent-bg/40'
                            : 'bg-surface/40 border-transparent hover:bg-muted/60',
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-metadata font-medium text-accent shrink-0">
                            {playlistPlaying && isSelected ? (
                                <Volume2 className="w-3 h-3 animate-pulse" />
                            ) : (
                                <Bookmark className={cn('w-3 h-3', isCategorized ? 'fill-current' : 'opacity-75')} />
                            )}
                            <span>
                                {isCategorized
                                    ? t(`contextStudio.tag.${sentenceTag}`, {
                                        defaultValue: SENTENCE_TAG_DEFAULT_LABEL[sentenceTag],
                                    })
                                    : t('contextStudio.sentenceBadge', { defaultValue: '金句' })}
                            </span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-metadata text-secondary truncate">
                            {isAudioSource && <Headphones className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{entry.sentence.videoTitle}</span>
                        </span>
                    </div>
                    <p className="text-sm font-medium text-primary line-clamp-2 leading-snug">
                        {entry.sentence.text}
                    </p>
                    {entry.sentence.textZh && (
                        <p className="text-metadata text-secondary line-clamp-1">
                            {entry.sentence.textZh}
                        </p>
                    )}
                    {noteText && (
                        <p className="text-metadata text-accent/85 line-clamp-1 flex items-center gap-1 pt-0.5">
                            <NotebookPen className="w-3 h-3 shrink-0" />
                            <span className="truncate">{noteText}</span>
                        </p>
                    )}
                </button>
            );
        }

        const isSelected =
            selection?.kind === 'word' &&
            selection.word.word.toLowerCase() === entry.word.word.toLowerCase();
        const status: WordStatus = entry.word.status ?? 'learning';
        const isDue = dueWords.has(entry.word.word.toLowerCase());

        return (
            <button
                key={`word-${entry.word.id}-${entry.word.word}`}
                type="button"
                onClick={() => handleSelectAsset({ kind: 'word', word: entry.word })}
                className={cn(
                    'w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer flex flex-col gap-1',
                    isSelected
                        ? 'bg-accent-bg/10 border-accent-bg/40'
                        : 'bg-surface/40 border-transparent hover:bg-muted/60',
                )}
            >
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-primary truncate">
                        {entry.word.word}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {isDue && (
                            <span
                                className="w-1.5 h-1.5 rounded-full bg-warning-text"
                                title={t('contextStudio.dueBadge', { defaultValue: '今日待复习' })}
                            />
                        )}
                        <Badge
                            variant={STATUS_BADGE_VARIANT[status]}
                            label={t(`contextStudio.status.${status}`, {
                                defaultValue:
                                    status === 'learning'
                                        ? '待学'
                                        : status === 'familiar'
                                            ? '有印象'
                                            : status === 'known'
                                                ? '已掌握'
                                                : '忽略',
                            })}
                        />
                    </div>
                </div>
                <p className="text-metadata text-secondary line-clamp-1">
                    {entry.word.translate?.trim() || t('contextStudio.noTranslation', { defaultValue: '暂无释义' })}
                </p>
            </button>
        );
    };

    const filteredSentenceCount = useMemo(
        () => filteredItems.filter((item) => item.kind === 'sentence').length,
        [filteredItems],
    );

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-body">
            {/* 顶部页面标题栏 */}
            <div className="px-6 pt-5 pb-2 shrink-0">
                <PageHeader
                    title={t('contextStudio.title', { defaultValue: '语境工坊' })}
                    description={t('contextStudio.description', {
                        defaultValue: '音视频真实语境中的生词、金句与主动回忆训练',
                    })}
                    rightSlot={
                        <div className="shrink-0">
                            <SegmentedControl
                                size="sm"
                                value={studioView}
                                onChange={(val) => {
                                    stopSentencePlaylist();
                                    if (val === 'review') {
                                        setTopicCards(null);
                                        setActiveReviewTopic(null);
                                        setReviewSessionKey((prev) => prev + 1);
                                        setStudioView('review');
                                    } else if (val === 'memory') {
                                        setStudioView('memory');
                                    } else {
                                        setStudioView('workspace');
                                    }
                                }}
                                label={t('contextStudio.viewModeLabel', { defaultValue: '工坊视图切换' })}
                            >
                                <SegmentedControlItem
                                    value="workspace"
                                    label={t('contextStudio.viewWorkspace', { defaultValue: '语境资产' })}
                                />
                                <SegmentedControlItem
                                    value="review"
                                    label={
                                        counts.due > 0
                                            ? t('contextStudio.viewReviewWithCount', {
                                                  count: counts.due,
                                                  defaultValue: `今日训练 (${counts.due})`,
                                              })
                                            : t('contextStudio.viewReview', { defaultValue: '今日训练' })
                                    }
                                />
                                <SegmentedControlItem
                                    value="memory"
                                    label={t('contextStudio.viewMemory', { defaultValue: '记忆全景' })}
                                />
                            </SegmentedControl>
                        </div>
                    }
                />
            </div>

            {/* 主体工作区：三栏工作台 ↔ 今日主动回忆训练 ↔ 记忆全景 */}
            <div className="flex-1 min-h-0 px-6 pb-5 pt-2 overflow-hidden">
                {studioView === 'review' ? (
                    loading && !topicCards ? (
                        <ContextStudioListSkeleton ariaLabel={t('contextStudio.loading', { defaultValue: '正在加载语境资产...' })} />
                    ) : (
                        <ReviewSessionCanvas
                            key={reviewSessionKey}
                            cards={topicCards ?? dueCards}
                            allWords={words}
                            sentences={sentences}
                            topicLabel={activeReviewTopic}
                            onSwitchToDueQueue={
                                activeReviewTopic
                                    ? () => {
                                          setTopicCards(null);
                                          setActiveReviewTopic(null);
                                          setReviewSessionKey((prev) => prev + 1);
                                      }
                                    : undefined
                            }
                            onRated={(wordText, res) => handleReviewWordCompleted(wordText, res.status)}
                            onOpenWord={(wordText) => {
                                const found = words.find((w) => w.word.toLowerCase() === wordText.toLowerCase());
                                if (found) {
                                    setExplicitSelection({ kind: 'word', word: found });
                                } else {
                                    setSearchParams({ word: wordText });
                                    setExplicitSelection(null);
                                }
                                setActiveFilter('words');
                                setStudioView('workspace');
                            }}
                            onExit={() => {
                                setTopicCards(null);
                                setActiveReviewTopic(null);
                                setStudioView('workspace');
                            }}
                        />
                    )
                ) : studioView === 'memory' ? (
                    <Card padding={0} height="100%" className="h-full min-h-0 flex flex-col overflow-hidden">
                        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full p-5">
                            <MemoryMapSection
                                defaultExpanded
                                hideCollapseToggle
                                showMetrics
                                onSelectWord={handleMemoryMapWord}
                                onLaunchTopicReview={handleLaunchTopicReview}
                            />
                        </div>
                    </Card>
                ) : (
                <Card padding={0} height="100%" className="h-full min-h-0 flex overflow-hidden">
                    {/* 左栏：唯一资产范围与标签筛选导航 */}
                    <aside className="w-52 shrink-0 border-r border-border/40 bg-surface/40 p-3 flex flex-col justify-between gap-4 overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full">
                        <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <span className="px-2.5 pb-1 text-metadata font-medium text-secondary">
                                {t('contextStudio.navCategory', { defaultValue: '资产分类' })}
                            </span>
                            <button
                                type="button"
                                className={navButtonClass(activeFilter === 'all')}
                                onClick={() => handleSelectFilter('all')}
                            >
                                <span className="flex items-center gap-2 truncate">
                                    <Layers className="w-3.5 h-3.5 shrink-0" />
                                    <span>{t('contextStudio.filterAll', { defaultValue: '全部资产' })}</span>
                                </span>
                                <span className="text-metadata tabular-nums opacity-80">{counts.all}</span>
                            </button>
                            <button
                                type="button"
                                className={navButtonClass(activeFilter === 'words')}
                                onClick={() => handleSelectFilter('words')}
                            >
                                <span className="flex items-center gap-2 truncate">
                                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                                    <span>{t('contextStudio.filterWords', { defaultValue: '生词库' })}</span>
                                </span>
                                <span className="text-metadata tabular-nums opacity-80">{counts.words}</span>
                            </button>
                            <button
                                type="button"
                                className={navButtonClass(activeFilter === 'sentences')}
                                onClick={() => handleSelectFilter('sentences')}
                            >
                                <span className="flex items-center gap-2 truncate">
                                    <Bookmark className="w-3.5 h-3.5 shrink-0" />
                                    <span>{t('contextStudio.filterSentences', { defaultValue: '收藏金句' })}</span>
                                </span>
                                <span className="text-metadata tabular-nums opacity-80">{counts.sentences}</span>
                            </button>
                        </div>

                        {activeFilter === 'sentences' ? (
                            <div className="flex flex-col gap-2">
                                <div className="flex flex-col gap-1">
                                    <span className="px-2.5 pb-1 text-metadata font-medium text-secondary">
                                        {t('contextStudio.navSentenceTags', { defaultValue: '金句标签' })}
                                    </span>
                                    <button
                                        type="button"
                                        className={navButtonClass(activeSentenceTag === 'all')}
                                        onClick={() => handleSelectSentenceTag('all')}
                                    >
                                        <span className="truncate">
                                            {t('contextStudio.tagAll', { defaultValue: '全部金句' })}
                                        </span>
                                        <span className="text-metadata tabular-nums opacity-80">{counts.sentences}</span>
                                    </button>
                                    {OPTIONAL_DISPLAY_TAGS.map((tagKey) => (
                                        <button
                                            key={tagKey}
                                            type="button"
                                            className={navButtonClass(activeSentenceTag === tagKey)}
                                            onClick={() => handleSelectSentenceTag(tagKey)}
                                        >
                                            <span className="truncate">
                                                {t(`contextStudio.tag.${tagKey}`, {
                                                    defaultValue: SENTENCE_TAG_DEFAULT_LABEL[tagKey],
                                                })}
                                            </span>
                                            <span className="text-metadata tabular-nums opacity-80">
                                                {sentenceTagCounts[tagKey]}
                                            </span>
                                        </button>
                                    ))}
                                    {sentenceTagCounts.general > 0 && (
                                        <button
                                            type="button"
                                            className={navButtonClass(activeSentenceTag === 'general')}
                                            onClick={() => handleSelectSentenceTag('general')}
                                        >
                                            <span className="truncate">
                                                {t('contextStudio.tagUncategorized', { defaultValue: '未分类' })}
                                            </span>
                                            <span className="text-metadata tabular-nums opacity-80">
                                                {sentenceTagCounts.general}
                                            </span>
                                        </button>
                                    )}
                                </div>

                                {filteredSentenceCount > 0 && (
                                    <div className="pt-2 border-t border-border/40 px-1">
                                        <Button
                                            size="sm"
                                            variant={playlistPlaying ? 'destructive' : 'secondary'}
                                            icon={playlistPlaying ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                            className="w-full justify-center"
                                            label={
                                                playlistPlaying
                                                    ? t('contextStudio.stopPlaylist', { defaultValue: '停止连播' })
                                                    : t('contextStudio.playPlaylist', { defaultValue: '顺序连播' })
                                            }
                                            onClick={() => {
                                                if (playlistPlaying) {
                                                    stopSentencePlaylist();
                                                } else {
                                                    void startSentencePlaylist();
                                                }
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1">
                                <span className="px-2.5 pb-1 text-metadata font-medium text-secondary">
                                    {t('contextStudio.navMemory', { defaultValue: '记忆与复习' })}
                                </span>
                                <button
                                    type="button"
                                    className={navButtonClass(activeFilter === 'due')}
                                    onClick={() => handleSelectFilter('due')}
                                >
                                    <span className="flex items-center gap-2 truncate">
                                        <Clock className="w-3.5 h-3.5 shrink-0 text-warning-text" />
                                        <span>{t('contextStudio.filterDue', { defaultValue: '今日待复习' })}</span>
                                    </span>
                                    <span className="text-metadata tabular-nums font-medium text-warning-text">
                                        {dueTotalCount > counts.dueWordsCount ? `${counts.dueWordsCount}+` : counts.dueWordsCount}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className={navButtonClass(activeFilter === 'learning')}
                                    onClick={() => handleSelectFilter('learning')}
                                >
                                    <span className="truncate">{t('contextStudio.status.learning', { defaultValue: '待学' })}</span>
                                    <span className="text-metadata tabular-nums opacity-80">{counts.learning}</span>
                                </button>
                                <button
                                    type="button"
                                    className={navButtonClass(activeFilter === 'familiar')}
                                    onClick={() => handleSelectFilter('familiar')}
                                >
                                    <span className="truncate">{t('contextStudio.status.familiar', { defaultValue: '有印象' })}</span>
                                    <span className="text-metadata tabular-nums opacity-80">{counts.familiar}</span>
                                </button>
                                <button
                                    type="button"
                                    className={navButtonClass(activeFilter === 'known')}
                                    onClick={() => handleSelectFilter('known')}
                                >
                                    <span className="truncate">{t('contextStudio.status.known', { defaultValue: '已掌握' })}</span>
                                    <span className="text-metadata tabular-nums opacity-80">{counts.known}</span>
                                </button>
                            </div>
                        )}
                        </div>

                        {activeFilter !== 'sentences' && (
                            <div className="pt-2 border-t border-border/40 flex flex-col gap-1.5">
                                <span className="px-2 text-metadata font-medium text-secondary">
                                    {t('contextStudio.wordToolsHeading', { defaultValue: '词表工具 (.xlsx)' })}
                                </span>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        icon={<Upload className="w-3.5 h-3.5" />}
                                        label={t('contextStudio.importWords', { defaultValue: '导入' })}
                                        className="justify-center"
                                        onClick={() => void handleImportWords()}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        icon={<Download className="w-3.5 h-3.5" />}
                                        label={t('contextStudio.exportTemplate', { defaultValue: '导出' })}
                                        className="justify-center"
                                        onClick={() => void handleExportTemplate()}
                                    />
                                </div>
                            </div>
                        )}
                    </aside>

                    {/* 中栏：搜索 + 按篇来源筛选 + 资产卡片流 */}
                    <section className="w-80 shrink-0 border-r border-border/40 flex flex-col min-h-0 bg-body/40">
                        <div className="p-3 border-b border-border/40 flex flex-col gap-2 shrink-0">
                            <div className="relative flex items-center">
                                <Search className="w-3.5 h-3.5 text-secondary absolute left-2.5 pointer-events-none" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder={t('contextStudio.searchPlaceholder', {
                                        defaultValue: '搜索词汇、金句或来源...',
                                    })}
                                    className="w-full rounded-lg border border-border/50 bg-surface pl-8 pr-3 py-1.5 text-sm text-primary placeholder:text-secondary/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
                                />
                            </div>
                            {activeFilter === 'sentences' && sentenceSources.length > 1 && (
                                <select
                                    aria-label={t('contextStudio.filterSourceLabel', { defaultValue: '按内容来源筛选' })}
                                    value={effectiveSourceId}
                                    onChange={(e) => {
                                        stopSentencePlaylist();
                                        setExplicitSelection(null);
                                        setSelectedSourceId(e.target.value);
                                    }}
                                    className="w-full rounded-lg border border-border/50 bg-surface px-2.5 py-1 text-metadata text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                                >
                                    <option value="all">
                                        {t('contextStudio.allSourcesOption', {
                                            count: sentenceSources.length,
                                            defaultValue: `全部来源 (${sentenceSources.length})`,
                                        })}
                                    </option>
                                    {sentenceSources.map((src) => (
                                        <option key={src.videoId} value={src.videoId}>
                                            {src.title}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {activeFilter === 'due' && dueTotalCount > counts.dueWordsCount && (
                                <div className="rounded-md bg-warning/10 px-2.5 py-1.5 text-metadata text-secondary">
                                    {t('contextStudio.dueCapNotice', {
                                        shown: counts.dueWordsCount,
                                        total: dueTotalCount,
                                        defaultValue: `当前列表展示前 ${counts.dueWordsCount} 词，共 ${dueTotalCount} 词可前往「今日训练」`,
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col">
                            {loading ? (
                                <ContextStudioListSkeleton ariaLabel={t('contextStudio.loading', { defaultValue: '正在加载语境资产...' })} />
                            ) : filteredItems.length === 0 ? (
                                <div className="p-6 text-center text-sm text-secondary">
                                    {t('contextStudio.emptyList', { defaultValue: '暂无符合条件的语境资产' })}
                                </div>
                            ) : filteredItems.length > VIRTUALIZE_ASSET_THRESHOLD ? (
                                <Virtuoso
                                    className="flex-1 min-h-0 scrollbar-thin scrollbar-thumb-rounded-full"
                                    data={filteredItems}
                                    itemContent={(_, entry) => (
                                        <div className="px-2 pb-1.5 first:pt-2">{renderAssetCard(entry)}</div>
                                    )}
                                />
                            ) : (
                                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full p-2 flex flex-col gap-1.5">
                                    {filteredItems.map(renderAssetCard)}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 右栏：沉浸式语境画布 */}
                    <section aria-label={t('contextStudio.canvasLabel', { defaultValue: '语境学习画布' })} className="flex-1 min-w-0 h-full bg-body/60 flex flex-col">
                        {selection?.kind === 'word' ? (
                            <WordDetailCanvas
                                key={selection.word.word}
                                word={selection.word}
                                isDueForReview={dueWords.has(selection.word.word.toLowerCase())}
                                onEdit={setEditingWord}
                                onDeleted={(deletedText) => {
                                    setWords((prev) => prev.filter((w) => w.word !== deletedText));
                                    removeWordFromDueQueue(deletedText);
                                    setExplicitSelection(null);
                                }}
                                onStatusUpdated={(wordText, nextStatus) => {
                                    setWords((prev) =>
                                        prev.map((w) => (w.word === wordText ? { ...w, status: nextStatus } : w)),
                                    );
                                    if (nextStatus === 'known' || nextStatus === 'ignored') {
                                        removeWordFromDueQueue(wordText);
                                    }
                                }}
                                onReviewRated={(wordText, nextStatus) => handleReviewWordCompleted(wordText, nextStatus)}
                                onPlayStarted={stopSentencePlaylist}
                            />
                        ) : selection?.kind === 'sentence' ? (
                            <SentenceDetailCanvas
                                key={selection.sentence.sentenceKey}
                                sentence={selection.sentence}
                                onUpdated={(updated) => {
                                    setSentences((prev) =>
                                        prev.map((s) => (s.sentenceKey === updated.sentenceKey ? updated : s)),
                                    );
                                    setExplicitSelection({ kind: 'sentence', sentence: updated });
                                }}
                                onRemoved={(removedKey) => {
                                    setSentences((prev) => prev.filter((s) => s.sentenceKey !== removedKey));
                                    setExplicitSelection(null);
                                }}
                                onPlayStarted={stopSentencePlaylist}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-3">
                                <BookOpenText className="w-8 h-8 text-secondary/60" />
                                <Text type="body" weight="medium">
                                    {t('contextStudio.emptyCanvasTitle', { defaultValue: '欢迎来到语境工坊' })}
                                </Text>
                                <Text type="supporting" color="secondary" className="max-w-md">
                                    {t('contextStudio.emptyCanvasDesc', {
                                        defaultValue: '在播放实验室或精读文稿中查词、收藏生词或点击句尾书签收藏金句，所有学习资产都会按真实视频语境沉淀在这里。',
                                    })}
                                </Text>
                            </div>
                        )}
                    </section>
                </Card>
                )}
            </div>

            <WordEditDialog
                open={!!editingWord}
                wordItem={editingWord}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingWord(null);
                    }
                }}
                onSaved={(newWord) => {
                    void loadAllAssets().then(() => {
                        setSearchParams({ word: newWord });
                        setExplicitSelection(null);
                    });
                }}
            />
        </div>
    );
}
