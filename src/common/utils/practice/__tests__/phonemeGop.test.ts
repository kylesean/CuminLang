import { describe, expect, it } from 'vitest';
import {
    ipaToPhonemeTokens,
    logSoftmaxFrames,
    scoreWordsWithCtcGop,
    trimSilentPcmEdges,
} from '@/common/utils/practice/phonemeGop';

const VOCAB: Record<string, number> = {
    '<pad>': 0,
    '<s>': 1,
    '</s>': 2,
    '<unk>': 3,
    'θ': 4,
    's': 5,
    'ɪ': 6,
    'ŋ': 7,
    'k': 8,
};

describe('phonemeGop', () => {
    it('ipaToPhonemeTokens 正确拆分 IPA 音标并过滤重音符号', () => {
        expect(ipaToPhonemeTokens('/ˈθɪŋk/', VOCAB)).toEqual(['θ', 'ɪ', 'ŋ', 'k']);
    });

    it('CTC 强制对齐与 GOP 准确区分清晰音素与偏音音素', () => {
        const numFrames = 8;
        const vocabSize = 9;
        const logits = new Float32Array(numFrames * vocabSize).fill(-4);
        // 期望词 think: θ ɪ ŋ k，但前两帧模型在 's'(5) 上后验远高于 'θ'(4)
        logits[0 * vocabSize + 5] = 4; // 错读成 s
        logits[1 * vocabSize + 5] = 4;
        logits[2 * vocabSize + 6] = 4; // ɪ
        logits[3 * vocabSize + 6] = 4;
        logits[4 * vocabSize + 7] = 4; // ŋ
        logits[5 * vocabSize + 7] = 4;
        logits[6 * vocabSize + 8] = 4; // k
        logits[7 * vocabSize + 8] = 4;

        const logProbs = logSoftmaxFrames(logits, numFrames, vocabSize);
        const outputs = scoreWordsWithCtcGop(logProbs, numFrames, vocabSize, VOCAB, [
            { wordIndex: 0, phonemes: ['θ', 'ɪ', 'ŋ', 'k'] },
        ]);

        expect(outputs).toHaveLength(1);
        const [wordOut] = outputs;
        expect(wordOut.phonemes[0].ipa).toBe('θ');
        expect(wordOut.phonemes[0].status).toBe('error');
        expect(wordOut.phonemes[0].heardIpa).toBe('s');
        expect(wordOut.phonemes[1].status).toBe('ok');
        expect(wordOut.phonemes[2].status).toBe('ok');
        expect(wordOut.phonemes[3].status).toBe('ok');
    });

    it.each([
        ["hwen", ['w', 'ɛ', 'n']],
        ["gou", ['ɡ', 'oʊ']],
        ["sei", ['s', 'eɪ']],
        ["ә'nælәdʒi", ['ə', 'n', 'æ', 'l', 'ə', 'dʒ', 'i']],
        ["ʌn'fɔ:tjjnәtli", ['ʌ', 'n', 'f', 'ɔː', 'tʃ', 'n', 'ə', 't', 'l', 'i']],
        ["ju:", ['ju']],
    ])('规范化 ECDict 音标 %s 为合法 espeak 音素序列', (rawIpa, expected) => {
        const espeakVocab: Record<string, number> = {
            '<pad>': 0,
            'w': 1, 'ɛ': 2, 'n': 3, 'ɡ': 4, 'oʊ': 5, 's': 6, 'eɪ': 7,
            'ə': 8, 'æ': 9, 'l': 10, 'dʒ': 11, 'i': 12, 'ʌ': 13, 'f': 14,
            'ɔː': 15, 'tʃ': 16, 't': 17, 'ju': 18, 'ː': 19, 'e': 20, 'o': 21, 'u': 22,
        };
        expect(ipaToPhonemeTokens(rawIpa, espeakVocab)).toEqual(expected);
    });

    it('trimSilentPcmEdges 裁剪首尾静音并准确记录时间偏移', () => {
        const sampleRate = 16000;
        const samples = new Int16Array(sampleRate * 3);
        // 第 1s~2s 为有效发音，首尾各有 1s 静音
        for (let i = sampleRate; i < sampleRate * 2; i += 1) {
            samples[i] = i % 2 === 0 ? 6000 : -6000;
        }
        const trimmed = trimSilentPcmEdges({ samples, sampleRate });
        expect(trimmed.offsetSec).toBeGreaterThan(0.8);
        expect(trimmed.offsetSec).toBeLessThan(1.0);
        expect(trimmed.pcm.samples.length).toBeLessThan(sampleRate * 1.5);
    });
});
