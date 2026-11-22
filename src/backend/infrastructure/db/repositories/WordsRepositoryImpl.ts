import { and, eq, inArray, like, ne, or, sql } from 'drizzle-orm';
import { inject, injectable } from 'inversify';

import type { Db } from '@/backend/infrastructure/db/createDb';
import { inChunks, SQLITE_MAX_BIND_PARAMS_CHUNK } from '@/backend/infrastructure/db/utils';
import { type InsertWord, type Word, words } from '@/backend/infrastructure/db/tables/words';
import TYPES from '@/backend/ioc/types';
import type WordsRepository from '@/backend/services/repositories/WordsRepository';
import {
    type GetAllWordsQuery,
    type WordContent,
    type WordLearningUpdate,
    type WordStateUpdate,
} from '@/backend/services/repositories/WordsRepository';
import { effectiveWordMastery } from '@/common/learning/mastery';

/**
 * 单词仓储实现。
 */
@injectable()
export default class WordsRepositoryImpl implements WordsRepository {
    /**
     * 初始化单词仓储实例。
     *
     * @param db 由依赖容器注入的数据库实例，测试中可替换为内存库。
     */
    constructor(@inject(TYPES.Database) private readonly db: Db) {}

    /**
     * 构建单词的精确匹配条件。
     *
     * 用 lower() 做大小写不敏感比较（SQLite 的 lower 仅作用于 ASCII，与原 LIKE 行为一致），
     * 避免单词中含 % / _ 时被 LIKE 当作通配符误匹配。
     *
     * @param word 单词。
     * @returns 精确匹配条件。
     */
    private wordEquals(word: string) {
        return eq(sql`lower(${words.word})`, word.toLowerCase());
    }

    public async getAll(query: GetAllWordsQuery = {}): Promise<Word[]> {
        const rows = await this.db
            .select()
            .from(words)
            .where(and(
                query.includeDefault ? undefined : ne(words.source, 'default'),
                query.search
                    ? or(
                        like(words.word, `%${query.search}%`),
                        like(words.translate, `%${query.search}%`),
                    )
                    : undefined,
            ));
        return rows.map((row) => this.withEffectiveMastery(row));
    }

    /**
     * 使用导入结果整体替换当前单词表。
     *
     * 行为说明：
     * - 该操作会先清空现有单词，再写入传入的完整结果集。
     * - 空数组表示清空单词表，而不是跳过。
     *
     * @param values 导入后的完整单词列表。
     */
    public async replaceAll(values: InsertWord[]): Promise<void> {
        // 每行最多绑定约 10 个参数，300 行远低于 SQLite 32766 变量上限。
        const chunkSize = 300;
        this.db.transaction((tx) => {
            // 保留已存在用户词条的学习状态与原始掌握度证据，仅更新释义并剔除未出现在导入表中的词条。
            const existingUserRows = new Map(
                tx
                    .select()
                    .from(words)
                    .where(ne(words.source, 'default'))
                    .all()
                    .map((row) => [row.word.toLowerCase(), row]),
            );
            tx.delete(words).where(ne(words.source, 'default')).run();
            if (values.length === 0) {
                return;
            }

            // 入参自身也可能存在仅大小写不同的重复词条，先按小写归一化去重（后写覆盖前写）。
            const dedupedValues = Array.from(
                new Map(values.map((item) => [item.word.toLowerCase(), item])).values(),
            );

            const mergedValues = dedupedValues.map((item) => {
                const existing = existingUserRows.get(item.word.toLowerCase());
                if (!existing) {
                    return item;
                }
                return {
                    ...item,
                    translate: item.translate ?? existing.translate,
                    status: existing.status,
                    source: existing.source,
                    mastery: item.mastery ?? existing.mastery,
                    confidence: item.confidence ?? existing.confidence,
                    last_seen_at: item.last_seen_at !== undefined ? item.last_seen_at : existing.last_seen_at,
                    mastered_at: item.mastered_at !== undefined ? item.mastered_at : existing.mastered_at,
                    created_at: existing.created_at,
                };
            });

            // 清理与本次导入词条仅大小写不同的残余内置默认词（如默认 'Latin' 与导入 'latin'），
            // 避免撞上 lower(word) 大小写不敏感唯一索引。
            const incomingLowerWords = mergedValues.map((item) => item.word.toLowerCase());
            inChunks(incomingLowerWords, SQLITE_MAX_BIND_PARAMS_CHUNK, (chunk) => {
                tx.delete(words).where(inArray(sql`lower(${words.word})`, chunk)).run();
            });

            for (let index = 0; index < mergedValues.length; index += chunkSize) {
                tx.insert(words)
                    .values(mergedValues.slice(index, index + chunkSize))
                    .onConflictDoUpdate({
                        target: words.word,
                        set: {
                            translate: sql`excluded.translate`,
                            status: sql`excluded.status`,
                            source: sql`excluded.source`,
                            mastery: sql`excluded.mastery`,
                            confidence: sql`excluded.confidence`,
                            last_seen_at: sql`excluded.last_seen_at`,
                            mastered_at: sql`excluded.mastered_at`,
                            updated_at: sql`excluded.updated_at`,
                        },
                    })
                    .run();
            }
        });
    }

