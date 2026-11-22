import { afterEach, describe, expect, it } from 'vitest';

import { createMemoryDb, type MemoryDb } from '@/test/database';
import MediaSignalRepositoryImpl from '@/backend/infrastructure/db/repositories/MediaSignalRepositoryImpl';
import TopicVectorRepositoryImpl from '@/backend/infrastructure/db/repositories/TopicVectorRepositoryImpl';
import SentenceTranslatesRepositoryImpl from '@/backend/infrastructure/db/repositories/SentenceTranslatesRepositoryImpl';
import VideoLearningClipRepositoryImpl from '@/backend/infrastructure/db/repositories/VideoLearningClipRepositoryImpl';

describe('仓储超长列表分片查询（避免 SQLite 参数上限）', () => {
    let memoryDb: MemoryDb | null = null;

    afterEach(() => {
        memoryDb?.close();
        memoryDb = null;
    });

    it('MediaSignalRepository.pruneExcept 在超大分片列表下仅删除失效记录，不误删其它分片有效行', async () => {
        memoryDb = createMemoryDb();
        const repo = new MediaSignalRepositoryImpl(memoryDb.db);
        const activeIds = Array.from({ length: 1200 }, (_, i) => `video-${i}`);

        await repo.upsert({ videoId: 'video-0', kind: 'prosody', algorithmVersion: 1, inputHash: 'h0', payloadJson: '{}' });
        await repo.upsert({ videoId: 'video-1199', kind: 'prosody', algorithmVersion: 1, inputHash: 'h1', payloadJson: '{}' });
        await repo.upsert({ videoId: 'stale-video', kind: 'prosody', algorithmVersion: 1, inputHash: 'h2', payloadJson: '{}' });

        const deleted = await repo.pruneExcept(activeIds);

        expect(deleted).toBe(1);
        expect(await repo.find('video-0', 'prosody', 1)).not.toBeNull();
        expect(await repo.find('video-1199', 'prosody', 1)).not.toBeNull();
        expect(await repo.find('stale-video', 'prosody', 1)).toBeNull();
    });

    it('TopicVector / SentenceTranslates / VideoLearningClip 支持超过 1000 项的批量查询与分页', async () => {
        memoryDb = createMemoryDb();
        const topicRepo = new TopicVectorRepositoryImpl(memoryDb.db);
        const translateRepo = new SentenceTranslatesRepositoryImpl(memoryDb.db);
        const clipRepo = new VideoLearningClipRepositoryImpl(memoryDb.db);

        const ids = Array.from({ length: 1100 }, (_, i) => `k-${i}`);
        await topicRepo.upsert({
            videoId: 'k-1099',
            model: 'bge',
            dimension: 2,
            vector: Buffer.from(new Float32Array([0.1, 0.2]).buffer),
            textHash: 'th',
        });
        await translateRepo.upsert({ sentence: 'k-1099', translate: '译文', mode: 'openai' });
        await clipRepo.saveClipWithWords(
            {
                key: 'k-1099',
                video_name: 'demo.mp4',
                srt_clip: 'clip',
                srt_context: 'ctx',
                created_at: '2026-11-22T00:00:00Z',
                updated_at: '2026-11-22T00:00:00Z',
            },
            [],
        );

        const vectors = await topicRepo.listByVideoIds('bge', ids);
        const translates = await translateRepo.findBySentencesAndMode(ids, 'openai');
        const clipCount = await clipRepo.count({ keys: ids });
        const clipPage = await clipRepo.listPage({ keys: ids, offset: 0, limit: 10 });

        expect(vectors).toHaveLength(1);
        expect(translates).toHaveLength(1);
        expect(clipCount).toBe(1);
        expect(clipPage.map((c) => c.key)).toEqual(['k-1099']);
    });
});
