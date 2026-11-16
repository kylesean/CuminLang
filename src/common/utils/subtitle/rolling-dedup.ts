import type { SrtLine } from './types';
import {
    BRACKET_STAGE_CUE_RE,
    MUSIC_SYMBOL_RE,
    PAREN_SOUND_CUE_RE,
    SPEAKER_CHEVRON_TOKEN_RE,
    stripStageSoundCues,
} from './stage-cues';

/** 相邻两行间隔达到该阈值（秒）以上时，视为真实停顿而非屏幕滚动重叠。 */
const MAX_ROLLING_GAP_SECONDS = 1.0;

/** 把阶段性音效标记或普通空白分隔片段切开，保证 `[clears throat]` 等多词舞台标记按单 token 处理。 */
const TOKEN_OR_STAGE_CUE_RE = new RegExp(
    `${BRACKET_STAGE_CUE_RE.source}|${PAREN_SOUND_CUE_RE.source}|${MUSIC_SYMBOL_RE.source}|\\S+`,
    'gi',
);

/**
 * 把文本切成用于重叠比较的词序列：剥离非人声舞台标记与 `>>`、统一小写，
 * 并剥离**每个词**首尾的标点与引号。
 *
 * 滚动式自动字幕的重复尾巴常带不同的标点、大小写或夹杂 `>>` / `[cheering]`
 * （`about.` / `about`、`it.` / `it`、`visited >> [cheering]`）。逐字比较会把
 * 同一段语音当成两句，所以比较前逐词抹平。
 * 只剥标点、不剥词内连字符：`well-known` 仍是一个词。
 *
 * @param text 原始文本。
 * @returns 归一化后的词序列。
 */
const normalizeWords = (text: string): string[] => {
    const clean = stripStageSoundCues(text).text;
    if (!clean) {
        return [];
    }
    return clean
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter((word) => !SPEAKER_CHEVRON_TOKEN_RE.test(word))
        .map((word) => word.replace(/^["'“”‘’([\]]+/, '').replace(/["'“”‘’)\],.;:!?…]+$/, ''))
        .filter(Boolean);
};

/**
 * 找出 `next` 开头与 `previous` 结尾重叠的词数。
 *
 * YouTube 滚动字幕的典型形态是后一条 cue 重复前一条的尾巴：视觉上字幕
 * 向上滚动，同屏保留上一行的后半句。这种重叠若不去掉，拼出来的意群会
 * 出现 `... questions a topic that I get...` 这类重复文本。
 *
 * 只在**词边界**上比较，且要求重叠至少两个词：单字重叠（如 `a`、`I`）
 * 在自然语言里极其常见，按它去重会误删真实内容。
 *
 * @param previous 前一条已归并文本。
 * @param next 后一条待归并文本。
 * @returns 需要从 `next` 头部剥掉的词数；无重叠时为 0。
 */
export const rollingOverlapWordCount = (previous: string, next: string): number => {
    const previousWords = normalizeWords(previous);
    const nextWords = normalizeWords(next);
    if (previousWords.length < 2 || nextWords.length < 2) {
        return 0;
    }
    const maxOverlap = Math.min(previousWords.length, nextWords.length);
    // 从最长的可能重叠开始试：滚动字幕重复的通常是完整尾巴，优先匹配更长者，
    // 避免 `I think that` / `that I think` 这类对称片段被短匹配抢先。
    for (let size = maxOverlap; size >= 2; size--) {
        const tail = previousWords.slice(previousWords.length - size).join(' ');
        const head = nextWords.slice(0, size).join(' ');
        if (tail === head) {
            return size;
        }
    }
    return 0;
};

/**
 * 从文本头部剥掉指定数量的词。
 *
 * 词数与 {@link rollingOverlapWordCount} 的归一化口径一致：纯标点 token
 * （如行首孤立的引号 `"`）归一化后为空、不占词数，剥词时必须跳过它们，
 * 否则按原始 token 计数会把标点当成词剥掉、留下真实的重复词。
 *
 * 剥完后按单空格拼回，与意群归并的输出口径一致。
 *
 * @param text 原始文本。
 * @param count 要剥掉的词数（按归一化词计）。
 * @returns 剩余文本；全部剥完时为空字符串。
 */
export const dropLeadingWords = (text: string, count: number): string => {
    if (count <= 0) {
        return text.trim();
    }
    const rawTokens = text.trim().match(TOKEN_OR_STAGE_CUE_RE) ?? [];
    let idx = 0;
    while (idx < rawTokens.length && count > 0) {
        const wordsInToken = normalizeWords(rawTokens[idx]).length;
        if (wordsInToken > 0) {
            count -= wordsInToken;
        }
        idx += 1;
    }
    return rawTokens.slice(idx).join(' ').trim();
};

/**
 * 去掉相邻字幕行之间的滚动重复尾巴。
 *
 * 只处理**相邻**且无明显停顿间隔的两行：滚动字幕的重复是局部现象，
 * 跨行比较或跨越长停顿（如掌声后演讲者主动重复上一词继续讲）会把真实重述误删。
 *
 * 若后一行完全被前一行覆盖（`next` 是 `previous` 的后缀），整行丢弃；
 * 丢弃后该行的时长并入前一行，避免时间轴出现空洞。
 *
 * @param lines 已按时间升序的字幕行。
 * @returns 去重后的字幕行；`index` 重新编号。
 */
export const dedupeRollingLines = (lines: readonly SrtLine[]): SrtLine[] => {
    if (lines.length < 2) {
        return [...lines];
    }
    const result: SrtLine[] = [];
    for (const line of lines) {
        const text = line.contentEn.trim();
        if (!text) {
            continue;
        }
        const previous = result[result.length - 1];
        if (!previous) {
            result.push({ ...line, contentEn: text });
            continue;
        }
        // 中间存在 >= 1s 的静音/掌声间隔时，属于真实重述，不属于滚屏重叠。
        if (line.start - previous.end >= MAX_ROLLING_GAP_SECONDS) {
            result.push({ ...line, contentEn: text });
            continue;
        }
        const overlap = rollingOverlapWordCount(previous.contentEn, text);
        if (overlap === 0) {
            result.push({ ...line, contentEn: text });
            continue;
        }
        const remainder = dropLeadingWords(text, overlap);
        if (remainder.length === 0) {
            // 整行都是重复内容：丢弃该行，把它的结束时间并入前一行。
            result[result.length - 1] = {
                ...previous,
                end: Math.max(previous.end, line.end),
            };
            continue;
        }
        result.push({ ...line, contentEn: remainder });
    }
    return result.map((line, index) => ({ ...line, index: index + 1 }));
};
