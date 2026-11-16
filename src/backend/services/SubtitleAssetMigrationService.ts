import { and, eq } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import type { Db } from '@/backend/infrastructure/db/createDb';
import { savedSentence } from '@/backend/infrastructure/db/tables/savedSentence';
import { sentenceStudyNote } from '@/backend/infrastructure/db/tables/sentenceStudyNote';
import { sentencePracticeRecord } from '@/backend/infrastructure/db/tables/sentencePracticeRecord';
import { getMainLogger } from '@/backend/infrastructure/logger';
import TYPES from '@/backend/ioc/types';
import type { SrtLine } from '@/common/utils/subtitle';

/** 字幕升级或编辑重保存时迁移的资产数量统计。 */
export interface SubtitleAssetMigrationSummary {
    savedSentencesMoved: number;
    studyNotesMoved: number;
    practiceRecordsMoved: number;
}

/** 候选句匹配的时间搜索缓冲（秒），兼容滚屏偏移。 */
const TIME_MATCH_TOLERANCE_SECONDS = 15;
const MIN_COMBINED_MATCH_SCORE = 0.30;

const toWordSet = (text: string): Set<string> => new Set(
    text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean),
);

const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection += 1;
    }
    return intersection / (a.size + b.size - intersection);
};

const timeOverlapRatio = (aStart: number, aEnd: number, bStart: number, bEnd: number): number => {
    const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
    const minDur = Math.max(0.2, Math.min(aEnd - aStart, bEnd - bStart));
    return Math.min(1, overlap / minDur);
};

/**
 * 为旧字幕的每条句下标（0-based）查找新字幕中最贴近的对应句下标（0-based）。
 *
 * 综合词集合 Jaccard 相似度（权重 0.7）与时间区间重叠率（权重 0.3）；
 * 若文本差异极小（如仅增删空格/标点）或时间高度重合均能准确锚定。
 */
export const mapSentenceIndicesAcrossTracks = (
    oldSentences: readonly SrtLine[],
    newSentences: readonly SrtLine[],
): Map<number, number> => {
    const mapping = new Map<number, number>();
    if (oldSentences.length === 0 || newSentences.length === 0) {
        return mapping;
    }

    const oldWordSets = oldSentences.map((line) => toWordSet(line.contentEn));
    const newWordSets = newSentences.map((line) => toWordSet(line.contentEn));

    for (let oldIdx = 0; oldIdx < oldSentences.length; oldIdx++) {
        const oldLine = oldSentences[oldIdx];
        const oldWords = oldWordSets[oldIdx];
        let bestNewIdx = -1;
        let bestScore = MIN_COMBINED_MATCH_SCORE;

        for (let newIdx = 0; newIdx < newSentences.length; newIdx++) {
            const newLine = newSentences[newIdx];
            if (
                newLine.end < oldLine.start - TIME_MATCH_TOLERANCE_SECONDS
                || newLine.start > oldLine.end + TIME_MATCH_TOLERANCE_SECONDS
            ) {
                continue;
            }
            const textScore = jaccardSimilarity(oldWords, newWordSets[newIdx]);
            const overlapScore = timeOverlapRatio(oldLine.start, oldLine.end, newLine.start, newLine.end);
            const combined = textScore * 0.7 + overlapScore * 0.3;
            if (combined > bestScore) {
                bestScore = combined;
                bestNewIdx = newIdx;
            }
        }

        if (bestNewIdx >= 0) {
            mapping.set(oldIdx, bestNewIdx);
        }
    }

    return mapping;
};

/**
 * 字幕升级或保存时的学习资产迁移服务。
 *
 * 当视频从 L1 原始轨自动升级到 `.local.srt`，或未来用户在右侧改写保存为 `.edited.srt` 时，
 * 将绑定在旧 `file_hash + sentence_index` 上的收藏金句、精析笔记与跟读/听写练习记录
 * 原子迁往新 `file_hash` 与重映射后的新句下标，避免学习沉淀丢失。
 */
export default interface SubtitleAssetMigrationService {
    migrateTrackAssets(params: {
        oldFileHash: string;
        oldSentences: readonly SrtLine[];
        newFileHash: string;
        newSentences: readonly SrtLine[];
    }): Promise<SubtitleAssetMigrationSummary>;
}

@injectable()
export class SubtitleAssetMigrationServiceImpl implements SubtitleAssetMigrationService {
    private readonly logger = getMainLogger('SubtitleAssetMigrationService');

