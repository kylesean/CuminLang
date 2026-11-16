import type { SrtLine } from './types';
import { dedupeRollingLines } from './rolling-dedup';
import { stripStageSoundCues } from './stage-cues';
import {
    solveTimedWordBoundaries,
    syllableWeight,
    type SegmentationProfile,
    type TimedWord,
} from './timed-word-segmenter';

/**
 * 意群重切分：把滚动式碎片字幕（YouTube 自动字幕的典型形态——cue 时间轴重叠、
 * 句子被拦腰切断、常无句末标点）重切成“完整意群”级别的字幕行。
 *
 * 复用统一动态规划内核 {@link solveTimedWordBoundaries}：
 * 1. 先剥离行内/多段舞台音效标注并收拢由此触发的悬空 `>>`；
 * 2. 用 {@link dedupeRollingLines} 去掉滚动重复尾巴；
 * 3. 把字幕摊平成“词 + 按音节估算时间”的 {@link TimedWord} 序列；
 * 4. 委托统一内核求全局最优切分并贴合 cue 边界生成最终字幕行。
 */

/** 说话人切换标记：YouTube 自动字幕用 `>>` 表示换人，视为强制句边界。 */
const SPEAKER_MARK_PATTERN = />>/g;

/** 仅由 `>>` 与空白组成的片段（剥离舞台标记后没有任何人声单词）。 */
const CHEVRON_ONLY_PATTERN = /^[\s>]*$/;

/** 时间比较的浮点容差。 */
const EPS = 0.001;

/** 切分后子区间的最小时长（秒），保证 createSrtLine 的严格递增校验。 */
const MIN_SEGMENT_SECONDS = 0.2;

/** 外部 SRT 意群重切分档案：偏好完整句子与长意群，对悬空虚词与跨停顿施压。 */
const SRT_SEGMENTATION_PROFILE: SegmentationProfile = {
    maxBlockChars: 220,
    maxBlockWords: 40,
    maxBlockSeconds: 12,
    shortLineChars: 24,
    shortLineCostPerChar: 6,
    longLineChars: 110,
    longLineCostK: 0.02,
    comfortCps: 18,
    fastCpsCostK: 0.5,
    fastCpsCostCap: 300,
    longDurationStartSeconds: 12,
    longDurationCostPerSecond: 12,
    internalPauseSeconds: 0.35,
    internalPauseCost: 220,
    strongPauseSeconds: 0.6,
    mediumPauseSeconds: 0.3,
    breakPauseStrongCost: 20,
    breakPauseMediumCost: 60,
    breakClauseCost: 40,
    breakCueCost: 110,
    breakHardCost: 170,
    danglingFunctionWordCost: 260,
    mandatorySentenceBreak: true,
    internalSentenceSpillCost: 0,
    allowSparseShortClauseOverTimeLimit: true,
};

/** 外部 SRT 摊平后的词项，额外携带 cue 边界标记供行时间包络重构。 */
interface SrtTimedWord extends TimedWord {
    cueIndex: number;
    cueStart: number;
    cueEnd: number;
    isCueFirst: boolean;
    cueTruncated: boolean;
}

/**
 * 预处理原始字幕行：剥离行内/整行非人声舞台标记，并收拢只因舞台标记触发的 `>>`。
 */
const prepareSpokenLines = (lines: readonly SrtLine[]): SrtLine[] => {
    const result: SrtLine[] = [];
    let sawStageCueBeforeSpeech = false;

    for (const rawLine of lines) {
        const { text: withoutStage, hadStageCue } = stripStageSoundCues(rawLine.contentEn);
        if (CHEVRON_ONLY_PATTERN.test(withoutStage)) {
            const previous = result[result.length - 1];
            if (
                previous
                && rawLine.start > previous.start
                && rawLine.start < previous.end
                && rawLine.end >= previous.end - EPS
            ) {
                result[result.length - 1] = { ...previous, end: rawLine.start };
            }
            sawStageCueBeforeSpeech = true;
            continue;
        }

        const endedWithStageCue = hadStageCue && /(?:[\])]|[♪♫])\s*$/.test(rawLine.contentEn);
        let cleaned = hadStageCue
            ? withoutStage.replace(/(?:>>\s*)+/g, '>> ').replace(/\s*>>\s*$/, '').trim()
            : withoutStage.trim();

        if (sawStageCueBeforeSpeech) {
            cleaned = cleaned.replace(/^\s*>>+\s*/, '').trim();
        }
        sawStageCueBeforeSpeech = endedWithStageCue;

        if (!cleaned) {
            continue;
        }
        result.push({ ...rawLine, contentEn: cleaned });
    }

    return result;
};

/**
 * 把一条 cue 的文本按 `>>` 切成若干段，并标记哪些段需要强制断句。
 */
