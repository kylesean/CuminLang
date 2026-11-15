import { describe, expect, it } from 'vitest';

import {
    buildRhythmFeedback,
    decodePcm16Wav,
    type RhythmToken,
} from '@/common/utils/practice/rhythmFeedback';

const SAMPLE_RATE = 16000;

/**
 * 构造 16kHz 单声道 16-bit PCM WAV，便于在不依赖 ffmpeg 的情况下测试解析。
 */
const buildWav = (samples: number[]): Uint8Array => {
    const dataLength = samples.length * 2;
    const buffer = new Uint8Array(44 + dataLength);
    const view = new DataView(buffer.buffer);
    const writeAscii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i += 1) {
            buffer[offset + i] = text.charCodeAt(i);
        }
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataLength, true);
    samples.forEach((sample, index) => {
        view.setInt16(44 + index * 2, sample, true);
    });
    return buffer;
};

/**
 * 以固定振幅填充一段时长，模拟词的音量。
 */
const fill = (samples: number[], seconds: number, amplitude: number): void => {
    const count = Math.round(seconds * SAMPLE_RATE);
    for (let i = 0; i < count; i += 1) {
        samples.push(i % 2 === 0 ? amplitude : -amplitude);
    }
};

const tokensFor = (words: Array<{ word: string; start: number; end: number }>): RhythmToken[] =>
    words.map((word) => ({
        text: ` ${word.word}`,
        start: word.start,
        end: word.end,
    }));

describe('decodePcm16Wav', () => {
    it('解析 16kHz 单声道 16-bit WAV 的采样与采样率', () => {
        const pcm = decodePcm16Wav(buildWav([0, 1000, -1000, 2000]));

        expect(pcm).not.toBeNull();
        expect(pcm?.sampleRate).toBe(SAMPLE_RATE);
        expect(Array.from(pcm?.samples ?? [])).toEqual([0, 1000, -1000, 2000]);
    });

    it('拒绝非 WAV 或空音频', () => {
        expect(decodePcm16Wav(new Uint8Array([1, 2, 3]))).toBeNull();
        expect(decodePcm16Wav(buildWav([]))).toBeNull();
    });
});