    constructor(@inject(TYPES.Database) private readonly db: Db) {}

    public async migrateTrackAssets({
        oldFileHash,
        oldSentences,
        newFileHash,
        newSentences,
    }: {
        oldFileHash: string;
        oldSentences: readonly SrtLine[];
        newFileHash: string;
        newSentences: readonly SrtLine[];
    }): Promise<SubtitleAssetMigrationSummary> {
        if (!oldFileHash || !newFileHash || oldFileHash === newFileHash || newSentences.length === 0) {
            return { savedSentencesMoved: 0, studyNotesMoved: 0, practiceRecordsMoved: 0 };
        }

        const indexMap = mapSentenceIndicesAcrossTracks(oldSentences, newSentences);
        const fallbackNewIndex = (oldIdx: number): number => (
            indexMap.get(oldIdx) ?? Math.min(Math.max(0, oldIdx), newSentences.length - 1)
        );

        const summary = this.db.transaction((tx): SubtitleAssetMigrationSummary => {
            let savedSentencesMoved = 0;
            let studyNotesMoved = 0;
            let practiceRecordsMoved = 0;

            const existingSavedKeys = new Set(
                tx.select({ key: savedSentence.sentence_key })
                    .from(savedSentence)
                    .where(eq(savedSentence.file_hash, newFileHash))
                    .all()
                    .map((r) => r.key),
            );
            const oldSavedRows = tx.select()
                .from(savedSentence)
                .where(eq(savedSentence.file_hash, oldFileHash))
                .all();
            for (const row of oldSavedRows) {
                const targetIdx = fallbackNewIndex(row.sentence_index);
                const targetKey = `${newFileHash}:${targetIdx}`;
                if (existingSavedKeys.has(targetKey)) continue;
                const targetLine = newSentences[targetIdx];
                tx.update(savedSentence)
                    .set({
                        sentence_key: targetKey,
                        file_hash: newFileHash,
                        sentence_index: targetIdx,
                        start_time: targetLine.start,
                        end_time: targetLine.end,
                        text: targetLine.contentEn,
                    })
                    .where(eq(savedSentence.id, row.id))
                    .run();
                existingSavedKeys.add(targetKey);
                savedSentencesMoved += 1;
            }

            const existingNoteKeys = new Set(
                tx.select({ key: sentenceStudyNote.sentence_key })
                    .from(sentenceStudyNote)
                    .where(eq(sentenceStudyNote.file_hash, newFileHash))
                    .all()
                    .map((r) => r.key),
            );
            const oldNotes = tx.select()
                .from(sentenceStudyNote)
                .where(eq(sentenceStudyNote.file_hash, oldFileHash))
                .all();
            for (const row of oldNotes) {
                const targetIdx = fallbackNewIndex(row.sentence_index);
                const targetKey = `${newFileHash}:${targetIdx}`;
                if (existingNoteKeys.has(targetKey)) continue;
                const targetLine = newSentences[targetIdx];
                tx.update(sentenceStudyNote)
                    .set({
                        sentence_key: targetKey,
                        file_hash: newFileHash,
                        sentence_index: targetIdx,
                        original_text: targetLine.contentEn,
                    })
                    .where(eq(sentenceStudyNote.id, row.id))
                    .run();
                existingNoteKeys.add(targetKey);
                studyNotesMoved += 1;
            }

            const oldPracticeRows = tx.select({
                id: sentencePracticeRecord.id,
                sentence_index: sentencePracticeRecord.sentence_index,
            })
                .from(sentencePracticeRecord)
                .where(eq(sentencePracticeRecord.file_hash, oldFileHash))
                .all();
            for (const row of oldPracticeRows) {
                const targetIdx = fallbackNewIndex(row.sentence_index);
                tx.update(sentencePracticeRecord)
                    .set({
                        file_hash: newFileHash,
                        sentence_index: targetIdx,
                    })
                    .where(and(
                        eq(sentencePracticeRecord.id, row.id),
                        eq(sentencePracticeRecord.file_hash, oldFileHash),
                    ))
                    .run();
                practiceRecordsMoved += 1;
            }

            return { savedSentencesMoved, studyNotesMoved, practiceRecordsMoved };
        });

        if (summary.savedSentencesMoved + summary.studyNotesMoved + summary.practiceRecordsMoved > 0) {
            this.logger.info('migrated learning assets across subtitle tracks', {
                oldFileHash,
                newFileHash,
                ...summary,
            });
        }
        return summary;
    }
}
