import {
    filterTranscriptSentences,
    sentenceVocabularyKey,
    type SentenceVocabularyCount,
    type TranscriptVocabularyFilter,
} from '@/frontend/features/player/transcriptVocabulary';
import {
    groupSentencesIntoBlocks,
    needsBilingualCueSpace,
    type SentenceBlock,
} from '@/frontend/features/player/lib/sentence-grouping';
import { cleanWord, isWordToken, splitWords } from '@/common/utils/subtitle';
import type { WordStatus } from '@/common/types/vocabulary';
import type { Sentence } from '@/common/types/SentenceC';

export type ScriptReaderFilter = TranscriptVocabularyFilter | 'saved';

export interface ScriptVocabPreviewItem {
    word: string;
    count: number;
    firstSentenceIndex: number;
}

const PROGRESS_STORAGE_KEY = 'cuminlang:script-reader-progress';
const MAX_STORED_PROGRESS = 120;

const readProgressMap = (): Record<string, number> => {
    try {
        if (typeof localStorage === 'undefined') {
            return {};
        }
        const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') return {};
        const clean: Record<string, number> = {};
        for (const [key, val] of Object.entries(parsed)) {
            if (typeof val === 'number' && Number.isInteger(val) && val >= 0) {
                clean[key] = val;
            }
        }
        return clean;
    } catch {
        return {};
    }
};

export const getSavedReaderProgress = (videoId: string): number | null => {
    if (!videoId) return null;
    const map = readProgressMap();
    return typeof map[videoId] === 'number' ? map[videoId] : null;
};

/**
 * 获取最近一次精读文稿的进度记录（依赖 saveReaderProgress 维护的插入顺序）。
 */
export const getLatestSavedReaderProgress = (): { videoId: string; sentenceIndex: number } | null => {
    const entries = Object.entries(readProgressMap());
    if (entries.length === 0) return null;
    const [videoId, sentenceIndex] = entries[entries.length - 1];
    return { videoId, sentenceIndex };
};

export const saveReaderProgress = (videoId: string, sentenceIndex: number): void => {
    if (!videoId || !Number.isInteger(sentenceIndex) || sentenceIndex < 0) {
        return;
    }
    try {
        if (typeof localStorage === 'undefined') {
            return;
        }
        const map = readProgressMap();
        // 删除重插保持最近访问顺序，避免本地存储无限增长
        delete map[videoId];
        map[videoId] = sentenceIndex;
        const keys = Object.keys(map);
        if (keys.length > MAX_STORED_PROGRESS) {
            for (const staleKey of keys.slice(0, keys.length - MAX_STORED_PROGRESS)) {
                delete map[staleKey];
            }
        }
        localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // 忽略存储限制错误，不影响阅读体验
    }
};

const extractNormalizedSentenceWords = (sentence: Sentence): string[] => {
    const parts = sentence.struct?.blocks?.flatMap((b) => b.blockParts) ?? [];
    if (parts.length > 0) {
        return parts
            .filter((p) => p.isWord && p.content.trim().length > 0)
            .map((p) => (p.lemma || cleanWord(p.content) || p.content).toLowerCase().trim())
            .filter(Boolean);
    }
    return splitWords(sentence.text ?? '')
        .filter(isWordToken)
        .map((token) => (cleanWord(token) || token).toLowerCase().trim())
        .filter(Boolean);
};

const joinBlockTranslations = (
    block: SentenceBlock,
    translations?: ReadonlyMap<string, string>,
): string => {
    const parts: string[] = [];
    for (const s of block.sentences) {
        const aiZh = s.translationKey ? translations?.get(s.translationKey) : undefined;
        const zh = (s.textZH || aiZh || '').trim();
        if (!zh) continue;
        const prev = parts[parts.length - 1];
        if (prev && needsBilingualCueSpace(prev, zh)) {
            parts.push(' ');
        }
        parts.push(zh);
    }
    return parts.join('');
};

/**
 * 综合状态筛选（全部 / 生词（个人待学 + 本地词典考纲难点候选） / 已收藏金句）与关键词搜索。
 * 先按完整意群块 `SentenceBlock` 归并，再在完整句单元上执行筛选与跨行搜索，避免切碎跨 cue 的半句话。
 */
