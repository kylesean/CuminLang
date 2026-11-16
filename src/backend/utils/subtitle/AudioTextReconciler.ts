import type { SubtitleTrackOrigin } from '@/common/contracts/subtitle-resolution';
import { resegmentIntoMeaningGroups, type SrtLine } from '@/common/utils/subtitle';
import type { TimedWord } from '@/common/utils/subtitle/timed-word-segmenter';
import { syllableWeight } from '@/common/utils/subtitle/timed-word-segmenter';

/** 对账融合结论模式。 */
export type ReconciliationMode = 'author_aligned' | 'asr_rescued' | 'asr_only';

/** 音文对账输入参数。 */
export interface AudioTextReconcileInput {
    /** 本地声学识别产出的词级时间序列。 */
    asrWords: readonly TimedWord[];
    /** 外部字幕解析出的原始行（为空时退化为纯声学识别）。 */
    externalLines: readonly SrtLine[];
    /** 外部字幕经诊断的来源分类（决定是否信任其正文作为主干）。 */
    externalOrigin?: SubtitleTrackOrigin;
}

/** 音文对账输出结果。 */
export interface AudioTextReconcileResult {
    /** 融合后的标准词级序列（可直接送入 EnglishSubtitleSegmenter.segmentWords）。 */
    words: TimedWord[];
    /** 实际采用的对账模式。 */
    mode: ReconciliationMode;
    /** 外部字幕命中声学词的比例（0~1）。 */
    coverage: number;
    /** 被外部参考稿抢救修正的专有名词数量。 */
    rescuedProperNounCount: number;
}

interface ExternalWord {
    text: string;
    norm: string;
    approxStart: number;
    approxEnd: number;
}

