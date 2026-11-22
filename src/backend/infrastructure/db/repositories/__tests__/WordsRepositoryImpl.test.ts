import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

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

    it('重新导入词表时保留已存在用户词条的学习状态与原始掌握度，仅更新释义', async () => {
        memoryDb = createMemoryDb();
        const past = '2026-11-10T00:00:00.000Z';
        const now = '2026-11-19T00:00:00.000Z';

        memoryDb.db.insert(words).values([
            {
                word: 'orbit',
                translate: '旧释义',
                status: 'known',
                source: 'manual',
                mastery: 0.92,
                confidence: 0.85,
                last_seen_at: past,
                mastered_at: past,
                created_at: past,
                updated_at: past,
            },
        ]).run();

        const repo = new WordsRepositoryImpl(memoryDb.db);
        await repo.replaceAll([
            {
                word: 'orbit',
                translate: '新释义：轨道',
                status: 'learning',
                source: 'imported',
                created_at: now,
                updated_at: now,
            },
        ]);

        const stored = memoryDb.db.select().from(words).where(eq(words.word, 'orbit')).get();
        expect(stored).toMatchObject({
            word: 'orbit',
            translate: '新释义：轨道',
            status: 'known',
            source: 'manual',
            mastery: 0.92,
            confidence: 0.85,
            last_seen_at: past,
            mastered_at: past,
            created_at: past,
        });
    });

    it('replaceAll 遇到仅大小写不同的内置默认词（如 Latin vs latin）时不会产生双行或约束冲突', async () => {
        memoryDb = createMemoryDb();
        const now = new Date().toISOString();
        memoryDb.db.insert(words).values([
            {
                word: 'Latin',
                translate: '拉丁语',
                status: 'ignored',
                source: 'default',
                created_at: now,
                updated_at: now,
            },
        ]).run();

        const repo = new WordsRepositoryImpl(memoryDb.db);
        await repo.replaceAll([
            {
                word: 'latin',
                translate: '拉丁的',
                status: 'learning',
                source: 'imported',
                created_at: now,
                updated_at: now,
            },
        ]);

        const all = memoryDb.db.select().from(words).where(eq(sql`lower(${words.word})`, 'latin')).all();
        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({ word: 'latin', translate: '拉丁的', source: 'imported' });
    });

    it('0001 迁移会合并存量大小写重复词行并建立大小写不敏感唯一索引', () => {
        const sqlite = new Database(':memory:');
        try {
            const migrationsDir = path.resolve(process.cwd(), 'drizzle', 'migrations');
            const sql0 = fs.readFileSync(path.join(migrationsDir, '0000_initial_schema.sql'), 'utf8');
            const sql1 = fs.readFileSync(path.join(migrationsDir, '0001_words_case_insensitive_unique.sql'), 'utf8');
            for (const stmt of sql0.split('--> statement-breakpoint')) {
                if (stmt.trim()) sqlite.exec(stmt);
            }

            sqlite.prepare(`
                INSERT INTO dp_words (word, translate, status, source, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run('Latin', '拉丁语', 'ignored', 'default', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            sqlite.prepare(`
                INSERT INTO dp_words (word, translate, status, source, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run('latin', null, 'learning', 'manual', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');

            for (const stmt of sql1.split('--> statement-breakpoint')) {
                if (stmt.trim()) sqlite.exec(stmt);
            }

            const db = drizzle(sqlite);
            const rows = db.select().from(words).where(eq(sql`lower(${words.word})`, 'latin')).all();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                word: 'latin',
                translate: '拉丁语',
                status: 'learning',
                source: 'manual',
            });

            expect(() => {
                sqlite.prepare(`
                    INSERT INTO dp_words (word, translate, status, source)
                    VALUES ('LATIN', '重复', 'ignored', 'default')
                `).run();
            }).toThrow(/UNIQUE constraint failed/);
        } finally {
            sqlite.close();
        }
    });
});
