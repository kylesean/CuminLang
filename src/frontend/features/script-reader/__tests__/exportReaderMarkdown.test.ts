import { describe, it, expect } from 'vitest';
import { buildReaderMarkdown } from '../lib/exportReaderMarkdown';
import type { ReaderDocumentSummary, SavedSentenceVO } from '@/common/types/contextStudio';
import type { Sentence } from '@/common/types/SentenceC';

const makeSentence = (index: number, text: string, textZH: string, start: number): Sentence => ({
    fileHash: 'h-md',
    index,
    start,
    end: start + 3,
    adjustedStart: null,
    adjustedEnd: null,
    text,
    textZH,
    key: `k-${index}`,
    transGroup: 1,
    translationKey: `h-md:${index}`,
    struct: { original: '', blocks: [] },
});

const makeBlock = (sentence: Sentence) => ({
    sentences: [sentence],
    start: sentence.start,
    end: sentence.end,
    charCount: sentence.text.length,
    repr: sentence,
});

describe('buildReaderMarkdown', () => {
    it('exports header, vocabulary radar, bilingual paragraphs, and annotated blockquotes cleanly', () => {
        const doc: ReaderDocumentSummary = {
            videoId: 'aud-1',
            title: 'Huberman Focus Podcast',
            srtFile: '/audio/focus.local.srt',
            videoPath: '/audio/focus.mp3',
            updatedAt: '2026-11-17T00:00:00Z',
            mediaType: 'audio',
            hasSubtitle: true,
        };
        const s0 = makeSentence(0, 'Focus requires effort.', '专注需要努力。', 5);
        const s1 = makeSentence(1, 'Dopamine drives pursuit.', '多巴胺驱动追求。', 65);
        const savedByKey = new Map<string, SavedSentenceVO>([
            [
                'h-md:1',
                {
                    id: 10,
                    sentenceKey: 'h-md:1',
                    videoId: 'aud-1',
                    videoTitle: 'Huberman Focus Podcast',
                    fileHash: 'h-md',
                    sentenceIndex: 1,
                    startTime: 65,
                    endTime: 68,
                    text: 'Dopamine drives pursuit.',
                    textZh: '多巴胺驱动追求。',
                    note: '注意 pursuit 的发音与搭配',
                    tag: 'expression',
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        ]);

        const md = buildReaderMarkdown({
            doc,
            paragraphs: [
                makeBlock(s0),
                makeBlock(s1),
            ],
            translations: new Map(),
            savedByKey,
            vocabSummary: [{ word: 'pursuit', count: 2, firstSentenceIndex: 1 }],
            includeTranslation: true,
        });

        expect(md).toContain('# Huberman Focus Podcast');
        expect(md).toContain('来源：纯音频播客');
        expect(md).toContain('`pursuit` (×2)');
        expect(md).toContain('Focus requires effort.\n\n专注需要努力。');
        expect(md).toContain('> **★ 地道表达** · 01:05');
        expect(md).toContain('> — 笔记：注意 pursuit 的发音与搭配');
    });

    it('omits Chinese paragraphs when includeTranslation is false', () => {
        const doc: ReaderDocumentSummary = {
            videoId: 'vid-1',
            title: 'English Only Talk',
            srtFile: '/videos/talk.srt',
            videoPath: '/videos/talk.mp4',
            updatedAt: '2026-11-17T00:00:00Z',
            mediaType: 'video',
            hasSubtitle: true,
        };
        const s0 = makeSentence(0, 'Keep going forward.', '继续前进。', 1);

        const md = buildReaderMarkdown({
            doc,
            paragraphs: [makeBlock(s0)],
            translations: new Map(),
            savedByKey: new Map(),
            vocabSummary: [],
            includeTranslation: false,
        });

        expect(md).toContain('Keep going forward.');
        expect(md).not.toContain('继续前进。');
    });
});
