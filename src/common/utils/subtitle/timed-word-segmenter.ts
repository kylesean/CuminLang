/**
 * 统一字幕分句动态规划内核。
 *
 * 将带词级起止时间的序列（无论来自本地 ASR 转写、音文对账融合还是外部 SRT 摊平）
 * 切分成阅读节奏舒适、停顿与语义边界一致的意群行，彻底消除多套分段器各自演进的分叉。
 */

/** 句末标点：允许紧跟常见收尾引号/括号；省略号同样算收束。 */
export const SENTENCE_END_PATTERN = /[.!?…]["'”』」)\]]?$/;

/** 从句标点：逗号、分号、冒号，弱于句末的意群边界。 */
export const CLAUSE_END_PATTERN = /[,;:]["'”』」)\]]?$/;

/** 最小时间容差与最小展示时长分母（避免除零）。 */
const MIN_DURATION_EPS = 0.2;

/** 每条候选行基础代价，保证同分时偏向更少的行数。 */
const LINE_BASE_COST = 1;

/** 跨 cue 达到该停顿时长（秒）时，即使前词为虚词也不强行跨越静音拼接。 */
const MANDATORY_GAP_SECONDS = 0.8;

/** 稀疏超长句豁免时长硬上限时的最大词数与最大字符数。 */
const SPARSE_SHORT_CLAUSE_MAX_WORDS = 15;
const SPARSE_SHORT_CLAUSE_MAX_CHARS = 120;

/** 断点代价：句末且下词大写为天然边界；句末接小写（如 `etc. and`）略加微罚。 */
const BREAK_TERMINAL = 0;
const BREAK_TERMINAL_NO_CAP = 12;

/** 不能独立收尾的悬空虚词：冠词、介词、连词、代词、助动词、关系词。 */
const DANGLING_WORDS = new Set([
    'a', 'an', 'the',
    'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'into',
    'over', 'under', 'between', 'through', 'during', 'without', 'within', 'across',
    'against', 'toward', 'towards', 'upon', 'onto', 'per', 'via',
    'and', 'or', 'but', 'nor', 'so', 'yet', 'because', 'although', 'though',
    'while', 'whereas', 'unless', 'until', 'since', 'if', 'when', 'whenever',
    'where', 'wherever', 'whether', 'than', 'as', 'like',
    'that', 'which', 'who', 'whom', 'whose', 'what',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their', 'this', 'these', 'those',
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'do', 'does', 'did', 'have', 'has', 'had',
    'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must',
    'not', 'no', 'very', 'just', 'also', 'too', 'only', 'even', 'still',
]);

/** 统一分句器的最小输入单元：带词级起止时间的文本词。 */
export interface TimedWord {
    /** 词文本（可包含紧附着在尾部的标点）。 */
    text: string;
    /** 估算或声学开始时间（秒）。 */
    start: number;
    /** 估算或声学结束时间（秒）。 */
    end: number;
    /** 所属原始 cue 下标（外部 SRT 摊平时用于区分跨 cue 与 cue 内切分）。 */
    cueIndex?: number;
    /** 所属原始 cue 的开始时间（秒）。 */
    cueStart?: number;
    /** 所属原始 cue 的结束时间（秒）。 */
    cueEnd?: number;
    /** 是否因说话人切换强制在此词前断行。 */
    forcedBreak?: boolean;
    /** 是否为纯附着标点 token（字符加在长度上，但不加词间空格与词数）。 */
    isPunctuationToken?: boolean;
}

/** 分句参数档案：按输入源特性配置阈值与惩罚权重。 */
export interface SegmentationProfile {
    maxBlockChars: number;
    maxBlockWords: number;
    maxBlockSeconds: number;
    shortLineChars: number;
    shortLineCostPerChar: number;
    longLineChars: number;
    longLineCostK: number;
    comfortCps: number;
    fastCpsCostK: number;
    fastCpsCostCap: number;
    longDurationStartSeconds: number;
    longDurationCostPerSecond: number;
    internalPauseSeconds: number;
    internalPauseCost: number;
    strongPauseSeconds: number;
    mediumPauseSeconds: number;
    breakPauseStrongCost: number;
    breakPauseMediumCost: number;
    breakClauseCost: number;
    breakCueCost: number;
    breakHardCost: number;
    danglingFunctionWordCost: number;
    mandatorySentenceBreak: boolean;
    internalSentenceSpillCost: number;
    allowSparseShortClauseOverTimeLimit: boolean;
    /** 为 true 时使用 [minStart, maxEnd] 总跨度计时长（声学分段模式），否则使用词区间并集时长（滚屏重叠模式）。 */
    useSpanInsteadOfUnion?: boolean;
}

interface WordDelta {
    chars: number;
    wordIncrement: number;
    isPunctuationToken: boolean;
    pauseBefore: boolean;
    start: number;
    end: number;
    sentenceBoundaryBefore: boolean;
}

interface RunningMetrics {
    chars: number;
    words: number;
    internalPauseCount: number;
    headPauseBefore: boolean;
    internalSentenceCount: number;
    headSentenceBoundaryBefore: boolean;
    minStart: number;
    maxEnd: number;
    unionSec: number;
}

/**
 * 估算英文单词的音节权重，供无真实词时间戳时的插值使用。
 *
 * @param word 词文本。
 * @returns 音节权重（最小 1；纯非字母符号返回 0.5）。
 */
export const syllableWeight = (word: string): number => {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length === 0) {
        return 0.5;
    }
    const groups = cleaned.match(/[aeiouy]+/g);
    let count = groups ? groups.length : 1;
    if (cleaned.length > 2 && cleaned.endsWith('e') && count > 1) {
        count -= 1;
    }
    return Math.max(1, count);
};

/**
 * 判断一个词是否为需要后续成分收束的悬空虚词。
 *
 * @param word 行尾词。
 * @returns 悬空虚词返回 true；以句末标点收尾则返回 false。
 */
export const isDanglingWord = (word: string): boolean => {
    if (SENTENCE_END_PATTERN.test(word)) {
        return false;
    }
    const cleaned = word
        .toLowerCase()
        .replace(/^["'“”‘’([\]]+/, '')
        .replace(/["'“”‘’)\],;:]+$/, '')
        .trim();
    return DANGLING_WORDS.has(cleaned);
};

const computeCueGap = (previous: TimedWord, current: TimedWord): number => {
    if (previous.cueIndex !== undefined && current.cueIndex !== undefined) {
        if (previous.cueIndex === current.cueIndex) {
            return 0;
        }
        return (current.cueStart ?? current.start) - (previous.cueEnd ?? previous.end);
    }
    return current.start - previous.end;
};

const isCueBoundary = (previous: TimedWord, current: TimedWord): boolean =>
    previous.cueIndex === undefined
    || current.cueIndex === undefined
    || previous.cueIndex !== current.cueIndex;

const buildDeltas = (words: readonly TimedWord[], profile: SegmentationProfile): WordDelta[] =>
    words.map((word, index) => {
        const previous = index > 0 ? words[index - 1] : null;
        const cueGap = previous ? computeCueGap(previous, word) : 0;
        const pauseBefore = previous !== null
            && isCueBoundary(previous, word)
            && cueGap >= profile.internalPauseSeconds;
        const sentenceBoundaryBefore = previous !== null
            && SENTENCE_END_PATTERN.test(previous.text)
            && /^["“']?[A-Z]/.test(word.text);
        return {
            chars: word.text.length,
            wordIncrement: word.isPunctuationToken ? 0 : 1,
            isPunctuationToken: Boolean(word.isPunctuationToken),
            pauseBefore,
            start: word.start,
            end: word.end,
            sentenceBoundaryBefore,
        };
    });

const createRunningMetrics = (): RunningMetrics => ({
    chars: 0,
    words: 0,
    internalPauseCount: 0,
    headPauseBefore: false,
    internalSentenceCount: 0,
    headSentenceBoundaryBefore: false,
    minStart: Number.POSITIVE_INFINITY,
    maxEnd: Number.NEGATIVE_INFINITY,
    unionSec: 0,
});

const extendMetrics = (running: RunningMetrics, delta: WordDelta): void => {
    if (running.chars === 0 && running.words === 0) {
        running.chars = delta.chars;
        running.words = delta.wordIncrement;
        running.headPauseBefore = delta.pauseBefore;
        running.headSentenceBoundaryBefore = delta.sentenceBoundaryBefore;
        running.minStart = delta.start;
        running.maxEnd = delta.end;
        running.unionSec = Math.max(0, delta.end - delta.start);
        return;
    }
    // 从右向左扩展，原行首变成行内词：原先仅在其左侧的停顿与句界此刻纳入行内统计。
    running.chars += delta.chars + (delta.isPunctuationToken ? 0 : 1);
    if (running.headPauseBefore) {
        running.internalPauseCount += 1;
    }
    if (running.headSentenceBoundaryBefore) {
        running.internalSentenceCount += 1;
    }
    running.headPauseBefore = delta.pauseBefore;
    running.headSentenceBoundaryBefore = delta.sentenceBoundaryBefore;
    running.words += delta.wordIncrement;
    const overlap = Math.max(0, Math.min(running.maxEnd, delta.end) - Math.max(running.minStart, delta.start));
    running.unionSec += Math.max(0, delta.end - delta.start) - overlap;
    running.minStart = Math.min(running.minStart, delta.start);
    running.maxEnd = Math.max(running.maxEnd, delta.end);
};

const breakCost = (
    words: readonly TimedWord[],
    start: number,
    profile: SegmentationProfile,
): number => {
    if (start <= 0) {
        return 0;
    }
    const previous = words[start - 1];
    const current = words[start];
    if (current.forcedBreak) {
        return BREAK_TERMINAL;
    }
    if (SENTENCE_END_PATTERN.test(previous.text)) {
        if (/^["“']?[A-Z]/.test(current.text)) {
            return BREAK_TERMINAL;
        }
        if (profile.mandatorySentenceBreak) {
            return BREAK_TERMINAL_NO_CAP;
        }
    }
    const boundary = isCueBoundary(previous, current);
    const gap = computeCueGap(previous, current);
    if (boundary && gap >= MANDATORY_GAP_SECONDS) {
        return profile.breakPauseStrongCost;
    }
    if (profile.danglingFunctionWordCost > 0 && isDanglingWord(previous.text)) {
        return profile.danglingFunctionWordCost;
    }
    if (boundary && gap >= profile.strongPauseSeconds) {
        return profile.breakPauseStrongCost;
    }
    if (CLAUSE_END_PATTERN.test(previous.text)) {
        return profile.breakClauseCost;
    }
    if (boundary) {
        if (gap >= profile.mediumPauseSeconds) {
            return profile.breakPauseMediumCost;
        }
        return profile.breakCueCost;
    }
    return profile.breakHardCost;
};

const effectiveDuration = (metrics: RunningMetrics, profile: SegmentationProfile): number => (
    profile.useSpanInsteadOfUnion
        ? Math.max(0, metrics.maxEnd - metrics.minStart)
        : metrics.unionSec
);

const lineCost = (
    metrics: RunningMetrics,
    endsAtSentenceBoundary: boolean,
    profile: SegmentationProfile,
): number => {
    const lineDuration = effectiveDuration(metrics, profile);
    const duration = Math.max(lineDuration, MIN_DURATION_EPS);
    const cps = metrics.chars / duration;
    const fastCost = Math.min(
        profile.fastCpsCostCap,
        profile.fastCpsCostK * Math.max(0, cps - profile.comfortCps) ** 2,
    );
    const shortCost = profile.shortLineCostPerChar * Math.max(0, profile.shortLineChars - metrics.chars);
    const longCost = profile.longLineCostK * Math.max(0, metrics.chars - profile.longLineChars) ** 2;
    const lingeringCost = profile.longDurationCostPerSecond
        * Math.max(0, lineDuration - profile.longDurationStartSeconds);
    const sentenceSpillCost = !endsAtSentenceBoundary && metrics.internalSentenceCount > 0
        ? profile.internalSentenceSpillCost
        : 0;
    return fastCost
        + shortCost
        + longCost
        + lingeringCost
        + sentenceSpillCost
        + metrics.internalPauseCount * profile.internalPauseCost;
};

const isMandatoryBreak = (words: readonly TimedWord[], index: number): boolean => {
    if (index <= 0 || index >= words.length) {
        return false;
    }
    return Boolean(words[index].forcedBreak || SENTENCE_END_PATTERN.test(words[index - 1].text));
};

/**
 * 使用动态规划求出展示总代价最低的意群切分下标序列。
 *
 * @param words 按时间或语序排列的词序列。
 * @param profile 切分约束与权重配置。
 * @returns 每行起始词下标（严格升序）；空输入返回空数组。
 */
export const solveTimedWordBoundaries = (
    words: readonly TimedWord[],
    profile: SegmentationProfile,
): number[] => {
    const total = words.length;
    if (total === 0) {
        return [];
    }

    const bestCost = new Array<number>(total + 1).fill(Number.POSITIVE_INFINITY);
    const bestFrom = new Array<number>(total + 1).fill(-1);
    const nearestMandatory = new Array<number>(total + 1).fill(0);
    if (profile.mandatorySentenceBreak) {
        let lastMandatory = 0;
        for (let end = 1; end <= total; end++) {
            if (isMandatoryBreak(words, end - 1)) {
                lastMandatory = end - 1;
            }
            nearestMandatory[end] = lastMandatory;
        }
    }

    bestCost[0] = 0;
    const deltas = buildDeltas(words, profile);

    for (let end = 1; end <= total; end++) {
        const endsAtSentenceBoundary = SENTENCE_END_PATTERN.test(words[end - 1].text)
            && (end === total || /^["“']?[A-Z]/.test(words[end].text));
        const running = createRunningMetrics();
        const lowerBound = profile.mandatorySentenceBreak ? nearestMandatory[end] : 0;

        for (let start = end - 1; start >= lowerBound; start--) {
            extendMetrics(running, deltas[start]);
            if (running.words > profile.maxBlockWords && end - start > 1) {
                break;
            }
            const lineDuration = effectiveDuration(running, profile);
            const singleWord = end - start === 1;
            const sparseShortClause = profile.allowSparseShortClauseOverTimeLimit
                && running.words <= SPARSE_SHORT_CLAUSE_MAX_WORDS
                && running.chars <= SPARSE_SHORT_CLAUSE_MAX_CHARS
                && running.internalPauseCount === 0;
            const withinLimits = singleWord
                || sparseShortClause
                || (running.chars <= profile.maxBlockChars && lineDuration <= profile.maxBlockSeconds);

            if (withinLimits) {
                const candidate = bestCost[start]
                    + breakCost(words, start, profile)
                    + lineCost(running, endsAtSentenceBoundary, profile)
                    + LINE_BASE_COST;
                if (candidate < bestCost[end]) {
                    bestCost[end] = candidate;
                    bestFrom[end] = start;
                }
            }

            if (!singleWord && !sparseShortClause && (running.chars > profile.maxBlockChars || lineDuration > profile.maxBlockSeconds)) {
                break;
            }
        }
    }

    const starts: number[] = [];
    for (let boundary = total; boundary > 0; boundary = bestFrom[boundary]) {
        if (bestFrom[boundary] < 0) {
            for (let index = 0; index < total; index++) {
                starts.push(index);
            }
            return starts;
        }
        starts.push(bestFrom[boundary]);
    }
    starts.reverse();
    return starts;
};