const splitBySpeakerMark = (text: string): Array<{ text: string; forcedBreak: boolean }> => {
    const parts = text.split(SPEAKER_MARK_PATTERN);
    const result: Array<{ text: string; forcedBreak: boolean }> = [];
    for (let index = 0; index < parts.length; index++) {
        const trimmed = parts[index].trim();
        if (!trimmed) {
            continue;
        }
        result.push({ text: trimmed, forcedBreak: index > 0 });
    }
    return result;
};

/**
 * 把字幕行摊平成词序列，并在每条 cue 内部按音节权重插值时间。
 */
const flattenWords = (lines: readonly SrtLine[]): SrtTimedWord[] => {
    const words: SrtTimedWord[] = [];
    let cueIndex = -1;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const segments = splitBySpeakerMark(line.contentEn);
        const cueText = segments.map((segment) => segment.text).join(' ');
        if (!cueText) {
            continue;
        }
        cueIndex += 1;
        const nextCue = lines[lineIndex + 1];
        // 同时兼容后一条延伸到更晚与两条双行滚屏同刻退场（nextCue.end === line.end）的情况。
        const isRollingOverlap = nextCue !== undefined
            && nextCue.start > line.start
            && nextCue.start < line.end
            && nextCue.end >= line.end - EPS;
        const speechEnd = isRollingOverlap ? nextCue.start : line.end;
        const duration = Math.max(speechEnd - line.start, EPS);
        const pending: Array<{ text: string; forcedBreak: boolean }> = [];
        for (const segment of segments) {
            const tokens = segment.text.split(/\s+/).filter(Boolean);
            for (let index = 0; index < tokens.length; index++) {
                pending.push({ text: tokens[index], forcedBreak: segment.forcedBreak && index === 0 });
            }
        }
        if (pending.length === 0) {
            cueIndex -= 1;
            continue;
        }
        const weights = pending.map((item) => syllableWeight(item.text));
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        let cumulative = 0;
        for (let index = 0; index < pending.length; index++) {
            const before = cumulative;
            cumulative += weights[index];
            words.push({
                text: pending[index].text,
                start: line.start + duration * (before / totalWeight),
                end: line.start + duration * (cumulative / totalWeight),
                cueIndex,
                cueStart: line.start,
                cueEnd: line.end,
                isCueFirst: index === 0,
                cueTruncated: isRollingOverlap,
                forcedBreak: pending[index].forcedBreak,
            });
        }
    }
    return words;
};

/**
 * 把词序列按行首下标拼回字幕行，并保证时间轴严格递增。
 */
const buildLines = (words: readonly SrtTimedWord[], starts: readonly number[]): SrtLine[] => {
    const lines: SrtLine[] = [];
    let previousEnd = 0;
    for (let position = 0; position < starts.length; position++) {
        const from = starts[position];
        const to = position + 1 < starts.length ? starts[position + 1] : words.length;
        const slice = words.slice(from, to);
        if (slice.length === 0) {
            continue;
        }
        const text = slice.map((word) => word.text).join(' ')
            .replace(/\s+([,.;:!?…]+)/g, '$1')
            .trim();
        if (!text) {
            continue;
        }
        const first = slice[0];
        const last = slice[slice.length - 1];
        const rawStart = first.isCueFirst ? first.cueStart : first.start;
        const nextWord = words[to];
        const isCueLastWord = last.cueIndex !== nextWord?.cueIndex;
        const coveredCueEnd = slice.reduce(
            (max, word) => Math.max(
                max,
                word.cueTruncated || !isCueLastWord ? word.end : word.cueEnd,
            ),
            last.end,
        );
        const rawEnd = coveredCueEnd;
        const start = Math.max(rawStart, previousEnd);
        let end = Math.max(rawEnd, start + MIN_SEGMENT_SECONDS);
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            continue;
        }
        if (end <= start) {
            end = start + MIN_SEGMENT_SECONDS;
        }
        lines.push({
            index: lines.length + 1,
            start,
            end,
            contentEn: text,
            contentZh: '',
        });
        previousEnd = end;
    }
    return lines;
};

/**
 * 把碎片字幕行重切分成完整意群行。
 *
 * 双语字幕（任一行含中文）原样返回，避免人工对齐的双语文件切分错位。
 *
 * @param lines 解析产出的字幕行数组（应按时间升序）。
 * @returns 重切分后的字幕行（index 从 1 重新编号）；无需处理时原样返回。
 */
export const resegmentIntoMeaningGroups = (lines: SrtLine[]): SrtLine[] => {
    if (lines.length === 0) {
        return lines;
    }
    if (lines.some((line) => line.contentZh.trim().length > 0)) {
        return lines;
    }
    const spoken = prepareSpokenLines(lines);
    const deduped = dedupeRollingLines(spoken);
    const words = flattenWords(deduped);
    if (words.length === 0) {
        return lines;
    }
    const starts = solveTimedWordBoundaries(words, SRT_SEGMENTATION_PROFILE);
    const result = buildLines(words, starts);
    return result.length > 0 ? result : lines;
};
