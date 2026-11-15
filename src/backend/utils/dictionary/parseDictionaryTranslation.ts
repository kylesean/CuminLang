import type { EnglishDictionarySense } from '@/common/contracts/english-dictionary';
import type { OpenAIDictionaryDefinition } from '@/common/types/DictionaryResult';
import { analyzeWords, lemmatizeWord } from '@/backend/utils/language/VocabularyMatcher';

const UD_POS_TO_DICT_PREFIXES: Record<string, readonly string[]> = {
    NOUN: ['n.'],
    PROPN: ['n.'],
    VERB: ['v.', 'vt.', 'vi.', 'aux.'],
    AUX: ['aux.', 'v.', 'vt.', 'vi.'],
    ADJ: ['adj.', 'a.'],
    ADV: ['adv.', 'ad.'],
    ADP: ['prep.'],
    CCONJ: ['conj.'],
    SCONJ: ['conj.'],
    PRON: ['pron.'],
    NUM: ['num.'],
    DET: ['art.', 'det.'],
    INTJ: ['int.', 'interj.'],
};

const UD_POS_TO_WORDNET_POS: Record<string, readonly string[]> = {
    NOUN: ['n'],
    PROPN: ['n'],
    VERB: ['v'],
    AUX: ['v'],
    ADJ: ['a', 's'],
    ADV: ['r'],
};

/** 从上下文句中提取目标单词的 UD 词性标记。 */
export const detectWordPosInContext = (word: string, context?: string): string | null => {
    const cleanContext = context?.trim();
    const cleanWord = word?.trim().toLowerCase();
    if (!cleanContext || !cleanWord || /\s/u.test(cleanWord)) {
        return null;
    }

    const tokens = analyzeWords(cleanContext).filter((token) => token.type === 'word');
    const exactMatch = tokens.find((token) => token.text.toLowerCase() === cleanWord);
    if (exactMatch?.pos) {
        return exactMatch.pos;
    }
    const targetLemma = lemmatizeWord(cleanWord);
    const lemmaMatch = tokens.find((token) => token.lemma.toLowerCase() === targetLemma);
    return lemmaMatch?.pos || null;
};

/**
 * 根据上下文句子的词性稳定重排本地词典义项，让当前语境词性排在最前。
 */
export const rankDefinitionsByContextPos = (
    definitions: OpenAIDictionaryDefinition[],
    word: string,
    context?: string,
): OpenAIDictionaryDefinition[] => {
    if (definitions.length <= 1) return definitions;
    const udPos = detectWordPosInContext(word, context);
    const preferred = udPos ? UD_POS_TO_DICT_PREFIXES[udPos] : undefined;
    if (!preferred || preferred.length === 0) return definitions;

    const matched: OpenAIDictionaryDefinition[] = [];
    const rest: OpenAIDictionaryDefinition[] = [];
    for (const def of definitions) {
        const pos = def.partOfSpeech.trim().toLowerCase();
        if (preferred.includes(pos)) {
            matched.push(def);
        } else {
            rest.push(def);
        }
    }
    return matched.length > 0 && matched.length < definitions.length ? [...matched, ...rest] : definitions;
};

/**
 * 根据上下文词性稳定重排 WordNet 英英释义列表。
 */
export const rankEnglishSensesByContextPos = (
    senses: EnglishDictionarySense[],
    word: string,
    context?: string,
): EnglishDictionarySense[] => {
    if (senses.length <= 1) return senses;
    const udPos = detectWordPosInContext(word, context);
    const preferred = udPos ? UD_POS_TO_WORDNET_POS[udPos] : undefined;
    if (!preferred || preferred.length === 0) return senses;

    const matched: EnglishDictionarySense[] = [];
    const rest: EnglishDictionarySense[] = [];
    for (const sense of senses) {
        if (preferred.includes(sense.partOfSpeech.trim().toLowerCase())) {
            matched.push(sense);
        } else {
            rest.push(sense);
        }
    }
    return matched.length > 0 && matched.length < senses.length ? [...matched, ...rest] : senses;
};

/**
 * 将多行中文释义拆成单词卡释义列表。
 *
 * 行为说明：
 * - 每行形如 "n. 取消" / "vt. 删去"，识别行首小写词性前缀（如 n./vt./adj.）后拆分为词性与释义；
 * - 识别不到词性前缀的行（如 "[计] 作废"）词性留空，释义整行保留；
 * - 空行直接丢弃。
 *
 * 预置词典与用户导入词典共用这一套拆分规则，保证单词卡形状一致。
 *
 * @param translation 多行中文释义原文。
 * @returns 单词卡释义列表；输入为空时返回空数组。
 */
export const parseDictionaryTranslation = (translation: string): OpenAIDictionaryDefinition[] => {
    const definitions: OpenAIDictionaryDefinition[] = [];
    for (const rawLine of translation.split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line) continue;

        const match = line.match(/^([a-z]{1,8}\.)\s*(.+)$/u);
        if (match) {
            definitions.push({ partOfSpeech: match[1], meaning: match[2].trim(), examples: [] });
        } else {
            definitions.push({ partOfSpeech: '', meaning: line, examples: [] });
        }
    }
    return definitions;
};