const ANCHOR_SEARCH_WINDOW_SECONDS = 60;
const AUTHOR_HIGH_COVERAGE_THRESHOLD = 0.80;
const MISSING_GAP_MIN_SECONDS = 8.0;
const MISSING_GAP_MIN_WORDS = 12;
const MAX_GAP_DP_CELLS = 40_000;
const PROPER_NOUN_MIN_SIMILARITY = 0.45;
/** TitleCase 专有名词特征（至少 3 个字符，首字母大写且含小写字母，排除全大写喊叫与常见小写虚词）。 */
const TITLE_CASE_PROPER_NOUN_RE = /^[A-Z][a-z]{1,}[A-Za-z'’.-]*$/;
/** 极易在句首大写出现的高频普通虚词/代词，不做专有名词抢救覆盖。 */
const COMMON_SENTENCE_START_WORDS = new Set([
    'The', 'And', 'But', 'For', 'Nor', 'Yet', 'So', 'In', 'On', 'At', 'To', 'Of', 'With',
    'From', 'By', 'As', 'Is', 'Are', 'Was', 'Were', 'Be', 'Been', 'Have', 'Has', 'Had',
    'Do', 'Does', 'Did', 'Will', 'Would', 'Can', 'Could', 'Should', 'May', 'Might',
    'This', 'That', 'These', 'Those', 'There', 'Here', 'When', 'Where', 'Why', 'How',
    'What', 'Who', 'Which', 'While', 'Although', 'Because', 'Since', 'If', 'Unless',
    'You', 'We', 'They', 'He', 'She', 'It', 'My', 'Your', 'Our', 'Their', 'His', 'Her',
    'One', 'Two', 'Three', 'All', 'Some', 'Many', 'Most', 'Each', 'Every', 'Not', 'Now',
    'Well', 'Just', 'Also', 'Then', 'Than', 'Very', 'Even', 'Still', 'Only',
]);

const normalizeWord = (word: string): string => word.toLowerCase().replace(/[^a-z0-9]/g, '');

/** 计算 Levenshtein 归一化相似度（0~1）。 */
const normalizedSimilarity = (a: string, b: string): number => {
    const na = normalizeWord(a);
    const nb = normalizeWord(b);
    if (!na && !nb) return 1;
    if (!na || !nb) return 0;
    if (na === nb) return 1;

    const m = na.length;
    const n = nb.length;
    const prev = Array.from({ length: n + 1 }, (_, j) => j);
    const curr = new Array<number>(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = na[i - 1] === nb[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        for (let j = 0; j <= n; j++) prev[j] = curr[j];
    }
    return 1 - prev[n] / Math.max(m, n);
};

/**
 * 将外部原始字幕行清洗、合并滚屏碎片并按音节插值成词序列。
 */
const buildExternalWords = (externalLines: readonly SrtLine[]): ExternalWord[] => {
    const cleaned = resegmentIntoMeaningGroups([...externalLines]);
    const words: ExternalWord[] = [];
    for (const line of cleaned) {
        const tokens = line.contentEn.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) continue;
        const duration = Math.max(line.end - line.start, 0.1);
        const weights = tokens.map((tok) => syllableWeight(tok));
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let acc = 0;
        for (let i = 0; i < tokens.length; i++) {
            const before = acc;
            acc += weights[i];
            const norm = normalizeWord(tokens[i]);
            if (!norm) continue;
            words.push({
                text: tokens[i],
                norm,
                approxStart: line.start + duration * (before / totalWeight),
                approxEnd: line.start + duration * (acc / totalWeight),
            });
        }
    }
    return words;
};

interface AlignedPair {
    asrIndex: number;
    extIndex: number;
}

/**
 * 利用滑动窗口内的唯一 2-gram 锚点 + 局部 DP 对齐声学词与外部字幕词。
 * 返回长度等于 `asrWords.length` 的映射（-1 表示未匹配）及反向映射（-1 表示外部词未匹配）。
 */
const alignWordSequences = (
    asrWords: readonly TimedWord[],
    extWords: readonly ExternalWord[],
): { asrToExt: number[]; extToAsr: number[] } => {
    const asrNorms = asrWords.map((w) => normalizeWord(w.text));
    const nA = asrWords.length;
    const nE = extWords.length;
    const asrToExt = new Array<number>(nA).fill(-1);
    const extToAsr = new Array<number>(nE).fill(-1);
    if (nA === 0 || nE === 0) {
        return { asrToExt, extToAsr };
    }

    // 1. 建外部词 2-gram 索引，挑出在局部时间窗口内时间距离最近的严格单调锚点链。
    const bigramPositions = new Map<string, number[]>();
    for (let j = 0; j < nE - 1; j++) {
        if (!extWords[j].norm || !extWords[j + 1].norm) continue;
        const key = `${extWords[j].norm} ${extWords[j + 1].norm}`;
        const list = bigramPositions.get(key);
        if (list) list.push(j);
        else bigramPositions.set(key, [j]);
    }

    const candidates: AlignedPair[] = [];
    for (let i = 0; i < nA - 1; i++) {
        if (!asrNorms[i] || !asrNorms[i + 1]) continue;
        const key = `${asrNorms[i]} ${asrNorms[i + 1]}`;
        const positions = bigramPositions.get(key);
        if (!positions || positions.length === 0) continue;
        const inWindow = positions.filter(
            (j) => Math.abs(asrWords[i].start - extWords[j].approxStart) <= ANCHOR_SEARCH_WINDOW_SECONDS,
        );
        if (inWindow.length === 1) {
            candidates.push({ asrIndex: i, extIndex: inWindow[0] });
        }
    }

    // O(K log K) 最长严格递增子序列，筛选按时间严格单调的锚点链。
    const anchors = computeMonotonicAnchors(candidates);
    const checkpoints: Array<{ a: number; e: number }> = [{ a: -1, e: -1 }];
    for (const anchor of anchors) {
        const last = checkpoints[checkpoints.length - 1];
        if (anchor.asrIndex > last.a && anchor.extIndex > last.e) {
            checkpoints.push({ a: anchor.asrIndex, e: anchor.extIndex });
        }
        if (anchor.asrIndex + 1 > anchor.asrIndex && anchor.extIndex + 1 > anchor.extIndex) {
            checkpoints.push({ a: anchor.asrIndex + 1, e: anchor.extIndex + 1 });
        }
    }
    checkpoints.push({ a: nA, e: nE });

    // 先标记所有检查点自身的匹配。
    for (let k = 1; k < checkpoints.length - 1; k++) {
        const { a, e } = checkpoints[k];
        asrToExt[a] = e;
        extToAsr[e] = a;
    }

    // 2. 对相邻锚点之间的每段小间隙运行局部 Needleman-Wunsch 对齐。
    for (let k = 0; k < checkpoints.length - 1; k++) {
        const aStart = checkpoints[k].a + 1;
        const aEnd = checkpoints[k + 1].a;
        const eStart = checkpoints[k].e + 1;
        const eEnd = checkpoints[k + 1].e;
        const gapA = aEnd - aStart;
        const gapE = eEnd - eStart;
        if (gapA <= 0 || gapE <= 0 || gapA * gapE > MAX_GAP_DP_CELLS) {
            continue;
        }
        alignSmallGap(
            asrWords,
            asrNorms,
            extWords,
            aStart,
            aEnd,
            eStart,
            eEnd,
            asrToExt,
            extToAsr,
        );
    }

    return { asrToExt, extToAsr };
};

const computeMonotonicAnchors = (candidates: readonly AlignedPair[]): AlignedPair[] => {
    if (candidates.length === 0) return [];
    const tails: number[] = [];
    const tailIndices: number[] = [];
    const prevIdx = new Array<number>(candidates.length).fill(-1);

    for (let idx = 0; idx < candidates.length; idx++) {
        const e = candidates[idx].extIndex;
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (tails[mid] < e) lo = mid + 1;
            else hi = mid;
        }
        tails[lo] = e;
        tailIndices[lo] = idx;
        if (lo > 0) prevIdx[idx] = tailIndices[lo - 1];
    }

    const result: AlignedPair[] = [];
    for (let curr = tailIndices[tailIndices.length - 1]; curr >= 0; curr = prevIdx[curr]) {
        result.push(candidates[curr]);
    }
    result.reverse();
    return result;
};

