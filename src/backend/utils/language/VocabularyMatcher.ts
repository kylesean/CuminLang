import winkNLP from 'wink-nlp';
import type { ItsFunction } from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);

/** 词表匹配输入项。 */
export interface VocabularyEntry<TPayload> { text: string; payload: TPayload; }
/** 词表命中结果。 */
export interface VocabularyMatch<TPayload> { original: string; normalized: string; payload: TPayload; }
/** 基于字幕 token lemma 的单向词表匹配器。 */
export interface VocabularyMatcher<TPayload> { match(text: string): VocabularyMatch<TPayload>[]; }

/** wink 分析出的单个 token 语义信息。 */
export interface AnalyzedToken {
    /** 原始文本。 */
    text: string;
    /** 词形还原后的 lemma（标点等非词 token 为原文小写）。 */
    lemma: string;
    /** wink 的 token 类型（word / punctuation 等）。 */
    type: string;
    /** Universal Dependencies 词性标记（NOUN/VERB/ADJ/ADV/ADP/CCONJ/SCONJ/PRON/DET/AUX 等）。 */
    pos: string;
}

/**
 * 对一段文本做一次 wink 分词、词性标注与 lemma 归一化。
 *
 * 说明：句子选词需要逐 token 的 lemma，而不是拼接后的整体 lemma，因此单独暴露该入口。
 *
 * @param text 原文。
 * @returns 与原文顺序一致的 token 列表。
 */
export function analyzeWords(text: string): AnalyzedToken[] {
    if (!text?.trim()) {
        return [];
    }
    const doc = nlp.readDoc(text);
    const values = doc.tokens().out(nlp.its.value as unknown as ItsFunction<string>) as string[];
    const lemmas = doc.tokens().out(nlp.its.lemma as unknown as ItsFunction<string>) as string[];
    const types = doc.tokens().out(nlp.its.type as unknown as ItsFunction<string>) as string[];
    const poses = doc.tokens().out(nlp.its.pos as unknown as ItsFunction<string>) as string[];
    return values.map((value, index) => ({
        text: value,
        lemma: lemmas[index] ?? value,
        type: types[index] ?? 'text',
        pos: poses[index] ?? '',
    }));
}

/** 已编译的多词词组匹配项。 */
interface CompiledPhrase<TPayload> {
    canonical: string;
    lemmas: string[];
    surfaces: string[];
    entry: VocabularyEntry<TPayload>;
}

/**
 * 字幕侧使用 wink 的 POS-aware lemma 查询索引；词表侧保留用户输入原文，
 * 单词按原文索引，多词词组（lexical chunks）按首词 lemma 分桶并以最长匹配优先。
 */
export class WinkVocabularyMatcher<TPayload> implements VocabularyMatcher<TPayload> {
    private readonly wordIndex = new Map<string, VocabularyEntry<TPayload>>();
    private readonly phraseBuckets = new Map<string, CompiledPhrase<TPayload>[]>();

    /**
     * 编译词表 lemma 索引。
     * @param entries 词表原始词条及其业务对象。
     */
    constructor(entries: VocabularyEntry<TPayload>[]) {
        const pushBucket = (bucketKey: string, compiled: CompiledPhrase<TPayload>) => {
            if (!bucketKey) return;
            const list = this.phraseBuckets.get(bucketKey) ?? [];
            if (!list.includes(compiled)) {
                list.push(compiled);
                list.sort((a, b) => b.lemmas.length - a.lemmas.length);
                this.phraseBuckets.set(bucketKey, list);
            }
        };

        entries.forEach((entry) => {
            const key = entry.text.trim().toLowerCase();
            if (!key) return;
            const phraseTokens = /\s/u.test(key)
                ? analyzeWords(key).filter((token) => token.type === 'word')
                : [];
            if (phraseTokens.length >= 2) {
                const lemmas = phraseTokens.map((token) => token.lemma.toLowerCase());
                const surfaces = phraseTokens.map((token) => token.text.toLowerCase());
                const compiled: CompiledPhrase<TPayload> = {
                    canonical: key,
                    lemmas,
                    surfaces,
                    entry,
                };
                pushBucket(lemmas[0], compiled);
                pushBucket(surfaces[0], compiled);
                return;
            }
            this.wordIndex.set(key, entry);
        });
    }

    /**
     * 分析整段字幕并按 lemma 查找词表（优先匹配连续多词词组，其次单词）。
     * @param text 一行字幕原文。
     * @returns 命中的原文词形和对应词表条目。
     */
    match(text: string): VocabularyMatch<TPayload>[] {
        if (!text?.trim()) return [];
        const wordTokens = this.analyze(text).filter((token) => token.type === 'word');
        const matches: VocabularyMatch<TPayload>[] = [];

        for (let i = 0; i < wordTokens.length; i += 1) {
            const token = wordTokens[i];
            const lemma = token.lemma.toLowerCase();
            const surface = token.text.toLowerCase();

            const bucket = this.phraseBuckets.get(lemma) ?? this.phraseBuckets.get(surface);
            let matchedPhrase: CompiledPhrase<TPayload> | null = null;
            if (bucket) {
                for (const candidate of bucket) {
                    if (i + candidate.lemmas.length > wordTokens.length) continue;
                    const allMatched = candidate.lemmas.every((expectedLemma, offset) => {
                        const target = wordTokens[i + offset];
                        return (
                            target.lemma.toLowerCase() === expectedLemma
                            || target.text.toLowerCase() === candidate.surfaces[offset]
                        );
                    });
                    if (allMatched) {
                        matchedPhrase = candidate;
                        break;
                    }
                }
            }

            if (matchedPhrase) {
                const span = matchedPhrase.lemmas.length;
                const original = wordTokens.slice(i, i + span).map((item) => item.text).join(' ');
                matches.push({
                    original,
                    normalized: matchedPhrase.canonical,
                    payload: matchedPhrase.entry.payload,
                });
                i += span - 1;
                continue;
            }

            const entry = this.wordIndex.get(lemma) ?? this.wordIndex.get(surface);
            if (entry) {
                matches.push({ original: token.text, normalized: entry.text.trim().toLowerCase(), payload: entry.payload });
            }
        }
        return matches;
    }

    /**
     * 对单段文本执行一次 wink 分词、词性标注和 lemma 归一化。
     * @param text 原文。
     * @returns token 语义信息。
     */
    private analyze(text: string): AnalyzedToken[] {
        return analyzeWords(text);
    }
}

/**
 * 将单个单词或词组的变体（复数、时态等）还原为原始形态（lemma）。
 *
 * 行为说明：
 * - 对每个 word token 取 wink 推导的 lemma 并用空格拼接，兼容词组；
 * - 输入不含任何 word token 时，返回清理后的原文（小写）；
 * - 输入为空时返回空字符串。
 *
 * @param text 原形未知的单词或词组原文。
 * @returns 还原后的原形（小写）。
 */
export function lemmatizeWord(text: string): string {
    const cleaned = text?.trim() ?? '';
    if (!cleaned) {
        return '';
    }

    const doc = nlp.readDoc(cleaned);
    const lemmas = doc.tokens().out(nlp.its.lemma as unknown as ItsFunction<string>) as string[];
    const types = doc.tokens().out(nlp.its.type as unknown as ItsFunction<string>) as string[];

    const parts = types
        .map((type, index) => (type === 'word' ? (lemmas[index] ?? '').toLowerCase() : ''))
        .filter((part) => part.length > 0);

    return parts.length > 0 ? parts.join(' ') : cleaned.toLowerCase();
}
