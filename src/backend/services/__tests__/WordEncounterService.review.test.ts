import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { createMemoryDb, type MemoryDb } from '@/test/database';
import ReviewCardRepositoryImpl from '@/backend/infrastructure/db/repositories/ReviewCardRepositoryImpl';
import WordEncounterRepositoryImpl from '@/backend/infrastructure/db/repositories/WordEncounterRepositoryImpl';
import WordsRepositoryImpl from '@/backend/infrastructure/db/repositories/WordsRepositoryImpl';
import { wordEncounter } from '@/backend/infrastructure/db/tables/wordEncounter';
import { words as wordsTable } from '@/backend/infrastructure/db/tables/words';
import { WordEncounterServiceImpl } from '@/backend/services/WordEncounterService';

const DAY_MS = 24 * 60 * 60 * 1000;

const buildService = (memoryDb: MemoryDb) => {
    const words = new WordsRepositoryImpl(memoryDb.db);
    const encounters = new WordEncounterRepositoryImpl(memoryDb.db);
    const cards = new ReviewCardRepositoryImpl(memoryDb.db);
    const service = new WordEncounterServiceImpl(encounters, words, cards);
    return { service, words, encounters, cards };
};

describe('WordEncounterService 复习闭环', () => {
    let memoryDb: MemoryDb | null = null;

    afterEach(() => {
        memoryDb?.close();
        memoryDb = null;
    });

    it('收藏目标词后立即生成到期卡', async () => {
        memoryDb = createMemoryDb();
        const { service, words } = buildService(memoryDb);
        await words.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
            source: 'manual',
        });

        await service.record({ word: 'journey', action: 'save' });

        const queue = await service.getReviewQueue();
        expect(queue.dueCount).toBe(1);
        expect(queue.items).toHaveLength(1);
        expect(queue.items[0]).toMatchObject({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
        });
        expect(queue.items[0].schedule.state).toBe('new');
    });

    it('复习队列携带遇见该词的原句与句序号', async () => {
        memoryDb = createMemoryDb();
        const { service, words } = buildService(memoryDb);
        await words.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
            source: 'manual',
        });

        await service.record({
            word: 'journey',
            action: 'save',
            videoId: 'video-1',
            fileHash: 'subtitle-1',
            sentenceIndex: 4,
            sentenceHash: 'sentence-4',
            context: 'The journey changed everything.',
        });

        const queue = await service.getReviewQueue();
        expect(queue.items[0].context).toMatchObject({
            text: 'The journey changed everything.',
            videoId: 'video-1',
            sentenceIndex: 4,
            sentenceHash: 'sentence-4',
        });
    });

    it('跟读提高掌握度，但不改变复习排期', async () => {
        memoryDb = createMemoryDb();
        const { service, words, cards } = buildService(memoryDb);
        await words.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
            source: 'manual',
        });
        await service.record({ word: 'journey', action: 'save' });
        const beforeWord = await words.findByWord('journey');
        const beforeCard = await cards.findByWord('journey');
        expect(beforeCard).not.toBeNull();

        await service.record({
            word: 'journey',
            action: 'shadow',
            score: 96,
            fileHash: 'subtitle-1',
            sentenceIndex: 2,
            sentenceHash: 'sentence-2',
            context: 'The journey changed everything.',
        });

        const afterWord = await words.findByWord('journey');
        const afterCard = await cards.findByWord('journey');
        expect(afterWord?.mastery).toBeGreaterThan(beforeWord?.mastery ?? 0);
        expect(afterWord?.last_seen_at).not.toBeNull();
        expect(afterCard).toEqual(beforeCard);
    });

    it('跟读不会为目标词建卡', async () => {
        memoryDb = createMemoryDb();
        const { service, words, cards } = buildService(memoryDb);
        await words.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
            source: 'manual',
        });
        const beforeWord = await words.findByWord('journey');

        await service.record({ word: 'journey', action: 'shadow', score: 92 });

        expect(await cards.findByWord('journey')).toBeNull();
        const afterWord = await words.findByWord('journey');
        expect(afterWord?.mastery).toBeGreaterThan(beforeWord?.mastery ?? 0);
        expect((await service.getReviewQueue()).dueCount).toBe(0);
    });

    it('复习队列返回的掌握度按距上次遇见的时间衰减，数据库仍保留原始值', async () => {
        memoryDb = createMemoryDb();
        const { service, words: wordsRepository, cards } = buildService(memoryDb);
        await wordsRepository.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
            source: 'manual',
        });
        const lastSeen = new Date(Date.now() - 14 * DAY_MS).toISOString();
        await memoryDb.db.update(wordsTable)
            .set({ mastery: 0.8, confidence: 0.6, last_seen_at: lastSeen })
            .run();
        await cards.upsert({
            word: 'journey',
            due_at: new Date(Date.now() - DAY_MS).toISOString(),
            state: 'review',
            reps: 3,
            lapses: 0,
            stability: 4,
            difficulty: 5,
            last_review_at: null,
            last_rating: null,
        });

        const queue = await service.getReviewQueue();

        expect(queue.items).toHaveLength(1);
        expect(queue.items[0].mastery).toBeCloseTo(0.4, 1);
        const stored = await memoryDb.db.select().from(wordsTable).where(eq(wordsTable.word, 'journey'));
        expect(stored[0].mastery).toBe(0.8);
        expect(stored[0].confidence).toBe(0.6);
    });

    it('标记已掌握后删除复习卡', async () => {
        memoryDb = createMemoryDb();
        const { service, words, cards } = buildService(memoryDb);
        await words.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
            source: 'manual',
        });
        await service.record({ word: 'journey', action: 'save' });

        await service.record({ word: 'journey', action: 'known' });

        expect(await cards.findByWord('journey')).toBeNull();
        const row = await words.findByWord('journey');
        expect(row?.status).toBe('known');
        expect(row?.mastery).toBe(1);
        expect((await service.getReviewQueue()).dueCount).toBe(0);
    });

    it('到期队列只包含活跃且非默认词表的卡', async () => {
        memoryDb = createMemoryDb();
        const { service, words, cards } = buildService(memoryDb);
        await words.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
            source: 'manual',
        });
        await words.insertOne({
            word: 'orbit',
            translate: '轨道',
            status: 'familiar',
            source: 'manual',
        });
        await words.insertOne({
            word: 'the',
            translate: '这个',
            status: 'learning',
            source: 'default',
        });
        await words.insertOne({
            word: 'ignore',
            translate: '忽略',
            status: 'ignored',
            source: 'manual',
        });
        const past = new Date(Date.now() - DAY_MS).toISOString();
        for (const word of ['journey', 'orbit', 'the', 'ignore']) {
            await cards.upsert({
                word,
                due_at: past,
                state: 'new',
                reps: 0,
                lapses: 0,
                stability: 0,
                difficulty: 0,
                last_review_at: null,
                last_rating: null,
            });
        }

        const all = await service.getReviewQueue();
        expect(all.dueCount).toBe(2);
        expect(all.items.map((item) => item.word).sort()).toEqual(['journey', 'orbit']);

        const limited = await service.getReviewQueue(1);
        expect(limited.items).toHaveLength(1);
        expect(limited.dueCount).toBe(2);
    });

    it('复习反馈同步更新卡、词条、事件与 7/30 天统计', async () => {
        memoryDb = createMemoryDb();
        const { service, words } = buildService(memoryDb);
        await words.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'learning',
            source: 'manual',
        });
        await service.record({ word: 'journey', action: 'save' });
        const before = await words.findByWord('journey');
        const now = Date.now();

        const result = await service.rateReview({
            word: 'journey',
            rating: 'good',
            videoId: 'video-1',
            fileHash: 'subtitle-1',
        });

        expect(result.card.schedule).toMatchObject({
            state: 'learning',
            reps: 1,
            lastRating: 'good',
        });
        expect(Date.parse(result.card.schedule.dueAt)).toBeGreaterThan(now);
        const after = await words.findByWord('journey');
        expect(after?.mastery).toBeGreaterThan(before?.mastery ?? 0);
        expect(after?.last_seen_at).not.toBeNull();

        const reviewRows = await memoryDb.db
            .select()
            .from(wordEncounter)
            .where(eq(wordEncounter.action, 'review'));
        expect(reviewRows).toHaveLength(1);
        expect(reviewRows[0].rating).toBe('good');
        expect(reviewRows[0].video_id).toBe('video-1');
        expect(reviewRows[0].file_hash).toBe('subtitle-1');

        const firstStats = await service.getReviewQueue();
        expect(firstStats.stats.last7Days).toEqual({ reviewed: 1, retention: 1 });
        expect(firstStats.stats.last30Days).toEqual({ reviewed: 1, retention: 1 });

        await service.rateReview({ word: 'journey', rating: 'again' });
        const secondStats = await service.getReviewQueue();
        expect(secondStats.stats.last7Days).toEqual({ reviewed: 2, retention: 0.5 });
        expect(secondStats.stats.last30Days).toEqual({ reviewed: 2, retention: 0.5 });
    });

    it('不在学习状态的词不能提交复习反馈', async () => {
        memoryDb = createMemoryDb();
        const { service, words } = buildService(memoryDb);
        await words.insertOne({
            word: 'journey',
            translate: '旅程',
            status: 'known',
            source: 'manual',
        });

        await expect(service.rateReview({ word: 'journey', rating: 'good' }))
            .rejects.toThrow('不在复习队列');
    });

    it('targetWords 指定队列会过滤已掌握/忽略的词条', async () => {
        memoryDb = createMemoryDb();
        const { service, words } = buildService(memoryDb);
        await words.insertOne({ word: 'journey', translate: '旅程', status: 'learning', source: 'manual' });
        await words.insertOne({ word: 'orbit', translate: '轨道', status: 'known', source: 'manual' });

        const queue = await service.getReviewQueue(12, ['journey', 'orbit']);
        expect(queue.items.map((item) => item.word)).toEqual(['journey']);
    });

    it('复述/角色扮演正向产出支持词形还原，并将已到期复习卡隐式顺延', async () => {
        memoryDb = createMemoryDb();
        const { service, words, cards } = buildService(memoryDb);
        await words.insertOne({ word: 'figure out', translate: '弄明白', status: 'learning', source: 'manual' });
        await cards.upsert({
            word: 'figure out',
            due_at: new Date(Date.now() - DAY_MS).toISOString(),
            state: 'new',
            reps: 0,
            lapses: 0,
            stability: 0,
            difficulty: 0,
            last_review_at: null,
            last_rating: null,
        });

        await service.recordProductionEvidence({
            words: ['figured out'],
            score: 85,
            action: 'retell',
            videoId: 'video-1',
        });

        const updatedCard = await cards.findByWord('figure out');
        expect(updatedCard).not.toBeNull();
        expect(updatedCard!.reps).toBe(1);
        expect(updatedCard!.last_rating).toBe('good');
        expect(Date.parse(updatedCard!.due_at)).toBeGreaterThan(Date.now());
    });

    it('查词 (open) 不推高初始 mastery 为 0 的生词，也不刷新已有 last_seen_at 遗忘时钟', async () => {
        memoryDb = createMemoryDb();
        const { service, words } = buildService(memoryDb);
        await words.insertOne({ word: 'ephemeral', translate: '短暂的', status: 'learning', source: 'manual' });
        const oldLastSeen = new Date(Date.now() - 10 * DAY_MS).toISOString();
        await memoryDb.db.update(wordsTable)
            .set({ mastery: 0, confidence: 0.1, last_seen_at: oldLastSeen })
            .where(eq(wordsTable.word, 'ephemeral'))
            .run();

        await service.record({ word: 'ephemeral', action: 'open' });

        const updated = await words.findByWord('ephemeral');
        expect(updated?.mastery).toBe(0);
        expect(updated?.last_seen_at).toBe(oldLastSeen);
    });

    it('未到期的复习卡在重复听写时只更新掌握度，不提前滚动排期', async () => {
        memoryDb = createMemoryDb();
        const { service, words, cards } = buildService(memoryDb);
        await words.insertOne({ word: 'resilient', translate: '有韧性的', status: 'learning', source: 'manual' });
        const futureDueAt = new Date(Date.now() + 7 * DAY_MS).toISOString();
        await cards.upsert({
            word: 'resilient',
            due_at: futureDueAt,
            state: 'review',
            reps: 3,
            lapses: 0,
            stability: 7,
            difficulty: 5,
            last_review_at: new Date(Date.now() - DAY_MS).toISOString(),
            last_rating: 'good',
        });

        await service.record({ word: 'resilient', action: 'dictation', score: 95 });

        const afterWord = await words.findByWord('resilient');
        const afterCard = await cards.findByWord('resilient');
        expect(afterWord?.mastery).toBeGreaterThan(0);
        expect(afterCard?.stability).toBe(7);
        expect(afterCard?.reps).toBe(3);
        expect(afterCard?.due_at).toBe(futureDueAt);
    });

    it('通过词表直接导入的非原形词（如 findings）在复习队列中可正常评分推进而不报词条不存在', async () => {
        memoryDb = createMemoryDb();
        const { service, words, cards } = buildService(memoryDb);
        const past = new Date(Date.now() - DAY_MS).toISOString();
        await words.insertOne({ word: 'findings', translate: '调查发现', status: 'learning', source: 'imported' });
        await cards.ensureForWords(['findings'], past);

        const queue = await service.getReviewQueue();
        expect(queue.items.map((item) => item.word)).toContain('findings');

        const rated = await service.rateReview({ word: 'findings', rating: 'good' });
        expect(rated.card.word).toBe('findings');
        expect(rated.card.schedule.reps).toBe(1);
    });
});
