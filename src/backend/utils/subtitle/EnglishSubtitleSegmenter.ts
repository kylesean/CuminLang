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
     * 将多段时间轴按切分点分区合并：每个分段只保留 [ownCut, nextCut) 区间内的子词，
     * 重叠区只由覆盖它的后续分段贡献。
     */
    public mergeTimelines(chunkTimelines: SpeechRecognitionToken[][], cutPoints: number[]): SpeechRecognitionToken[] {
        const raw: SpeechRecognitionToken[] = [];
        for (let index = 0; index < chunkTimelines.length; index++) {
            const ownCut = cutPoints[index] ?? 0;
            const nextCut = cutPoints[index + 1] ?? Number.POSITIVE_INFINITY;
            for (const token of chunkTimelines[index]) {
                const text = token.text.trim();
                if (!text) continue;
                if (token.start < ownCut || token.start >= nextCut) continue;
                raw.push(token);
            }
        }
        raw.sort((a, b) => a.start - b.start);
        const merged: SpeechRecognitionToken[] = [];
        const seen = new Set<string>();
        for (const token of raw) {
            const text = token.text.trim();
            const key = `${text}@${token.start.toFixed(3)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(token);
        }
        return merged;
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
        const words: TimedWord[] = [];
        let current: TimedWord | null = null;
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
                    continue;
                }
            }
            if (!current) {
                current = {
                    text,
                    start: token.start,
                    end,
                    ...(PUNCTUATION_TOKEN.test(text) ? { isPunctuationToken: true } : {}),
                };
            } else {
                current.text += text;
                current.end = Math.max(current.end, end);
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