describe('buildRhythmFeedback', () => {
    it('按词计算时长与相对重音，并标出明显更重的关键词', () => {
        const samples: number[] = [];
        fill(samples, 0.3, 2000);
        fill(samples, 0.3, 12000);
        fill(samples, 0.3, 3000);
        fill(samples, 0.3, 4000);
        const pcm = decodePcm16Wav(buildWav(samples));
        expect(pcm).not.toBeNull();

        const feedback = buildRhythmFeedback({
            expectedText: 'the journey starts today',
            transcript: 'the journey starts today',
            tokens: tokensFor([
                { word: 'the', start: 0, end: 0.3 },
                { word: 'journey', start: 0.3, end: 0.6 },
                { word: 'starts', start: 0.6, end: 0.9 },
                { word: 'today', start: 0.9, end: 1.2 },
            ]),
            pcm: pcm!,
            referenceDurationSec: 1.2,
        });

        expect(feedback).not.toBeNull();
        expect(feedback?.words.map((word) => word.word))
            .toEqual(['the', 'journey', 'starts', 'today']);
        expect(feedback?.words.find((word) => word.word === 'journey')?.emphasis).toBe(1);
        expect(feedback?.words.find((word) => word.word === 'journey')?.stressed).toBe(true);
        expect(feedback?.words.find((word) => word.word === 'the')?.stressed).toBe(false);
        expect(feedback?.pace).toBe('steady');
        expect(feedback?.speechDurationSec).toBeCloseTo(1.2, 1);
    });

    it('缺失的词保留在原句词序中，但不参与节奏计算', () => {
        const samples: number[] = [];
        fill(samples, 0.4, 6000);
        fill(samples, 0.4, 6000);
        const pcm = decodePcm16Wav(buildWav(samples));

        const feedback = buildRhythmFeedback({
            expectedText: 'hello brave world',
            transcript: 'hello world',
            tokens: tokensFor([
                { word: 'hello', start: 0, end: 0.4 },
                { word: 'world', start: 0.4, end: 0.8 },
            ]),
            pcm: pcm!,
        });

        expect(feedback?.words.map((word) => word.word)).toEqual(['hello', 'brave', 'world']);
        expect(feedback?.words.find((word) => word.word === 'brave')).toEqual({
            word: 'brave',
            durationSec: null,
            emphasis: null,
            stressed: false,
        });
    });

    it('语速明显偏快时给出 pace 与本地提示', () => {
        const samples: number[] = [];
        fill(samples, 0.12, 6000);
        fill(samples, 0.12, 6000);
        fill(samples, 0.12, 6000);
        fill(samples, 0.12, 6000);
        const pcm = decodePcm16Wav(buildWav(samples));

        const feedback = buildRhythmFeedback({
            expectedText: 'one two three four',
            transcript: 'one two three four',
            tokens: tokensFor([
                { word: 'one', start: 0, end: 0.12 },
                { word: 'two', start: 0.12, end: 0.24 },
                { word: 'three', start: 0.24, end: 0.36 },
                { word: 'four', start: 0.36, end: 0.48 },
            ]),
            pcm: pcm!,
            referenceDurationSec: 1.6,
        });

        expect(feedback?.pace).toBe('fast');
        expect(feedback?.notes).toContain('pace-fast');
    });

    it('没有时间轴或音频时返回 null', () => {
        const pcm = decodePcm16Wav(buildWav([100, -100]));
        expect(buildRhythmFeedback({
            expectedText: 'hello',
            transcript: 'hello',
            tokens: [],
            pcm: pcm!,
        })).toBeNull();
        expect(buildRhythmFeedback({
            expectedText: 'hello',
            transcript: 'hello',
            tokens: tokensFor([{ word: 'hello', start: 0, end: 0.2 }]),
            pcm: { samples: new Int16Array(), sampleRate: SAMPLE_RATE },
        })).toBeNull();
    });

    it('句子包含重复词时按出现次序各自对齐时段与能量，不被首个词吞并', () => {
        const samples: number[] = [];
        fill(samples, 0.25, 2000); // first 'go': quiet, 0.25s
        fill(samples, 0.25, 8000); // 'and': loud, 0.25s
        fill(samples, 0.45, 16000); // second 'go': loudest & longer, 0.45s
        const pcm = decodePcm16Wav(buildWav(samples));

        const feedback = buildRhythmFeedback({
            expectedText: 'go and go',
            transcript: 'go and go',
            tokens: tokensFor([
                { word: 'go', start: 0, end: 0.25 },
                { word: 'and', start: 0.25, end: 0.5 },
                { word: 'go', start: 0.5, end: 0.95 },
            ]),
            pcm: pcm!,
        });

        expect(feedback?.words).toHaveLength(3);
        expect(feedback?.words[0]?.durationSec).toBeCloseTo(0.25, 2);
        expect(feedback?.words[2]?.durationSec).toBeCloseTo(0.45, 2);
        expect(feedback?.words[2]?.emphasis ?? 0).toBeGreaterThan(feedback?.words[0]?.emphasis ?? 0);
    });

    it('传入 CTC 强制对齐时间轴时优先采用 CTC 时段而非启发式分词边界', () => {
        const samples: number[] = [];
        fill(samples, 0.5, 4000);
        const pcm = decodePcm16Wav(buildWav(samples));

        const feedback = buildRhythmFeedback({
            expectedText: 'bright morning',
            transcript: 'bright morning',
            tokens: tokensFor([
                { word: 'bright', start: 0, end: 0.1 },
                { word: 'morning', start: 0.1, end: 0.2 },
            ]),
            pcm: pcm!,
            ctcWordTimings: new Map([
                [0, { start: 0, end: 0.18 }],
                [1, { start: 0.18, end: 0.5 }],
            ]),
        });

        expect(feedback?.words[0]?.durationSec).toBeCloseTo(0.18, 2);
        expect(feedback?.words[1]?.durationSec).toBeCloseTo(0.32, 2);
    });

    it('全部词均已准确匹配时，句间停顿或快速朗读不会误报漏读/多读音节提示', () => {
        const samples: number[] = [];
        fill(samples, 2.8, 6000);
        const pcm = decodePcm16Wav(buildWav(samples));
        const lookupPhonetic = (word: string) =>
            word === 'tomorrow' ? '/təˈmɔːroʊ/' : word === 'morning' ? '/ˈmɔːrnɪŋ/' : null;

        const withPause = buildRhythmFeedback({
            expectedText: 'tomorrow morning',
            transcript: 'tomorrow morning',
            tokens: tokensFor([
                { word: 'tomorrow', start: 0, end: 0.3 },
                { word: 'morning', start: 2.5, end: 2.8 },
            ]),
            pcm: pcm!,
            lookupPhonetic,
        });

        const fastClean = buildRhythmFeedback({
            expectedText: 'tomorrow morning',
            transcript: 'tomorrow morning',
            tokens: tokensFor([
                { word: 'tomorrow', start: 0, end: 0.15 },
                { word: 'morning', start: 0.15, end: 0.3 },
            ]),
            pcm: pcm!,
            lookupPhonetic,
        });

        expect(withPause?.notes).not.toContain('syllables-more');
        expect(fastClean?.notes).not.toContain('syllables-fewer');
    });

    it('慢速朗读且仅含替换词时，不因时长更久而误报多余音节提示', () => {
        const samples: number[] = [];
        fill(samples, 4.0, 6000);
        const pcm = decodePcm16Wav(buildWav(samples));

        const feedback = buildRhythmFeedback({
            expectedText: 'go and say yes',
            transcript: 'go and see yes',
            tokens: tokensFor([
                { word: 'go', start: 0, end: 0.9 },
                { word: 'and', start: 0.9, end: 1.8 },
                { word: 'see', start: 1.8, end: 2.8 },
                { word: 'yes', start: 2.8, end: 3.8 },
            ]),
            pcm: pcm!,
            referenceDurationSec: 1.8,
        });

        expect(feedback?.notes).not.toContain('syllables-more');
    });
});