    /**
     * 按单词查找记录；匹配不区分 ASCII 大小写。
     *
     * @param word 单词。
     * @returns 命中的记录；不存在时返回 null。
     */
    public async findByWord(word: string): Promise<Word | null> {
        const rows = await this.db
            .select()
            .from(words)
            .where(this.wordEquals(word))
            .limit(1);
        return rows[0] ? this.withEffectiveMastery(rows[0]) : null;
    }

    /**
     * 读取边界应用时间衰减；数据库里仍保存原始证据值，写入新证据时才更新。
     */
    private withEffectiveMastery(word: Word): Word {
        return { ...word, mastery: effectiveWordMastery(word) };
    }

    /**
     * 插入单个单词。
     *
     * @param value 单词与释义。
     */
    public async insertOne(value: WordContent): Promise<void> {
        const now = new Date().toISOString();
        this.db.insert(words)
            .values({
                word: value.word,
                translate: value.translate,
                status: value.status ?? 'learning',
                source: value.source ?? 'manual',
                created_at: now,
                updated_at: now,
            })
            .run();
    }

    /**
     * 更新单词学习状态。
     *
     * @param word 单词。
     * @param state 新状态与可选来源。
     */
    public async updateState(word: string, state: WordStateUpdate): Promise<void> {
        const now = new Date().toISOString();
        const patch: Partial<InsertWord> = {
            status: state.status,
            source: state.source,
            updated_at: now,
            mastered_at: state.status === 'known' ? now : null,
        };
        if (state.status === 'known') {
            patch.mastery = 1;
            patch.confidence = 1;
        } else if (state.status === 'learning' || state.status === 'familiar') {
            patch.mastery = 0;
            patch.confidence = 0;
        }
        this.db.update(words)
            .set(patch)
            .where(this.wordEquals(word))
            .run();
    }

    /**
     * 更新由学习证据驱动的记忆字段；未提供状态时保留用户当前裁决。
     *
     * @param word 单词。
     * @param update 掌握度、置信度、可选状态与最近遇见时间。
     */
    public async updateLearning(word: string, update: WordLearningUpdate): Promise<void> {
        const now = new Date().toISOString();
        const patch: Partial<InsertWord> = {
            mastery: update.mastery,
            confidence: update.confidence,
            updated_at: now,
        };
        if (update.lastSeenAt) {
            patch.last_seen_at = update.lastSeenAt;
        }
        if (update.status) {
            patch.status = update.status;
            patch.mastered_at = update.status === 'known' ? now : null;
        }
        this.db.update(words)
            .set(patch)
            .where(this.wordEquals(word))
            .run();
    }

    /**
     * 按旧单词定位记录并更新单词与释义。
     *
     * @param oldWord 更新前的单词。
     * @param value 更新后的单词与释义。
     */
    public async updateByWord(oldWord: string, value: WordContent): Promise<void> {
        this.db.update(words)
            .set({
                word: value.word,
                translate: value.translate,
                updated_at: new Date().toISOString(),
            })
            .where(this.wordEquals(oldWord))
            .run();
    }

    /**
     * 按单词删除记录。
     *
     * @param word 单词。
     */
    public async deleteByWord(word: string): Promise<void> {
        this.db.delete(words)
            .where(this.wordEquals(word))
            .run();
    }
}
