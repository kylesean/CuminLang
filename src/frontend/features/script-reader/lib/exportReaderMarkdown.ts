import type { ReaderDocumentSummary, SavedSentenceTag, SavedSentenceVO } from '@/common/types/contextStudio';
import type { Sentence } from '@/common/types/SentenceC';
import TimeUtil from '@/common/utils/TimeUtil';
import type { SentenceBlock } from '@/frontend/features/player/lib/sentence-grouping';
import type { ScriptVocabPreviewItem } from './readerProgress';

const TAG_LABELS: Record<SavedSentenceTag, string> = {
    expression: '地道表达',
    pronunciation: '发音连读',
    grammar: '长难句',
    general: '批注',
};

export interface BuildReaderMarkdownParams {
    doc: ReaderDocumentSummary;
    paragraphs: readonly SentenceBlock[];
    translations: ReadonlyMap<string, string>;
    savedByKey: ReadonlyMap<string, SavedSentenceVO>;
    vocabSummary: readonly ScriptVocabPreviewItem[];
    includeTranslation: boolean;
}

/**
 * 将当前精读文稿（书卷自然段、可选双语译文、高频生词及个人批注金句）导出为干净的 Markdown 讲义。
 */
export function buildReaderMarkdown({
    doc,
    paragraphs,
    translations,
    savedByKey,
    vocabSummary,
    includeTranslation,
}: BuildReaderMarkdownParams): string {
    const lines: string[] = [];
    const mediaLabel = doc.mediaType === 'audio' ? '纯音频播客' : '视频文稿';
    const exportDate = new Date().toISOString().slice(0, 10);

    lines.push(`# ${doc.title}`);
    lines.push('');
    lines.push(`> 来源：${mediaLabel} · 导出日期：${exportDate}`);
    lines.push('');

    if (vocabSummary.length > 0) {
        lines.push('## 本篇高频生词');
        lines.push('');
        const vocabLine = vocabSummary
            .map((item) => (item.count > 1 ? `\`${item.word}\` (×${item.count})` : `\`${item.word}\``))
            .join(' · ');
        lines.push(vocabLine);
        lines.push('');
    }

    lines.push('## 正文精读与批注');
    lines.push('');

    for (const block of paragraphs) {
        if (block.sentences.length === 0) {
            continue;
        }

        const englishParagraph = block.sentences
            .map((s) => (s.text || '').trim())
            .filter(Boolean)
            .join(' ');
        if (englishParagraph) {
            lines.push(englishParagraph);
            lines.push('');
        }

        if (includeTranslation) {
            const zhParts = block.sentences
                .map((s) => resolveSentenceZh(s, translations))
                .filter(Boolean);
            if (zhParts.length > 0) {
                lines.push(zhParts.join(' '));
                lines.push('');
            }
        }

        const annotations = block.sentences
            .map((s) => {
                const record = savedByKey.get(`${s.fileHash}:${s.index}`);
                return record ? { sentence: s, record } : null;
            })
            .filter((item): item is { sentence: Sentence; record: SavedSentenceVO } => item !== null);

        if (annotations.length > 0) {
            for (const { sentence, record } of annotations) {
                const tagLabel = TAG_LABELS[record.tag] ?? TAG_LABELS.general;
                lines.push(`> **★ ${tagLabel}** · ${TimeUtil.secondToTimeStrCompact(sentence.adjustedStart ?? sentence.start)}`);
                lines.push(`> ${sentence.text}`);
                if (record.note.trim()) {
                    lines.push(`> — 笔记：${record.note.trim()}`);
                }
            }
            lines.push('');
        }
    }

    return lines.join('\n').trimEnd() + '\n';
}

function resolveSentenceZh(sentence: Sentence, translations: ReadonlyMap<string, string>): string {
    if (sentence.textZH && sentence.textZH.trim().length > 0) {
        return sentence.textZH.trim();
    }
    if (sentence.translationKey) {
        return translations.get(sentence.translationKey)?.trim() ?? '';
    }
    return '';
}
