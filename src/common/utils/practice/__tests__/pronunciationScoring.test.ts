import { describe, expect, it } from 'vitest';

import {
    alignPracticeTokens,
    computeContentWeightedScore,
    normalizePracticeTokens,
} from '@/common/utils/practice/pronunciationScoring';

describe('alignPracticeTokens 词级对齐评分', () => {
    it('完全一致(大小写/标点差异被规范化)得满分', () => {
        const result = alignPracticeTokens('Hello world.', 'hello world!');
        expect(result.score).toBe(100);
        expect(result.words.map((w) => w.status)).toEqual(['match', 'match']);
    });

    it('听岔一个音判为 sub,按字符相似度折算分数', () => {
        const result = alignPracticeTokens('I like green apples', 'I like grain apples');
        // green→grain 编辑距离 2,相似度 0.6;(3 + 0.5×0.6) / 4 × 100 ≈ 83
        expect(result.score).toBe(83);
        const sub = result.words.find((w) => w.status === 'sub');
        expect(sub?.expected).toBe('green');
        expect(sub?.heard).toBe('grain');
        expect(sub?.similarity).toBe(0.6);
    });

    it('漏词判为 missing 且扣分', () => {
        const result = alignPracticeTokens('I like green apples', 'I like apples');
        expect(result.score).toBe(75);
        const missing = result.words.find((w) => w.status === 'missing');
        expect(missing?.expected).toBe('green');
        expect(missing?.heard).toBeNull();
    });

    it('多说的词判为 extra 且追加在词序中,不破坏满分', () => {
        const result = alignPracticeTokens('I like apples', 'I really like apples');
        expect(result.score).toBe(100);
        const extra = result.words.find((w) => w.status === 'extra');
        expect(extra?.heard).toBe('really');
    });

    it('完全没说出来(空产出)得 0 分且全部 missing', () => {
        const result = alignPracticeTokens('hello world', '');
        expect(result.score).toBe(0);
        expect(result.words.map((w) => w.status)).toEqual(['missing', 'missing']);
    });

    it('原句为空时按有无产出判分', () => {
        expect(alignPracticeTokens('', 'hello').score).toBe(0);
        expect(alignPracticeTokens('', '').score).toBe(100);
    });

    it('缩读两侧形态一致时天然对齐(ASR 写 don\'t 或 don t 同分)', () => {
        const a = alignPracticeTokens("don't worry be happy", "don't worry be happy");
        const b = alignPracticeTokens("don't worry be happy", 'don t worry be happy');
        expect(a.score).toBe(100);
        expect(b.score).toBe(100);
    });

    it('normalizePracticeTokens 只留词 token 且小写', () => {
        expect(normalizePracticeTokens("It's fine, don't worry.")).toEqual(['it', 's', 'fine', 'don', 't', 'worry']);
    });

    it('孤立连字符（破折号）不进词序列，连字符合成词保留', () => {
        // 字幕里 "oh - really" 的空格包围连字符经 isWordToken 存活，但 ASR 与
        // 听写输入都不可能产出它，留在期望序列只会虚增分母造成固定扣分
        expect(normalizePracticeTokens('oh - really')).toEqual(['oh', 'really']);
        expect(normalizePracticeTokens('a well-known fact')).toEqual(['a', 'well-known', 'fact']);
    });

    it('口语缩读与连读弱化形式等价对齐且容忍同音词', () => {
        expect(alignPracticeTokens("It's gonna be fine", 'It is going to be fine').score).toBe(100);
        expect(alignPracticeTokens('Do not worry', "Don't worry").score).toBe(100);
        expect(alignPracticeTokens('I know their right answer', 'I no there write answer').score).toBe(100);
    });

    it('关闭 allowHomophones 时，听写同音异义错字不能判为 match 或满分', () => {
        const result = alignPracticeTokens(
            'Write their name right there',
            'Right there name write their',
            { allowHomophones: false },
        );
        expect(result.score).toBeLessThan(100);
        expect(result.words.map((w) => w.status)).toEqual(['sub', 'sub', 'match', 'sub', 'sub']);
    });

    it('关闭 allowHomophones 时，听写仍兼容标准英美拼写变体与连字符复合词', () => {
        const result = alignPracticeTokens(
            'A real-time color center program',
            'A realtime colour centre programme',
            { allowHomophones: false },
        );
        expect(result.score).toBe(100);
        expect(result.words.every((w) => w.status === 'match')).toBe(true);
    });

    it('computeContentWeightedScore 赋予实词比功能词更高权重', () => {
        const missedFunctionWord = alignPracticeTokens('to the bright mountain', 'the bright mountain');
        const missedContentWord = alignPracticeTokens('to the bright mountain', 'to the mountain');
        expect(computeContentWeightedScore(missedFunctionWord.words))
            .toBeGreaterThan(computeContentWeightedScore(missedContentWord.words));
    });
});
