import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SentencePracticeResultVO } from '@/common/contracts/sentence-practice';
import { RhythmFeedback } from '../components/ShadowingStudio';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    }),
}));

const result: SentencePracticeResultVO = {
    score: 100,
    transcript: 'the journey starts today',
    audioPath: null,
    words: [],
    rhythm: {
        speechDurationSec: 1.2,
        averageWordDurationSec: 0.3,
        paceRatio: 0.95,
        pace: 'steady',
        words: [
            { word: 'the', durationSec: 0.2, emphasis: 0.4, stressed: false },
            { word: 'journey', durationSec: 0.4, emphasis: 1, stressed: true },
            { word: 'starts', durationSec: 0.3, emphasis: 0.5, stressed: false },
            { word: 'today', durationSec: 0.3, emphasis: 0.6, stressed: false },
        ],
        notes: ['flat-stress'],
    },
};

describe('RhythmFeedback', () => {
    it('展示语速、逐词节奏与重读标注', () => {
        render(<RhythmFeedback feedback={result.rhythm!} />);

        expect(screen.getByTestId('practice-rhythm-feedback')).toBeDefined();
        expect(screen.getByText('节奏与重读')).toBeDefined();
        expect(screen.getByText('语速 {{pace}}')).toBeDefined();
        expect(screen.getByText('0.95×')).toBeDefined();
        expect(screen.getByText('journey').className).toContain('font-semibold');
        expect(screen.getByText('the').className).not.toContain('font-semibold');
        expect(screen.getByText('重音起伏不明显，找一两个关键词说得更重。')).toBeDefined();
    });

    it('不展示伪估算音节数且超过 10 词的长句默认折叠逐词重读明细', () => {
        const longWords = Array.from({ length: 12 }, (_, idx) => ({
            word: `word${idx}`,
            durationSec: 0.3,
            emphasis: idx === 2 ? 1 : 0.4,
            stressed: idx === 2,
        }));
        render(
            <RhythmFeedback
                feedback={{
                    ...result.rhythm!,
                    words: longWords,
                    syllables: { reference: 26, estimated: 69, verdict: 'more' },
                    notes: [],
                }}
            />,
        );

        expect(screen.queryByText('69/26')).toBeNull();
        expect(screen.queryByText('word2')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '查看逐词重读 ({{count}} 词)' }));
        expect(screen.getByText('word2').className).toContain('font-semibold');
    });
});
