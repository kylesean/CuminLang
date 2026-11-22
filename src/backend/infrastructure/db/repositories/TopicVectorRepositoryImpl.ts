import { and, eq, inArray } from 'drizzle-orm';
import { inject, injectable } from 'inversify';

import type { Db } from '@/backend/infrastructure/db/createDb';
import { collectInChunks, inChunks, SQLITE_MAX_BIND_PARAMS_CHUNK } from '@/backend/infrastructure/db/utils';
import { topicVector, type TopicVectorRow } from '@/backend/infrastructure/db/tables/topicVector';
import TYPES from '@/backend/ioc/types';
import type TopicVectorRepository from '@/backend/services/repositories/TopicVectorRepository';
import type { TopicVectorWrite } from '@/backend/services/repositories/TopicVectorRepository';

/**
 * 主题向量索引 SQLite 仓储。
 */
@injectable()
export default class TopicVectorRepositoryImpl implements TopicVectorRepository {
    constructor(@inject(TYPES.Database) private readonly db: Db) {}

    public async listByModel(model: string): Promise<TopicVectorRow[]> {
        return this.db
            .select()
            .from(topicVector)
            .where(eq(topicVector.model, model));
    }

    public async listByVideoIds(model: string, videoIds: readonly string[]): Promise<TopicVectorRow[]> {
        if (videoIds.length === 0) {
            return [];
        }
        return collectInChunks(videoIds, SQLITE_MAX_BIND_PARAMS_CHUNK, (chunk) => this.db
            .select()
            .from(topicVector)
            .where(and(
                eq(topicVector.model, model),
                inArray(topicVector.video_id, chunk),
            ))
            .all());
    }

    public async upsert(value: TopicVectorWrite): Promise<void> {
        await this.upsertMany([value]);
    }

    public async upsertMany(values: readonly TopicVectorWrite[]): Promise<void> {
        if (values.length === 0) {
            return;
        }
        const now = new Date().toISOString();
        this.db.transaction((tx) => {
            for (const value of values) {
                tx.insert(topicVector)
                    .values({
                        video_id: value.videoId,
                        model: value.model,
                        dimension: value.dimension,
                        vector: value.vector,
                        text_hash: value.textHash,
                        created_at: now,
                        updated_at: now,
                    })
                    .onConflictDoUpdate({
                        target: [topicVector.video_id, topicVector.model],
                        set: {
                            dimension: value.dimension,
                            vector: value.vector,
                            text_hash: value.textHash,
                            updated_at: now,
                        },
                    })
                    .run();
            }
        });
    }

    public async deleteByModel(model: string): Promise<number> {
        const result = this.db.delete(topicVector).where(eq(topicVector.model, model)).run();
        return Number(result.changes);
    }

    public async deleteByVideoIds(videoIds: readonly string[]): Promise<number> {
        if (videoIds.length === 0) {
            return 0;
        }
        return this.db.transaction((tx) => {
            let deleted = 0;
            inChunks(videoIds, SQLITE_MAX_BIND_PARAMS_CHUNK, (chunk) => {
                const result = tx
                    .delete(topicVector)
                    .where(inArray(topicVector.video_id, chunk))
                    .run();
                deleted += Number(result.changes);
            });
            return deleted;
        });
    }
}