const alignSmallGap = (
    asrWords: readonly TimedWord[],
    asrNorms: readonly string[],
    extWords: readonly ExternalWord[],
    aStart: number,
    aEnd: number,
    eStart: number,
    eEnd: number,
    asrToExt: number[],
    extToAsr: number[],
): void => {
    const m = aEnd - aStart;
    const n = eEnd - eStart;
    const width = n + 1;
    const dp = new Int32Array((m + 1) * width);
    const dir = new Uint8Array((m + 1) * width); // 0=diag, 1=up(asr skip), 2=left(ext skip)

    for (let i = 1; i <= m; i++) {
        dp[i * width] = -i;
        dir[i * width] = 1;
    }
    for (let j = 1; j <= n; j++) {
        dp[j] = -j;
        dir[j] = 2;
    }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const aIdx = aStart + i - 1;
            const eIdx = eStart + j - 1;
            const exact = asrNorms[aIdx] !== '' && asrNorms[aIdx] === extWords[eIdx].norm;
            const sim = exact ? 1 : normalizedSimilarity(asrWords[aIdx].text, extWords[eIdx].text);
            const diagScore = dp[(i - 1) * width + (j - 1)] + (exact ? 3 : sim >= 0.72 ? 1 : -2);
            const upScore = dp[(i - 1) * width + j] - 1;
            const leftScore = dp[i * width + (j - 1)] - 1;
            const cell = i * width + j;
            if (diagScore >= upScore && diagScore >= leftScore) {
                dp[cell] = diagScore;
                dir[cell] = 0;
            } else if (upScore >= leftScore) {
                dp[cell] = upScore;
                dir[cell] = 1;
            } else {
                dp[cell] = leftScore;
                dir[cell] = 2;
            }
        }
    }

    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
        const step = dir[i * width + j];
        if (i > 0 && j > 0 && step === 0) {
            const aIdx = aStart + i - 1;
            const eIdx = eStart + j - 1;
            if (asrNorms[aIdx] === extWords[eIdx].norm || normalizedSimilarity(asrWords[aIdx].text, extWords[eIdx].text) >= 0.72) {
                asrToExt[aIdx] = eIdx;
                extToAsr[eIdx] = aIdx;
            }
            i -= 1;
            j -= 1;
        } else if (i > 0 && (j === 0 || step === 1)) {
            i -= 1;
        } else {
            j -= 1;
        }
    }
};

