import { describe, expect, it } from 'vitest';

import { reconcileAudioAndTextSubtitles } from '@/backend/utils/subtitle/AudioTextReconciler';
import type { SrtLine } from '@/common/utils/subtitle';
import type { TimedWord } from '@/common/utils/subtitle/timed-word-segmenter';

const asrWord = (text: string, start: number, end: number): TimedWord => ({ text, start, end });
const srtLine = (index: number, start: number, end: number, contentEn: string): SrtLine => ({
    index,
    start,
    end,
    contentEn,
    contentZh: '',
});

describe('音文对账与融合（reconcileAudioAndTextSubtitles）', () => {
    it('无外部参考字幕时，直接返回声学转写结果', () => {
        const asrWords = [asrWord('Hello', 0.5, 0.8), asrWord('world.', 0.85, 1.2)];
        const result = reconcileAudioAndTextSubtitles({
            asrWords,
            externalLines: [],
        });
        expect(result.mode).toBe('asr_only');
        expect(result.words.map((w) => w.text)).toEqual(['Hello', 'world.']);
    });

    it('完整高质量人工字幕（author）保留人工文本/标点，同时贴合音频词级精确时间轴', () => {
        // 外部人工字幕整体漂移了 +3 秒且第一条时间粗糙，但拼写与标点（如 "That’s"）精确。
        const externalLines = [
            srtLine(1, 3.8, 12.0, "Thank you everyone! That’s President Obama."),
        ];
        const asrWords = [
            asrWord('Thank', 0.4, 0.7),
            asrWord('you', 0.72, 0.9),
            asrWord('everyone.', 0.95, 1.4),
            asrWord("That's", 1.8, 2.1),
            asrWord('President', 2.15, 2.55),
            asrWord('Obama.', 2.6, 3.1),
        ];

        const result = reconcileAudioAndTextSubtitles({
            asrWords,
            externalLines,
            externalOrigin: 'author',
        });

        expect(result.mode).toBe('author_aligned');
        expect(result.coverage).toBeGreaterThanOrEqual(0.8);
        expect(result.words.map((w) => w.text)).toEqual([
            'Thank', 'you', 'everyone!', 'That’s', 'President', 'Obama.',
        ]);
        // 时间轴被音频侧锚定，不再停留在粗糙漂移的 3.8~12.0。
        expect(result.words[0].start).toBeCloseTo(0.4, 2);
        expect(result.words[result.words.length - 1].end).toBeCloseTo(3.1, 2);
    });

    it('外部作者轨缺失大段人声时切换为 asr_rescued，补全全部漏掉的正文', () => {
        // 音频中 5~20s 有一整段完整演讲（>=12 词且 >=8s），外部作者轨直接漏掉并拉跨成一句。
        const asrWords: TimedWord[] = [
            asrWord('Welcome', 0.5, 1.0),
            asrWord('everyone.', 1.05, 1.5),
            ...Array.from({ length: 14 }, (_, idx) => asrWord(`spoken${idx}`, 5 + idx * 0.9, 5.7 + idx * 0.9)),
            asrWord('Thank', 22.0, 22.3),
            asrWord('you.', 22.35, 22.8),
        ];
        const externalLines = [
            srtLine(1, 0.4, 20.0, 'Welcome everyone.'),
            srtLine(2, 21.8, 24.0, 'Thank you.'),
        ];

        const result = reconcileAudioAndTextSubtitles({
            asrWords,
            externalLines,
            externalOrigin: 'author',
        });

        expect(result.mode).toBe('asr_rescued');
        expect(result.words).toHaveLength(asrWords.length);
        expect(result.words.some((w) => w.text === 'spoken0')).toBe(true);
    });

    it('外部轨为 auto_asr 时走 asr_rescued：保留声学纠错词（NVIDIA），同时抢救相似人名拼写（Jahanian）', () => {
        const asrWords = [
            asrWord('President', 0.6, 1.1),
            asrWord('Johanyan,', 1.15, 1.7),
            asrWord('we', 1.8, 2.0),
            asrWord('run', 2.05, 2.3),
            asrWord('NVIDIA.', 2.35, 2.9),
        ];
        const externalLines = [
            srtLine(1, 0.5, 4.5, 'President Jahanian, we run a video >> [applause]'),
        ];

        const result = reconcileAudioAndTextSubtitles({
            asrWords,
            externalLines,
            externalOrigin: 'auto_asr',
        });

        expect(result.mode).toBe('asr_rescued');
        expect(result.rescuedProperNounCount).toBe(1);
        expect(result.words.map((w) => w.text)).toEqual([
            'President',
            'Jahanian,',
            'we',
            'run',
            'NVIDIA.',
        ]);
    });

    it('外部作者轨仅在句间漏掉少数几句（覆盖率仍高于 80%）时，在 author_aligned 模式下原位缝合补回缺失 ASR 语音', () => {
        const externalLines = [
            srtLine(1, 225.0, 238.5, 'Every year we gather in this hall to celebrate engineering craft and curiosity.'),
            srtLine(2, 239.0, 241.0, 'An older woman.'),
            srtLine(3, 278.0, 283.0, 'We wanted to build a new kind of computer, something gentle for everyone.'),
        ];
        const prefixText = 'Every year we gather in this hall to celebrate engineering craft and curiosity.';
        const prefixWords: TimedWord[] = prefixText.split(/\s+/).map((w, idx) =>
            asrWord(w, 225.1 + idx * 0.4, 225.4 + idx * 0.4),
        );
        const asrWords: TimedWord[] = [
            ...prefixWords,
            asrWord('An', 239.1, 239.4),
            asrWord('older', 239.45, 239.8),
            asrWord('woman.', 239.85, 240.3),
            // 外部字幕在 241~278s 间漏了一句 6 词短句（< 8 词阈值，覆盖率 > 80%）
            asrWord('She', 250.0, 250.3),
            asrWord('looked', 250.35, 250.7),
            asrWord('right', 250.75, 251.0),
            asrWord('at', 251.05, 251.2),
            asrWord('our', 251.25, 251.5),
            asrWord('team.', 251.55, 252.0),
            asrWord('We', 278.0, 278.2),
            asrWord('wanted', 278.25, 278.6),
            asrWord('to', 278.65, 278.8),
            asrWord('build', 278.85, 279.1),
            asrWord('a', 279.15, 279.25),
            asrWord('new', 279.3, 279.5),
            asrWord('kind', 279.55, 279.8),
            asrWord('of', 279.85, 280.0),
            asrWord('computer,', 280.05, 280.6),
            asrWord('something', 280.7, 281.2),
            asrWord('gentle', 281.25, 281.7),
            asrWord('for', 281.75, 282.0),
            asrWord('everyone.', 282.05, 282.7),
        ];

        const result = reconcileAudioAndTextSubtitles({
            asrWords,
            externalLines,
            externalOrigin: 'author',
        });

        expect(result.mode).toBe('author_aligned');
        const texts = result.words.map((w) => w.text);
        expect(texts.slice(prefixWords.length)).toEqual([
            'An', 'older', 'woman.',
            'She', 'looked', 'right', 'at', 'our', 'team.',
            'We', 'wanted', 'to', 'build', 'a', 'new', 'kind', 'of', 'computer,',
            'something', 'gentle', 'for', 'everyone.',
        ]);
        const sheWord = result.words.find((w) => w.text === 'She');
        expect(sheWord?.start).toBeCloseTo(250.0, 2);
    });
});
