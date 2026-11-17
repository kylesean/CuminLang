import type { SpeechRecognitionToken } from '@/backend/services/gateways/media/SpeechRecognitionGateway';
import type { SrtLine } from '@/common/utils/subtitle';
import {
    solveTimedWordBoundaries,
    type SegmentationProfile,
    type TimedWord,
} from '@/common/utils/subtitle/timed-word-segmenter';

/** 纯标点 token（附着到前一个词，不单独成词）。 */
const PUNCTUATION_TOKEN = /^[,.;:!?]+$/;

/** 行时间跨度硬上限（秒）。 */
const MAX_LINE_SECONDS = 6.5;
/** 行最短展示时长（秒）：更短的行向下延伸，但不越过下一行。 */
const MIN_DISPLAY_SECONDS = 0.9;
/** 无真实结束时间时单个子词的估算时长上限（秒），防止词尾吞掉后续静音。 */
const ESTIMATED_TOKEN_MAX_SECONDS = 0.8;
/** 时间轴末尾子词的估算展示时长（秒）。 */
const LAST_TOKEN_TAIL_SECONDS = 0.32;

/** 声学转写（Parakeet / 对账融合）专用的分段档案。 */
const ASR_SEGMENTATION_PROFILE: SegmentationProfile = {
    maxBlockChars: 80,
    maxBlockWords: 16,
    maxBlockSeconds: MAX_LINE_SECONDS,
    shortLineChars: 24,
    shortLineCostPerChar: 6,
    longLineChars: 40,
    longLineCostK: 0.05,
    comfortCps: 18,
    fastCpsCostK: 0.5,
    fastCpsCostCap: 300,
    longDurationStartSeconds: 5.5,
    longDurationCostPerSecond: 20,
    internalPauseSeconds: 0.6,
    internalPauseCost: 250,
    strongPauseSeconds: 0.6,
    mediumPauseSeconds: 0.3,
    breakPauseStrongCost: 0,
    breakPauseMediumCost: 45,
    breakClauseCost: 30,
    breakCueCost: 140,
    breakHardCost: 140,
    danglingFunctionWordCost: 0,
    mandatorySentenceBreak: false,
    internalSentenceSpillCost: 200,
    allowSparseShortClauseOverTimeLimit: false,
    useSpanInsteadOfUnion: true,
};

/**
 * 英文字幕分段器：把模型子词时间轴（或音文对账对齐后的词序列）转换为播放器使用的字幕行。
 *
 * 与前端意群分段共用 {@link solveTimedWordBoundaries} 同一套动态规划内核。
 */
export default class EnglishSubtitleSegmenter {
    /**
     * 将多个分段的 SentencePiece 子词时间轴合并为英文字幕行。
     */
    public segment(chunkTimelines: SpeechRecognitionToken[][], cutPoints: number[]): SrtLine[] {
        const timeline = this.mergeTimelines(chunkTimelines, cutPoints);
        return this.segmentTimeline(timeline);
    }

