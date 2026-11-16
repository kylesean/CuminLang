import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { createMemoryDb, type MemoryDb } from '@/test/database';
import { savedSentence } from '@/backend/infrastructure/db/tables/savedSentence';
import { sentenceStudyNote } from '@/backend/infrastructure/db/tables/sentenceStudyNote';
import { sentencePracticeRecord } from '@/backend/infrastructure/db/tables/sentencePracticeRecord';
import {
    SubtitleAssetMigrationServiceImpl,
    mapSentenceIndicesAcrossTracks,
} from '@/backend/services/SubtitleAssetMigrationService';
import type { SrtLine } from '@/common/utils/subtitle';

const line = (index: number, start: number, end: number, contentEn: string): SrtLine => ({
    index,
    start,
    end,
    contentEn,
    contentZh: '',
});

describe('SubtitleAssetMigrationService', () => {
    let memoryDb: MemoryDb;

    beforeEach(() => {
        memoryDb = createMemoryDb();
    });

    afterEach(() => {
        memoryDb?.close();
    });

    it('按词重合度与时间重合度把旧轨序号准确映射到新轨（即使中间插入了补全句子）', () => {
        const oldLines = [
            line(1, 0.5, 4.0, 'Welcome everyone to Carnegie Mellon.'),
            line(2, 4.2, 8.0, 'Thank you for this honor.'),
        ];
        const newLines = [
            line(1, 0.4, 3.5, 'Welcome everyone to Carnegie Mellon.'),
            line(2, 3.6, 4.8, 'I am thrilled to be here.'),
            line(3, 5.0, 7.8, 'Thank you for this extraordinary honor.'),
        ];

        const map = mapSentenceIndicesAcrossTracks(oldLines, newLines);
        expect(map.get(0)).toBe(0);
        expect(map.get(1)).toBe(2);
    });

    it('原子迁移收藏金句、精析笔记与练习记录到新 fileHash 与新句下标', async () => {
        const service = new SubtitleAssetMigrationServiceImpl(memoryDb.db);
        const oldHash = 'hash-old-v1';
        const newHash = 'hash-local-v2';

        memoryDb.db.insert(savedSentence).values({
            sentence_key: `${oldHash}:1`,
            video_id: 'video-1',
            file_hash: oldHash,
            sentence_index: 1,
            start_time: 4.2,
            end_time: 8.0,
            text: 'Thank you for this honor.',
            note: '好句收藏',
        }).run();

        memoryDb.db.insert(sentenceStudyNote).values({
            sentence_key: `${oldHash}:1`,
            video_id: 'video-1',
            file_hash: oldHash,
            sentence_index: 1,
            original_text: 'Thank you for this honor.',
            note_summary: '表达荣幸的经典开场',
        }).run();

        memoryDb.db.insert(sentencePracticeRecord).values({
            file_hash: oldHash,
            sentence_index: 1,
            mode: 'shadowing',
            score: 91,
        }).run();

        const oldLines = [
            line(1, 0.5, 4.0, 'Welcome everyone.'),
            line(2, 4.2, 8.0, 'Thank you for this honor.'),
        ];
        const newLines = [
            line(1, 0.4, 3.5, 'Welcome everyone.'),
            line(2, 3.6, 4.9, 'Missing section restored.'),
            line(3, 5.0, 7.8, 'Thank you for this extraordinary honor.'),
        ];

        const summary = await service.migrateTrackAssets({
            oldFileHash: oldHash,
            oldSentences: oldLines,
            newFileHash: newHash,
            newSentences: newLines,
        });

        expect(summary).toEqual({
            savedSentencesMoved: 1,
            studyNotesMoved: 1,
            practiceRecordsMoved: 1,
        });

        const [movedSaved] = memoryDb.db.select().from(savedSentence).where(eq(savedSentence.file_hash, newHash)).all();
        expect(movedSaved).toMatchObject({
            sentence_key: `${newHash}:2`,
            sentence_index: 2,
            start_time: 5.0,
            end_time: 7.8,
            text: 'Thank you for this extraordinary honor.',
            note: '好句收藏',
        });

        const [movedNote] = memoryDb.db.select().from(sentenceStudyNote).where(eq(sentenceStudyNote.file_hash, newHash)).all();
        expect(movedNote).toMatchObject({
            sentence_key: `${newHash}:2`,
            sentence_index: 2,
            note_summary: '表达荣幸的经典开场',
        });

        const [movedPractice] = memoryDb.db.select().from(sentencePracticeRecord).where(eq(sentencePracticeRecord.file_hash, newHash)).all();
        expect(movedPractice).toMatchObject({
            sentence_index: 2,
            score: 91,
        });
    });
});
