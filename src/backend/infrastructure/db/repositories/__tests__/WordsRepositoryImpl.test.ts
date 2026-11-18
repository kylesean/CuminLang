import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import WordsRepositoryImpl from '@/backend/infrastructure/db/repositories/WordsRepositoryImpl';
import { words } from '@/backend/infrastructure/db/tables/words';
import { createMemoryDb, type MemoryDb } from '@/test/database';

describe('WordsRepositoryImpl.replaceAll', () => {
    let memoryDb: MemoryDb | null = null;

    afterEach(() => {
        memoryDb?.close();
        memoryDb = null;
    });

    it('支持导入超过 SQLite 单条变量上限的词表（5900 行）并保留未冲突的内置词条', async () => {
        memoryDb = createMemoryDb();
        const now = new Date().toISOString();

        // 预置两条内置默认词条：一条不会被导入覆盖，一条将被用户导入覆写
        memoryDb.db.insert(words).values([
            {
                word: 'the',
                translate: '这；那',
                status: 'ignored',
                source: 'default',
                created_at: now,
                updated_at: now,
            },
            {
                word: 'word_0',
                translate: '默认旧释义',
                status: 'ignored',
                source: 'default',
                created_at: now,
                updated_at: now,
            },
        ]).run();

        const repo = new WordsRepositoryImpl(memoryDb.db);
        const imported = Array.from({ length: 5900 }, (_, i) => ({
            word: `word_${i}`,
            translate: `释义_${i}`,
            status: 'learning' as const,
            source: 'imported' as const,
            created_at: now,
            updated_at: now,
        }));

        await repo.replaceAll(imported);

        const userWords = await repo.getAll();
        expect(userWords).toHaveLength(5900);

        // 未被导入覆盖的内置默认词条仍保留
        const defaultEntry = memoryDb.db.select().from(words).where(eq(words.word, 'the')).get();
        expect(defaultEntry?.source).toBe('default');

        // 与内置词条同形的导入词条成功覆写为用户导入词
        const overridden = memoryDb.db.select().from(words).where(eq(words.word, 'word_0')).get();
        expect(overridden?.source).toBe('imported');
        expect(overridden?.translate).toBe('释义_0');
    });
});
