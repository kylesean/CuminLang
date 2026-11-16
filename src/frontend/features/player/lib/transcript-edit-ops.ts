import type { EditedSubtitleLineInput } from '@/common/contracts/subtitle-edit';
import type { Sentence } from '@/common/types/SentenceC';
import { syllableWeight } from '@/common/utils/subtitle/timed-word-segmenter';

const MIN_SPLIT_PART_SECONDS = 0.2;

/** 将当前播放器中的 `Sentence[]` 转换为可保存/撤销的标准 SRT 行快照。 */
export function toEditedSubtitleLines(sentences: readonly Sentence[]): EditedSubtitleLineInput[] {
    return sentences.map((sentence) => {
        const start = sentence.adjustedStart ?? sentence.start;
        const end = Math.max(sentence.adjustedEnd ?? sentence.end, start + 0.05);
        return {
            start,
            end,
            contentEn: sentence.text.trim(),
            ...(sentence.textZH ? { contentZh: sentence.textZH } : {}),
        };
    });
}

/** 替换指定索引句子的英文文本；未改变或为空白时返回 `null`。 */
export function replaceSentenceText(
    sentences: readonly Sentence[],
    targetIndex: number,
    nextText: string,
): EditedSubtitleLineInput[] | null {
    const pos = sentences.findIndex((item) => item.index === targetIndex);
    if (pos < 0) return null;
    const normalized = nextText.replace(/\s+/g, ' ').trim();
    if (!normalized || normalized === sentences[pos].text.trim()) {
        return null;
    }
    const next = toEditedSubtitleLines(sentences);
    next[pos] = { ...next[pos], contentEn: normalized };
    return next;
}

/**
 * 替换一段连续字幕行（如跨 cue 归并出的一整句话）为单条精校行；未变化或为空时返回 `null`。
 */
export function replaceSentenceRangeText(
    sentences: readonly Sentence[],
    startIndex: number,
    endIndex: number,
    nextText: string,
): EditedSubtitleLineInput[] | null {
    if (startIndex === endIndex) {
        return replaceSentenceText(sentences, startIndex, nextText);
    }
    const startPos = sentences.findIndex((item) => item.index === startIndex);
    const endPos = sentences.findIndex((item) => item.index === endIndex);
    if (startPos < 0 || endPos < startPos) {
        return null;
    }
    const normalized = nextText.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return null;
    }
    const slice = sentences.slice(startPos, endPos + 1);
    const combinedOriginal = slice.map((item) => item.text.trim()).filter(Boolean).join(' ');
    if (normalized === combinedOriginal) {
        return null;
    }
    const base = toEditedSubtitleLines(sentences);
    const mergedZh = slice.map((item) => item.textZH?.trim() || '').filter(Boolean).join(' ');
    const mergedLine: EditedSubtitleLineInput = {
        start: base[startPos].start,
        end: Math.max(base[endPos].end, base[startPos].start + 0.05),
        contentEn: normalized,
        ...(mergedZh ? { contentZh: mergedZh } : {}),
    };
    return [
        ...base.slice(0, startPos),
        mergedLine,
        ...base.slice(endPos + 1),
    ];
}

/**
 * 在光标偏移处把一句话拆成两句，并按左右音节权重比例切分时间轴。
 * 若光标两侧任一端为空白或总时长过短，返回 `null`。
 */
export function splitSentenceAtCursor(
    sentences: readonly Sentence[],
    targetIndex: number,
    draftText: string,
    cursorOffset: number,
): EditedSubtitleLineInput[] | null {
    const pos = sentences.findIndex((item) => item.index === targetIndex);
    if (pos < 0) return null;
    const clampedOffset = Math.max(0, Math.min(cursorOffset, draftText.length));
    const leftText = draftText.slice(0, clampedOffset).replace(/\s+/g, ' ').trim();
    const rightText = draftText.slice(clampedOffset).replace(/\s+/g, ' ').trim();
    if (!leftText || !rightText) {
        return null;
    }

    const base = toEditedSubtitleLines(sentences);
    const target = base[pos];
    const start = target.start;
    const end = Math.max(target.end, start + MIN_SPLIT_PART_SECONDS * 2);
    const duration = end - start;

    const leftWeight = leftText.split(/\s+/).reduce((acc, w) => acc + syllableWeight(w), 0);
    const rightWeight = rightText.split(/\s+/).reduce((acc, w) => acc + syllableWeight(w), 0);
    const ratio = leftWeight + rightWeight > 0 ? leftWeight / (leftWeight + rightWeight) : 0.5;
    const rawMid = start + duration * ratio;
    const mid = Math.min(
        Math.max(rawMid, start + MIN_SPLIT_PART_SECONDS),
        end - MIN_SPLIT_PART_SECONDS,
    );

    const firstLine: EditedSubtitleLineInput = {
        start,
        end: Number(mid.toFixed(3)),
        contentEn: leftText,
        ...(target.contentZh ? { contentZh: target.contentZh } : {}),
    };
    const secondLine: EditedSubtitleLineInput = {
        start: Number(mid.toFixed(3)),
        end,
        contentEn: rightText,
    };

    return [
        ...base.slice(0, pos),
        firstLine,
        secondLine,
        ...base.slice(pos + 1),
    ];
}

/**
 * 将指定句（可选用草稿文本）与下一句合并为一条完整意群句。
 */
export function mergeSentenceWithNext(
    sentences: readonly Sentence[],
    targetIndex: number,
    draftText?: string,
): EditedSubtitleLineInput[] | null {
    const pos = sentences.findIndex((item) => item.index === targetIndex);
    if (pos < 0 || pos + 1 >= sentences.length) {
        return null;
    }

    const base = toEditedSubtitleLines(sentences);
    const current = base[pos];
    const next = base[pos + 1];
    const currentText = (draftText ?? current.contentEn).replace(/\s+/g, ' ').trim();
    const nextText = next.contentEn.replace(/\s+/g, ' ').trim();
    const combinedEn = [currentText, nextText].filter(Boolean).join(' ');
    if (!combinedEn) {
        return null;
    }
    const combinedZh = [current.contentZh, next.contentZh].filter(Boolean).join(' ');

    const merged: EditedSubtitleLineInput = {
        start: current.start,
        end: Math.max(next.end, current.start + 0.1),
        contentEn: combinedEn,
        ...(combinedZh ? { contentZh: combinedZh } : {}),
    };

    return [
        ...base.slice(0, pos),
        merged,
        ...base.slice(pos + 2),
    ];
}
