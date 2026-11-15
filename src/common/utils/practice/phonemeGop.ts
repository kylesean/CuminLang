import type { SentencePracticePhonemeResult } from '@/common/contracts/sentence-practice';
import type { PcmAudio } from '@/common/utils/practice/rhythmFeedback';

/**
 * 裁剪 16kHz PCM 首尾长时间静音，避免停顿拖偏 Wav2Vec2 归一化与 CTC 强制对齐窗口。
 */
export function trimSilentPcmEdges(pcm: PcmAudio): { pcm: PcmAudio; offsetSec: number } {
    const { samples, sampleRate } = pcm;
    const windowSize = Math.max(1, Math.round(sampleRate * 0.02));
    if (samples.length <= windowSize * 10 || sampleRate <= 0) {
        return { pcm, offsetSec: 0 };
    }

    const numWindows = Math.floor(samples.length / windowSize);
    const rmsList = new Float32Array(numWindows);
    let maxRms = 0;
    for (let w = 0; w < numWindows; w += 1) {
        const base = w * windowSize;
        let sumSq = 0;
        for (let i = 0; i < windowSize; i += 1) {
            const norm = samples[base + i] / 32768;
            sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / windowSize);
        rmsList[w] = rms;
        if (rms > maxRms) maxRms = rms;
    }

    const threshold = Math.max(0.008, maxRms * 0.06);
    let firstActive = -1;
    let lastActive = -1;
    for (let w = 0; w < numWindows; w += 1) {
        if (rmsList[w] >= threshold) {
            if (firstActive === -1) firstActive = w;
            lastActive = w;
        }
    }
    if (firstActive === -1) {
        return { pcm, offsetSec: 0 };
    }

    const padWindows = 5; // 首尾各保留 100ms 缓冲，避免切伤轻辅音起音/收尾
    const startWindow = Math.max(0, firstActive - padWindows);
    const endWindow = Math.min(numWindows, lastActive + 1 + padWindows);
    const startSample = startWindow * windowSize;
    const endSample = Math.min(samples.length, endWindow * windowSize);
    if (endSample - startSample < Math.round(sampleRate * 0.1)) {
        return { pcm, offsetSec: 0 };
    }
    if (startSample === 0 && endSample === samples.length) {
        return { pcm, offsetSec: 0 };
    }

    return {
        pcm: { samples: samples.subarray(startSample, endSample), sampleRate },
        offsetSec: Number((startSample / sampleRate).toFixed(3)),
    };
}

/**
 * 将 ECDict / 常见英式美式音标规范化并拆分为对齐 wav2vec2-espeak vocab.json 的 IPA 音素序列。
 */