export const filterReaderSentences = (params: {
    sentences: Sentence[];
    filter: ScriptReaderFilter;
    query: string;
    countOf: (sentence: Sentence) => SentenceVocabularyCount;
    savedKeys: ReadonlySet<string>;
    translations?: ReadonlyMap<string, string>;
    candidateWords?: ReadonlySet<string>;
}): Sentence[] => {
    const { sentences, filter, query, countOf, savedKeys, translations, candidateWords } = params;
    const blocks = groupSentencesIntoBlocks(sentences);

    let stage: SentenceBlock[];
    if (filter === 'saved') {
        stage = blocks.filter((block) =>
            block.sentences.some((s) => savedKeys.has(sentenceVocabularyKey(s))),
        );
    } else if (filter === 'learning' && candidateWords && candidateWords.size > 0) {
        stage = blocks.filter((block) =>
            block.sentences.some((s) => {
                if (countOf(s).learning > 0) {
                    return true;
                }
                return extractNormalizedSentenceWords(s).some((w) => candidateWords.has(w));
            }),
        );
    } else if (filter === 'all') {
        stage = blocks;
    } else {
        stage = blocks.filter((block) =>
            filterTranscriptSentences(block.sentences, filter, countOf, undefined).length > 0,
        );
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return stage.flatMap((block) => block.sentences);
    }
    return stage
        .filter((block) => {
            const mergedEn = block.sentences
                .map((s) => s.text.trim())
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (mergedEn.includes(normalizedQuery)) {
                return true;
            }
            const mergedZh = joinBlockTranslations(block, translations).toLowerCase();
            if (mergedZh.includes(normalizedQuery)) {
                return true;
            }
            return block.sentences.some((s) => {
                const aiZh = s.translationKey ? translations?.get(s.translationKey) : undefined;
                return (
                    s.text.toLowerCase().includes(normalizedQuery)
                    || (s.textZH && s.textZH.toLowerCase().includes(normalizedQuery))
                    || (aiZh && aiZh.toLowerCase().includes(normalizedQuery))
                );
            });
        })
        .flatMap((block) => block.sentences);
};

/**
 * 提取本篇文稿中的重点生词雷达（个人待学词优先，冷启动时融合考纲/进阶候选难词，按频次降序）。
 */
export const collectReaderVocabularySummary = (
    sentences: readonly Sentence[],
    resolveStatus: (word: string, lemma?: string) => WordStatus | undefined,
    limit = 12,
    candidateWords?: ReadonlySet<string>,
): ScriptVocabPreviewItem[] => {
    const map = new Map<string, ScriptVocabPreviewItem & { personal: boolean }>();

    for (const sentence of sentences) {
        const parts = sentence.struct?.blocks?.flatMap((b) => b.blockParts) ?? [];
        const tokens = parts.length > 0
            ? parts
                .filter((p) => p.isWord && p.content.trim().length > 0)
                .map((p) => ({ word: p.content, lemma: p.lemma }))
            : splitWords(sentence.text ?? '')
                .filter(isWordToken)
                .map((token) => ({ word: token, lemma: cleanWord(token) }));

        for (const token of tokens) {
            const status = resolveStatus(token.word, token.lemma);
            const normalized = (token.lemma || cleanWord(token.word) || token.word).toLowerCase().trim();
            if (!normalized) continue;
            const isPersonalLearning = status === 'learning';
            const isDismissed = status === 'known' || status === 'ignored' || status === 'familiar';
            const isCandidate = !isDismissed && Boolean(candidateWords?.has(normalized));
            if (!isPersonalLearning && !isCandidate) {
                continue;
            }
            const existing = map.get(normalized);
            if (existing) {
                existing.count += 1;
                if (isPersonalLearning) {
                    existing.personal = true;
                }
            } else {
                map.set(normalized, {
                    word: normalized,
                    count: 1,
                    firstSentenceIndex: sentence.index,
                    personal: isPersonalLearning,
                });
            }
        }
    }

    return [...map.values()]
        .sort((a, b) => {
            if (a.personal !== b.personal) {
                return a.personal ? -1 : 1;
            }
            return b.count - a.count || a.firstSentenceIndex - b.firstSentenceIndex;
        })
        .slice(0, limit)
        .map(({ word, count, firstSentenceIndex }) => ({ word, count, firstSentenceIndex }));
};
