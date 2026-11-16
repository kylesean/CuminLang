import type { Sentence } from '@/common/types/SentenceC';

/**
 * 意群块：若干条连续字幕行归并出的完整意群。
 *
 * 整句模式下它取代单条字幕行，成为精听导航、单句循环与自动暂停的最小单位；
 * 渲染层按块展示全部行并高亮当前行。
 */
export interface SentenceBlock {
    /** 块内字幕行（按 index 升序）。 */
    sentences: Sentence[];
    /** 块起始时间（秒，取首行原始 start）。 */
    start: number;
    /** 块结束时间（秒，取末行原始 end）。 */
    end: number;
    /** 块内累计英文字符数（含行间空格），用于防止无标点字幕归并出巨块。 */
    charCount: number;
    /** 块代表句（首行），供导航定位与 seek 使用。 */
    repr: Sentence;
}

/**
 * 句末标点：行文本以此收尾即视为完整意群结束。
 * 允许紧跟收尾引号/括号（如 `."`、`?")`）；省略号（… 或 ...）同样算收束。
 */
const TERMINAL_END_PATTERN = /[.!?…]["'”』」)\]]?$/;

/** 行间隔小于该值（秒）才归入同一意群；说话人明显停顿视为天然边界。 */
const MAX_GAP_SECONDS = 0.8;

/**
 * 单个意群的英文字符数上限。
 * YouTube 自动字幕可能整段没有句末标点，没有上限会把几十行归并成一个巨块。
 */
const MAX_BLOCK_CHARS = 220;

const PARAGRAPH_PAUSE_BREAK_SECONDS = 2.0;
const DEFAULT_MAX_PARAGRAPH_SENTENCES = 4;
const DEFAULT_SOFT_PARAGRAPH_CHARS = 280;
const DEFAULT_HARD_PARAGRAPH_CHARS = 440;

export interface ParagraphGroupingOptions {
    /** 场景或话题切换处的句子 index 集合：命中时强制另起一段。 */
    sceneDividerIndices?: ReadonlySet<number>;
    /** 单段最多容纳句子数（默认 4 句）。 */
    maxSentencesPerParagraph?: number;
    /** 软字数阈值（超过后遇到句末标点即收束另起一段）。 */
    softParagraphChars?: number;
    /** 硬字数上限（达到后无论如何封段）。 */
    hardParagraphChars?: number;
    /** 长停顿分段阈值（秒，默认 2.0s）。 */
    pauseBreakSeconds?: number;
}

/**
 * 判断行文本是否以句末标点收束。
 *
 * @param text 行文本（英文原文）。
 * @returns 以句末标点结尾时返回 `true`。
 */
const endsWithTerminalPunctuation = (text: string): boolean => {
    const trimmed = text.trimEnd();
    return trimmed.length > 0 && TERMINAL_END_PATTERN.test(trimmed);
};

/**
 * 把字幕行归并成完整意群块。
 *
 * 归并条件（对「当前块末行 → 下一行」同时满足）：末行不以句末标点收束、
 * 两行间隔小于 {@link MAX_GAP_SECONDS}、并入后块内字符数不超过
 * {@link MAX_BLOCK_CHARS}；任一不满足即封块另起。时间上允许行区间重叠
 * （间隔为负同样视为连续）。
 *
 * @param sentences 字幕行数组；应已按 index 升序。
 * @returns 按输入顺序排列的意群块；单行视频每行即一块。
 */
export const groupSentencesIntoBlocks = (sentences: Sentence[]): SentenceBlock[] => {
    const blocks: SentenceBlock[] = [];
    let current: SentenceBlock | null = null;
    for (const sentence of sentences) {
        const canMerge = current !== null
            && !endsWithTerminalPunctuation(current.sentences[current.sentences.length - 1].text)
            && sentence.start - current.end < MAX_GAP_SECONDS
            && current.charCount + sentence.text.length <= MAX_BLOCK_CHARS;
        if (current !== null && canMerge) {
            current.sentences.push(sentence);
            current.end = sentence.end;
            current.charCount += sentence.text.length;
        } else {
            current = {
                sentences: [sentence],
                start: sentence.start,
                end: sentence.end,
                charCount: sentence.text.length,
                repr: sentence,
            };
            blocks.push(current);
        }
    }
    return blocks;
};

/**
 * 将完成规范化的完整句子按话题停顿与篇幅节奏合并成「讲稿」自然阅读段落（通常 2~4 句一段）。
 *
 * 与用于播放/复读切分的 {@link groupSentencesIntoBlocks} 不同，本函数不会因句末出现 `.!?`
 * 就把单句拆成孤立卡片，而是结合场景切分点、说话长停顿与自然段字数预算组段。
 */
export const groupSentencesIntoParagraphs = (
    sentences: readonly Sentence[],
    options?: ParagraphGroupingOptions,
): SentenceBlock[] => {
    const sceneDividerIndices = options?.sceneDividerIndices;
    const maxSentences = options?.maxSentencesPerParagraph ?? DEFAULT_MAX_PARAGRAPH_SENTENCES;
    const softChars = options?.softParagraphChars ?? DEFAULT_SOFT_PARAGRAPH_CHARS;
    const hardChars = options?.hardParagraphChars ?? DEFAULT_HARD_PARAGRAPH_CHARS;
    const pauseBreak = options?.pauseBreakSeconds ?? PARAGRAPH_PAUSE_BREAK_SECONDS;

    const paragraphs: SentenceBlock[] = [];
    let current: SentenceBlock | null = null;

    for (const sentence of sentences) {
        const startsNewScene = sceneDividerIndices?.has(sentence.index) ?? false;
        const canContinue = current !== null
            && !startsNewScene
            && sentence.start - current.end < pauseBreak
            && current.sentences.length < maxSentences
            && current.charCount + sentence.text.length <= hardChars
            && !(
                current.charCount >= softChars
                && endsWithTerminalPunctuation(current.sentences[current.sentences.length - 1].text)
            );

        if (current !== null && canContinue) {
            current.sentences.push(sentence);
            current.end = Math.max(current.end, sentence.end);
            current.charCount += sentence.text.length + 1;
        } else {
            current = {
                sentences: [sentence],
                start: sentence.start,
                end: sentence.end,
                charCount: sentence.text.length,
                repr: sentence,
            };
            paragraphs.push(current);
        }
    }

    return paragraphs;
};

/**
 * 查找句子所属的意群块。
 *
 * @param blocks 归并结果。
 * @param sentence 目标句子；null 时直接返回 null。
 * @returns 所属块；找不到（如切视频后的旧引用）返回 `null`。
 */
export const findSentenceBlock = (
    blocks: SentenceBlock[],
    sentence: Sentence | null,
): SentenceBlock | null => {
    if (!sentence) {
        return null;
    }
    return blocks.find((block) => block.sentences.some((item) => item.key === sentence.key)) ?? null;
};

/**
 * 计算主字幕区应渲染的句子范围。
 *
 * 后端已把字幕重切成完整意群，一条意群通常就是一句（长句由渲染层自动折行），
 * 因此「显示多少」真正有意义的维度是**上下文**而不是块内行数。
 *
 * - `sentence`：只返回当前句；
 * - `context`：额外带上前后各一句。
 *
 * 只影响渲染，不改变 currentSentence、循环区间或导航单位。
 *
 * @param sentences 全部句子（应已按 index 升序）。
 * @param current 当前句。
 * @param mode 显示范围。
 * @returns 待渲染的句子（按原顺序）；当前句不在列表中时退化为只显示它。
 */
export const selectVisibleSentences = (
    sentences: readonly Sentence[],
    current: Sentence | null,
    mode: 'sentence' | 'context',
): Sentence[] => {
    if (!current) {
        return [];
    }
    if (mode === 'sentence' || sentences.length === 0) {
        return [current];
    }
    const at = sentences.findIndex((item) => item.key === current.key);
    if (at < 0) {
        return [current];
    }
    return sentences.slice(Math.max(0, at - 1), Math.min(sentences.length, at + 2));
};
