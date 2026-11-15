import { describe, expect, it } from 'vitest';
import { splitClozeSegments } from '../cloze';

describe('splitClozeSegments', () => {
    it.each([
        {
            caseName: '不规则过去式与原形词互匹配',
            sentence: 'She went home early yesterday.',
            target: 'go',
            matchedTexts: ['went'],
        },
        {
            caseName: '规则屈折与双写辅音',
            sentence: 'They stopped trying and planned another route.',
            target: 'stop',
            matchedTexts: ['stopped'],
        },
        {
            caseName: '多词词组支持时态变化整段挖空',
            sentence: 'He finally figured out the root cause.',
            target: 'figure out',
            matchedTexts: ['figured out'],
        },
        {
            caseName: '未命中目标词时保持整句不变',
            sentence: 'The weather looks bright.',
            target: 'journey',
            matchedTexts: [],
        },
    ])('$caseName', ({ sentence, target, matchedTexts }) => {
        const segments = splitClozeSegments(sentence, target);
        expect(segments.filter((s) => s.matched).map((s) => s.text)).toEqual(matchedTexts);
        expect(segments.map((s) => s.text).join('')).toBe(sentence);
    });
});