    /**
     * 将多段时间轴按切分点分区合并：在切分点重叠窗内按词级锚点平滑切换，
     * 避免硬按子词时间戳裁切导致半词截断或跨片边界漂移丢词/重词。
     */
    public mergeTimelines(chunkTimelines: SpeechRecognitionToken[][], cutPoints: number[]): SpeechRecognitionToken[] {
        if (chunkTimelines.length === 0) {
            return [];
        }
        const normalizeAnchorWord = (text: string): string =>
            text.toLowerCase().replace(/[^a-z0-9']+/g, '');

        const mergedWords = this.groupTokensIntoWords(chunkTimelines[0]).map((group) => ({
            ...group,
            norm: normalizeAnchorWord(group.text),
        }));

        for (let index = 1; index < chunkTimelines.length; index++) {
            const cut = cutPoints[index] ?? 0;
            const nextWords = this.groupTokensIntoWords(chunkTimelines[index]).map((group) => ({
                ...group,
                norm: normalizeAnchorWord(group.text),
            }));

            const anchor = this.findWordHandoffAnchor(mergedWords, nextWords, cut);
            if (anchor) {
                mergedWords.length = anchor.prevIdx;
                mergedWords.push(...nextWords.slice(anchor.nextIdx));
                continue;
            }

            while (mergedWords.length > 0 && mergedWords[mergedWords.length - 1].start >= cut) {
                mergedWords.pop();
            }
            const floorStart = mergedWords.length > 0 ? mergedWords[mergedWords.length - 1].start : Number.NEGATIVE_INFINITY;
            for (const word of nextWords) {
                if (word.start >= cut && word.start >= floorStart) {
                    mergedWords.push(word);
                }
            }
        }

        const merged: SpeechRecognitionToken[] = [];
        const seen = new Set<string>();
        for (let groupIdx = 0; groupIdx < mergedWords.length; groupIdx++) {
            const group = mergedWords[groupIdx];
            for (let tokIdx = 0; tokIdx < group.tokens.length; tokIdx++) {
                const rawToken = group.tokens[tokIdx];
                const text = rawToken.text.trim();
                const key = `${text}@${rawToken.start.toFixed(3)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                // 保证跨片首词即便原 token 无前导空格，在二次 createWords 时也不会与前一片尾词粘连。
                const token = (
                    groupIdx > 0
                    && tokIdx === 0
                    && !group.isPunctuationToken
                    && !/^\s/.test(rawToken.text)
                )
                    ? { ...rawToken, text: ` ${rawToken.text}` }
                    : rawToken;
                merged.push(token);
            }
        }
        return merged;
    }

    /**
     * 在相邻分片重叠窗（cut ± 2s）内寻找最接近切分点的词级锚点（优先 2-gram，次选 1-gram）。
     */
    private findWordHandoffAnchor(
        prevWords: ReadonlyArray<{ norm: string; start: number }>,
        nextWords: ReadonlyArray<{ norm: string; start: number }>,
        cut: number,
    ): { prevIdx: number; nextIdx: number } | null {
        const WINDOW_SECONDS = 2.0;
        const MAX_DRIFT_SECONDS = 1.0;

        let bestBigram: { prevIdx: number; nextIdx: number; dist: number } | null = null;
        let bestUnigram: { prevIdx: number; nextIdx: number; dist: number } | null = null;

        for (let p = prevWords.length - 1; p >= 0; p--) {
            const pw = prevWords[p];
            if (pw.start < cut - WINDOW_SECONDS) break;
            if (pw.start > cut + WINDOW_SECONDS || !pw.norm) continue;

            for (let n = 0; n < nextWords.length; n++) {
                const nw = nextWords[n];
                if (nw.start > cut + WINDOW_SECONDS) break;
                if (nw.start < cut - WINDOW_SECONDS || !nw.norm) continue;
                if (pw.norm !== nw.norm) continue;
                if (Math.abs(pw.start - nw.start) > MAX_DRIFT_SECONDS) continue;

                const dist = Math.abs((pw.start + nw.start) / 2 - cut);
                const prevNext = prevWords[p + 1]?.norm ?? '';
                const nextNext = nextWords[n + 1]?.norm ?? '';
                if (prevNext && prevNext === nextNext) {
                    if (!bestBigram || dist < bestBigram.dist) {
                        bestBigram = { prevIdx: p, nextIdx: n, dist };
                    }
                } else if (!bestUnigram || dist < bestUnigram.dist) {
                    bestUnigram = { prevIdx: p, nextIdx: n, dist };
                }
            }
        }

        const chosen = bestBigram ?? bestUnigram;
        return chosen ? { prevIdx: chosen.prevIdx, nextIdx: chosen.nextIdx } : null;
    }

    /**
     * 将全局子词时间轴转换为英文字幕行。
     */
    public segmentTimeline(tokens: SpeechRecognitionToken[]): SrtLine[] {
        return this.segmentWords(this.createWords(tokens));
    }

    /**
     * 将词级起止时间序列直接切分为标准化英文字幕行（供 ASR 直出与音文对账共用）。
     */
    public segmentWords(words: readonly TimedWord[]): SrtLine[] {
        if (words.length === 0) return [];
        const starts = solveTimedWordBoundaries(words, ASR_SEGMENTATION_PROFILE);
        return this.buildLines(words, starts).map((segment, index) => ({
            index: index + 1,
            start: segment.start,
            end: segment.end,
            contentEn: segment.text,
            contentZh: '',
        }));
    }

    /**
     * 将 SentencePiece 子词归并为带词级起止时间的 {@link TimedWord} 列表。
     */
    public createWords(tokens: SpeechRecognitionToken[]): TimedWord[] {
        return this.groupTokensIntoWords(tokens).map(({ tokens: _tokens, ...word }) => word);
    }

    private groupTokensIntoWords(
        tokens: SpeechRecognitionToken[],
    ): Array<TimedWord & { tokens: SpeechRecognitionToken[] }> {
        const words: Array<TimedWord & { tokens: SpeechRecognitionToken[] }> = [];
        let current: (TimedWord & { tokens: SpeechRecognitionToken[] }) | null = null;
        for (let index = 0; index < tokens.length; index++) {
            const token = tokens[index];
            const nextToken = tokens[index + 1] ?? null;
            const text = token.text.trim();
            if (!text) continue;
            // 字母后紧跟无前导空格的数字 token（如 `of` + `2026`）主动分出空格，保留 `1950s` 等后缀。
            const startsWord = /^\s/.test(token.text)
                || (current !== null && /[a-zA-Z]$/.test(current.text) && /^\d/.test(text));
            if (startsWord && current) {
                words.push(current);
                current = null;
            }
            const end = this.resolveTokenEnd(token, nextToken);
            if (PUNCTUATION_TOKEN.test(text)) {
                const target = current ?? words[words.length - 1];
                if (target) {
                    target.text += text;
                    target.end = Math.max(target.end, end);
                    target.tokens.push(token);
                    continue;
                }
            }
            if (!current) {
                current = {
                    text,
                    start: token.start,
                    end,
                    tokens: [token],
                    ...(PUNCTUATION_TOKEN.test(text) ? { isPunctuationToken: true } : {}),
                };
            } else {
                current.text += text;
                current.end = Math.max(current.end, end);
                current.tokens.push(token);
            }
        }
        if (current) words.push(current);
        return words;
    }

    private resolveTokenEnd(token: SpeechRecognitionToken, nextToken: SpeechRecognitionToken | null): number {
        if (token.end !== undefined) return token.end;
        const estimated = nextToken ? nextToken.start : token.start + LAST_TOKEN_TAIL_SECONDS;
        return Math.min(estimated, token.start + ESTIMATED_TOKEN_MAX_SECONDS);
    }

    private buildLines(words: readonly TimedWord[], starts: readonly number[]): Array<{ start: number; end: number; text: string }> {
        const total = words.length;
        const segments: Array<{ start: number; end: number; text: string }> = [];
        for (let position = 0; position < starts.length; position++) {
            const from = starts[position];
            const to = position + 1 < starts.length ? starts[position + 1] : total;
            const text = words.slice(from, to).map((word) => word.text).join(' ').replace(/\s+([,.;:!?]+)/g, '$1').trim();
            if (!text) continue;
            const start = words[from].start;
            const nextStart = to < total ? words[to].start : Number.POSITIVE_INFINITY;
            const end = Math.min(
                nextStart,
                Math.max(words[to - 1].end, start + MIN_DISPLAY_SECONDS),
                start + MAX_LINE_SECONDS,
            );
            segments.push({ start, end, text });
        }
        return segments;
    }
}