const hasLargeMissingSpeechGap = (
    asrWords: readonly TimedWord[],
    asrToExt: readonly number[],
): boolean => {
    let runStart = -1;
    for (let i = 0; i <= asrWords.length; i++) {
        const unmatched = i < asrWords.length && asrToExt[i] === -1;
        if (unmatched) {
            if (runStart === -1) runStart = i;
            continue;
        }
        if (runStart !== -1) {
            const runWords = i - runStart;
            const runSpan = asrWords[i - 1].end - asrWords[runStart].start;
            if (runWords >= MISSING_GAP_MIN_WORDS && runSpan >= MISSING_GAP_MIN_SECONDS) {
                return true;
            }
            runStart = -1;
        }
    }
    return false;
};

const isRescuableProperNoun = (rawText: string): boolean => {
    const bare = rawText.replace(/^["'“”‘’([\]]+/, '').replace(/["'“”‘’)\],.;:!?…]+$/, '');
    if (!TITLE_CASE_PROPER_NOUN_RE.test(bare)) {
        return false;
    }
    return !COMMON_SENTENCE_START_WORDS.has(bare);
};

const transferTrailingPunctuation = (sourceProperNoun: string, targetAsrToken: string): string => {
    const extCore = sourceProperNoun.replace(/^["'“”‘’([\]]+/, '').replace(/["'“”‘’)\],.;:!?…]+$/, '');
    const leading = targetAsrToken.match(/^["'“”‘’([\]]+/)?.[0] ?? '';
    const trailing = targetAsrToken.match(/["'“”‘’)\],.;:!?…]+$/)?.[0] ?? '';
    return `${leading}${extCore}${trailing}`;
};

const buildAuthorAlignedWords = (
    asrWords: readonly TimedWord[],
    extWords: readonly ExternalWord[],
    extToAsr: readonly number[],
): TimedWord[] => {
    const total = extWords.length;
    const starts = new Array<number>(total);
    const ends = new Array<number>(total);

    for (let j = 0; j < total; j++) {
        const aIdx = extToAsr[j];
        if (aIdx >= 0) {
            starts[j] = asrWords[aIdx].start;
            ends[j] = asrWords[aIdx].end;
        }
    }

    // 未直接命中的人工词（如轻微停用词/连字符差异）在左右两个声学锚点之间线性插值，保证时间单调且贴近语音。
    let cursor = 0;
    while (cursor < total) {
        if (extToAsr[cursor] >= 0) {
            cursor += 1;
            continue;
        }
        const leftAnchor = cursor - 1;
        let rightAnchor = cursor + 1;
        while (rightAnchor < total && extToAsr[rightAnchor] < 0) {
            rightAnchor += 1;
        }
        const windowStart = leftAnchor >= 0 ? ends[leftAnchor] : extWords[cursor].approxStart;
        const windowEnd = rightAnchor < total
            ? Math.max(windowStart + 0.05, starts[rightAnchor])
            : Math.max(windowStart + 0.3 * (rightAnchor - cursor), extWords[rightAnchor - 1].approxEnd);
        const count = rightAnchor - cursor;
        const step = (windowEnd - windowStart) / count;
        for (let k = cursor; k < rightAnchor; k++) {
            const offset = k - cursor;
            starts[k] = windowStart + step * offset;
            ends[k] = windowStart + step * (offset + 1);
        }
        cursor = rightAnchor;
    }

    return extWords.map((word, index) => ({
        text: word.text,
        start: starts[index],
        end: Math.max(ends[index], starts[index] + 0.02),
    }));
};

const buildAsrWithProperNounRescue = (
    asrWords: readonly TimedWord[],
    extWords: readonly ExternalWord[],
    asrToExt: readonly number[],
): { words: TimedWord[]; rescuedProperNounCount: number } => {
    const words: TimedWord[] = asrWords.map((w) => ({ ...w }));
    let rescuedProperNounCount = 0;

    let i = 0;
    while (i < asrWords.length) {
        const mappedExt = asrToExt[i];
        if (mappedExt >= 0) {
            const asrTok = words[i];
            const extTok = extWords[mappedExt];
            if (
                normalizeWord(asrTok.text) !== extTok.norm
                && isRescuableProperNoun(extTok.text)
                && normalizedSimilarity(asrTok.text, extTok.text) >= PROPER_NOUN_MIN_SIMILARITY
            ) {
                const replaced = transferTrailingPunctuation(extTok.text, asrTok.text);
                if (replaced !== asrTok.text) {
                    words[i] = { ...asrTok, text: replaced };
                    rescuedProperNounCount += 1;
                }
            }
            i += 1;
            continue;
        }
        const aStart = i;
        while (i < asrWords.length && asrToExt[i] === -1) {
            i += 1;
        }
        const aEnd = i;
        const leftExt = aStart > 0 ? asrToExt[aStart - 1] : -1;
        const rightExt = aEnd < asrWords.length ? asrToExt[aEnd] : extWords.length;
        const eStart = leftExt >= 0 ? leftExt + 1 : 0;
        const eEnd = rightExt >= 0 ? rightExt : extWords.length;

        const aLen = aEnd - aStart;
        const eLen = eEnd - eStart;
        if (aLen >= 1 && aLen <= 2 && eLen === aLen) {
            for (let k = 0; k < aLen; k++) {
                const asrTok = words[aStart + k];
                const extTok = extWords[eStart + k];
                if (
                    isRescuableProperNoun(extTok.text)
                    && normalizedSimilarity(asrTok.text, extTok.text) >= PROPER_NOUN_MIN_SIMILARITY
                ) {
                    const replaced = transferTrailingPunctuation(extTok.text, asrTok.text);
                    if (replaced !== asrTok.text) {
                        words[aStart + k] = { ...asrTok, text: replaced };
                        rescuedProperNounCount += 1;
                    }
                }
            }
        }
    }

    return { words, rescuedProperNounCount };
};

/**
 * 音文对账与融合引擎：结合“音频声学时间轴”与“可选外部字幕文本”，自动产出最佳词级序列。
 *
 * 决策准则：
 * - 无外部参考轨时：直出纯净声学转写；
 * - 外部非平台自动轨（`author` / `external`）且词覆盖率 ≥ 80%、无长段落缺失时：
 *   保留外部人工文本与标点，将其重对齐至音频精确词级时间戳（保专名 + 零时间漂移）；
 * - 外部轨为平台 `auto_asr` 或出现缺段/大面积不一致时：
 *   采用完整性与洁净度更高的本地声学词为主干，并抢救窗口内音近的 TitleCase 专有名词（如 `Johanyan → Jahanian`）。
 */
export const reconcileAudioAndTextSubtitles = ({
    asrWords,
    externalLines,
    externalOrigin,
}: AudioTextReconcileInput): AudioTextReconcileResult => {
    if (asrWords.length === 0) {
        return { words: [], mode: 'asr_only', coverage: 0, rescuedProperNounCount: 0 };
    }
    if (externalLines.length === 0) {
        return {
            words: asrWords.map((w) => ({ ...w })),
            mode: 'asr_only',
            coverage: 0,
            rescuedProperNounCount: 0,
        };
    }

    const extWords = buildExternalWords(externalLines);
    if (extWords.length === 0) {
        return {
            words: asrWords.map((w) => ({ ...w })),
            mode: 'asr_only',
            coverage: 0,
            rescuedProperNounCount: 0,
        };
    }

    const { asrToExt, extToAsr } = alignWordSequences(asrWords, extWords);
    const matchedAsrCount = asrToExt.filter((idx) => idx >= 0).length;
    const coverage = matchedAsrCount / asrWords.length;
    const missingLargeGap = hasLargeMissingSpeechGap(asrWords, asrToExt);

    const canTrustExternalText = externalOrigin !== 'auto_asr'
        && coverage >= AUTHOR_HIGH_COVERAGE_THRESHOLD
        && !missingLargeGap;

    if (canTrustExternalText) {
        return {
            words: buildAuthorAlignedWords(asrWords, extWords, extToAsr),
            mode: 'author_aligned',
            coverage,
            rescuedProperNounCount: 0,
        };
    }

    const { words, rescuedProperNounCount } = buildAsrWithProperNounRescue(asrWords, extWords, asrToExt);
    return {
        words,
        mode: 'asr_rescued',
        coverage,
        rescuedProperNounCount,
    };
};