export function ipaToPhonemeTokens(
    ipaRaw: string,
    vocab: Readonly<Record<string, number>>,
): string[] {
    if (!ipaRaw) return [];
    let cleaned = ipaRaw
        .trim()
        .replace(/^[/[]+|[/\]]+$/g, '')
        // 修复 ECDict 中常见的西里尔/拉丁 schwa 与 ASCII 冒号、非标准合字写法
        .replace(/\u04d9|\u01dd/g, 'ə')
        .replace(/:/g, 'ː')
        .replace(/tjj/g, 'tʃ')
        .replace(/t∫/g, 'tʃ')
        .replace(/\u0329|\u0361/g, '')
        .replace(/[ˈˌ'.,\s]/g, '')
        .replace(/g/g, 'ɡ')
        .replace(/r/g, 'ɹ')
        // ECDict 保守标音 hwen → wen / wɛn
        .replace(/^hw/u, 'w')
        // ECDict 常见 ASCII 双元音写法还原为标准 IPA
        .replace(/ei/g, 'eɪ')
        .replace(/ai/g, 'aɪ')
        .replace(/au/g, 'aʊ')
        .replace(/ɔi/g, 'ɔɪ')
        .replace(/[əo]u/g, 'oʊ')
        .replace(/iə/g, 'ɪə')
        .replace(/uə/g, 'ʊə');

    // ECDict 宽式短元音 e（非双元音 eɪ/eə 或长音 eː 的一部分）在 espeak 词表中对应 /ɛ/
    if (vocab['ɛ'] !== undefined) {
        cleaned = cleaned.replace(/e(?![ɪəː])/g, 'ɛ');
    }

    // 按长度降序匹配多字符音素（如 dʒ、tʃ、eɪ、aɪ、aʊ、oʊ、ɔɪ、iː、uː、ɑː、ɔː）；排除孤立长音符号 ː
    const keys = Object.keys(vocab)
        .filter((k) => !k.startsWith('<') && k !== 'ː')
        .sort((a, b) => b.length - a.length);

    // 仅在原串对应 token 不在 vocab 中时，按长度降序查兼容别名映射
    const aliasEntries: ReadonlyArray<readonly [string, string]> = [
        ['ɜː', 'ɜ'],
        ['ɜɹ', 'ɚ'],
        ['əɹ', 'ɚ'],
        ['ɔː', 'ɔ'],
        ['ɑː', 'ɑ'],
        ['iː', 'i'],
        ['uː', 'u'],
        ['eə', 'ɛ'],
        ['ɪə', 'ɪ'],
        ['ʊə', 'ʊ'],
        ['əʊ', 'oʊ'],
        ['dʒ', 'dʒ'],
    ];

    const result: string[] = [];
    let idx = 0;
    while (idx < cleaned.length) {
        let matched: string | null = null;
        for (const key of keys) {
            if (cleaned.startsWith(key, idx)) {
                matched = key;
                idx += key.length;
                break;
            }
        }
        if (matched) {
            result.push(matched);
            continue;
        }
        for (const [from, to] of aliasEntries) {
            if (cleaned.startsWith(from, idx) && vocab[to] !== undefined) {
                matched = to;
                idx += from.length;
                break;
            }
        }
        if (matched) {
            result.push(matched);
        } else {
            idx += 1;
        }
    }
    return result;
}

/**
 * 对数 Softmax（原地或新数组，按每帧 vocabSize 归一化）。
 */
export function logSoftmaxFrames(logits: Float32Array, numFrames: number, vocabSize: number): Float32Array {
    const out = new Float32Array(numFrames * vocabSize);
    for (let t = 0; t < numFrames; t += 1) {
        const offset = t * vocabSize;
        let maxVal = -Infinity;
        for (let v = 0; v < vocabSize; v += 1) {
            if (logits[offset + v] > maxVal) {
                maxVal = logits[offset + v];
            }
        }
        let sumExp = 0;
        for (let v = 0; v < vocabSize; v += 1) {
            sumExp += Math.exp(logits[offset + v] - maxVal);
        }
        const logNorm = maxVal + Math.log(Math.max(sumExp, 1e-12));
        for (let v = 0; v < vocabSize; v += 1) {
            out[offset + v] = logits[offset + v] - logNorm;
        }
    }
    return out;
}

export interface WordPhonemeTarget {
    wordIndex: number;
    phonemes: string[];
}

export interface WordPhonemeGopOutput {
    wordIndex: number;
    phonemeScore: number;
    phonemes: SentencePracticePhonemeResult[];
    /** 基于 CTC 对齐帧估算的词起止时间（秒，wav2vec2 20ms 步长）。 */
    startSec?: number;
    endSec?: number;
}

/**
 * 使用 Viterbi CTC 强制对齐 + GOP（Goodness of Pronunciation）对整句各词计算音素级得分。
 *
 * @param logProbs 形状 [numFrames, vocabSize] 的 log-softmax 矩阵。
 * @param numFrames 帧数 T。
 * @param vocabSize 词表大小 V。
 * @param vocab 音素 -> ID 映射。
 * @param wordTargets 每个词的目标音素序列。
 */
export function scoreWordsWithCtcGop(
    logProbs: Float32Array,
    numFrames: number,
    vocabSize: number,
    vocab: Readonly<Record<string, number>>,
    wordTargets: readonly WordPhonemeTarget[],
): WordPhonemeGopOutput[] {
    const blankId = vocab['<pad>'] ?? 0;
    const idToToken = new Map<number, string>();
    for (const [token, id] of Object.entries(vocab)) {
        idToToken.set(id, token);
    }

    const flatPhonemes: Array<{ wordIndex: number; ipa: string; id: number }> = [];
    for (const wt of wordTargets) {
        for (const ipa of wt.phonemes) {
            const id = vocab[ipa];
            if (id !== undefined && id !== blankId) {
                flatPhonemes.push({ wordIndex: wt.wordIndex, ipa, id });
            }
        }
    }

    const K = flatPhonemes.length;
    if (K === 0 || numFrames < K) {
        return [];
    }

    // 构造 CTC 扩展状态序列：[blank, p_0, blank, p_1, ..., p_{K-1}, blank]
    const L = 2 * K + 1;
    const states = new Int32Array(L);
    for (let s = 0; s < L; s += 1) {
        states[s] = s % 2 === 0 ? blankId : flatPhonemes[(s - 1) / 2].id;
    }

    const NEG_INF = -1e9;
    let prev = new Float64Array(L).fill(NEG_INF);
    let curr = new Float64Array(L).fill(NEG_INF);
    const backptr = new Int32Array(numFrames * L).fill(-1);

    prev[0] = logProbs[states[0]];
    if (L > 1) {
        prev[1] = logProbs[states[1]];
    }

    for (let t = 1; t < numFrames; t += 1) {
        curr.fill(NEG_INF);
        const frameOffset = t * vocabSize;
        for (let s = 0; s < L; s += 1) {
            let bestScore = prev[s];
            let bestPrev = s;

            if (s - 1 >= 0 && prev[s - 1] > bestScore) {
                bestScore = prev[s - 1];
                bestPrev = s - 1;
            }
            if (s - 2 >= 0 && states[s] !== blankId && states[s] !== states[s - 2] && prev[s - 2] > bestScore) {
                bestScore = prev[s - 2];
                bestPrev = s - 2;
            }

            if (bestScore > NEG_INF / 2) {
                curr[s] = bestScore + logProbs[frameOffset + states[s]];
                backptr[t * L + s] = bestPrev;
            }
        }
        const tmp = prev;
        prev = curr;
        curr = tmp;
    }

    let endState = L - 1;
    if (L >= 2 && prev[L - 2] > prev[L - 1]) {
        endState = L - 2;
    }
    if (prev[endState] <= NEG_INF / 2) {
        return [];
    }

    // 回溯每帧对应的状态索引
    const path = new Int32Array(numFrames);
    let s = endState;
    for (let t = numFrames - 1; t >= 0; t -= 1) {
        path[t] = s;
        if (t > 0) {
            const p = backptr[t * L + s];
            s = p >= 0 ? p : s;
        }
    }

    // 统计每个目标音素（奇数状态 2k + 1）对齐到的帧区间
    const frameBuckets: number[][] = Array.from({ length: K }, () => []);
    for (let t = 0; t < numFrames; t += 1) {
        const st = path[t];
        if (st % 2 === 1) {
            const k = (st - 1) / 2;
            frameBuckets[k].push(t);
        }
    }

    const frameRangesByWord = new Map<number, { minFrame: number; maxFrame: number }>();
    const byWord = new Map<number, SentencePracticePhonemeResult[]>();
    for (let k = 0; k < K; k += 1) {
        const item = flatPhonemes[k];
        const frames = frameBuckets[k];
        if (frames.length === 0) {
            const list = byWord.get(item.wordIndex) ?? [];
            list.push({ ipa: item.ipa, heardIpa: null, score: 35, status: 'error' });
            byWord.set(item.wordIndex, list);
            continue;
        }
        const prevRange = frameRangesByWord.get(item.wordIndex);
        const minF = frames[0];
        const maxF = frames[frames.length - 1];
        // 单个音素若跨过长时间静音停顿（超过 25 帧 ≈ 0.5s），只取末帧附近有效发声窗口
        const boundedMinF = maxF - minF > 25 ? Math.max(minF, maxF - 25) : minF;
        frameRangesByWord.set(item.wordIndex, {
            minFrame: prevRange ? Math.min(prevRange.minFrame, boundedMinF) : boundedMinF,
            maxFrame: prevRange ? Math.max(prevRange.maxFrame, maxF) : maxF,
        });

        let targetSum = 0;
        let bestOtherId = -1;
        let bestOtherMean = -Infinity;

        for (let v = 0; v < vocabSize; v += 1) {
            if (v === blankId || v === item.id) continue;
            const tok = idToToken.get(v);
            if (!tok || tok.startsWith('<')) continue;
            let sum = 0;
            for (const t of frames) {
                sum += logProbs[t * vocabSize + v];
            }
            const mean = sum / frames.length;
            if (mean > bestOtherMean) {
                bestOtherMean = mean;
                bestOtherId = v;
            }
        }
        for (const t of frames) {
            targetSum += logProbs[t * vocabSize + item.id];
        }
        const targetMean = targetSum / frames.length;
        const gopDiff = Number.isFinite(bestOtherMean) ? targetMean - bestOtherMean : 2;
        const score = Math.max(0, Math.min(100, Math.round(100 / (1 + Math.exp(-0.9 * (gopDiff + 1.8))))));
        const status: SentencePracticePhonemeResult['status'] = score >= 70
            ? 'ok'
            : score >= 45
                ? 'weak'
                : 'error';
        const heardIpa = status === 'ok'
            ? item.ipa
            : (idToToken.get(bestOtherId) ?? null);

        const list = byWord.get(item.wordIndex) ?? [];
        list.push({ ipa: item.ipa, heardIpa, score, status });
        byWord.set(item.wordIndex, list);
    }

    const FRAME_STEP_SEC = 0.02;
    const outputs: WordPhonemeGopOutput[] = [];
    for (const wt of wordTargets) {
        const phonemes = byWord.get(wt.wordIndex);
        if (!phonemes || phonemes.length === 0) continue;
        const avg = Math.round(phonemes.reduce((acc, p) => acc + p.score, 0) / phonemes.length);
        const frameRange = frameRangesByWord.get(wt.wordIndex);
        outputs.push({
            wordIndex: wt.wordIndex,
            phonemeScore: avg,
            phonemes,
            ...(frameRange
                ? {
                    startSec: Number((frameRange.minFrame * FRAME_STEP_SEC).toFixed(3)),
                    endSec: Number(((frameRange.maxFrame + 1) * FRAME_STEP_SEC).toFixed(3)),
                }
                : {}),
        });
    }
    return outputs;
}
