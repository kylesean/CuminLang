import { and, eq, inArray } from 'drizzle-orm';
import { inject, injectable } from 'inversify';

import type { Db } from '@/backend/infrastructure/db/createDb';
import { inChunks, SQLITE_MAX_BIND_PARAMS_CHUNK } from '@/backend/infrastructure/db/utils';
import { mediaSignal, type MediaSignalRow } from '@/backend/infrastructure/db/tables/mediaSignal';
import TYPES from '@/backend/ioc/types';
import type MediaSignalRepository from '@/backend/services/repositories/MediaSignalRepository';

/**
 * 视频级派生信号 SQLite 仓储。
 */
@injectable()
export default class MediaSignalRepositoryImpl implements MediaSignalRepository {
    constructor(@inject(TYPES.Database) private readonly db: Db) {}

    public async find(videoId: string, kind: string, algorithmVersion: number): Promise<MediaSignalRow | null> {
        const rows = await this.db
            .select()
            .from(mediaSignal)
            .where(and(
                eq(mediaSignal.video_id, videoId),
                eq(mediaSignal.kind, kind),
                eq(mediaSignal.algorithm_version, algorithmVersion),
            ))
            .limit(1);
        return rows[0] ?? null;
    }

    public async upsert(value: {
        videoId: string;
        kind: string;
        algorithmVersion: number;
        inputHash: string;
        payloadJson: string;
    }): Promise<void> {
        const now = new Date().toISOString();
        this.db.insert(mediaSignal)
            .values({
                video_id: value.videoId,
                kind: value.kind,
                algorithm_version: value.algorithmVersion,
                input_hash: value.inputHash,
                payload_json: value.payloadJson,
                created_at: now,
                updated_at: now,
            })
            .onConflictDoUpdate({
                target: [mediaSignal.video_id, mediaSignal.kind, mediaSignal.algorithm_version],
                set: {
                    input_hash: value.inputHash,
                    payload_json: value.payloadJson,
                    updated_at: now,
                },
            })
            .run();
    }

    public async deleteByVideo(videoId: string): Promise<number> {
        const result = this.db.delete(mediaSignal).where(eq(mediaSignal.video_id, videoId)).run();
        return Number(result.changes);
    }

    public async pruneExcept(activeVideoIds: readonly string[]): Promise<number> {
        // 空集合意味着「当前没有任何视频」，此时清空整表是正确语义；
        // 但不能用 notInArray —— 超长列表会撞 SQLite 32766 参数上限，而按片循环 NOT IN 会误删其它分片有效行。
        return this.db.transaction((tx) => {
            if (activeVideoIds.length === 0) {
                const result = tx.delete(mediaSignal).run();
                return Number(result.changes);
            }
            const activeSet = new Set(activeVideoIds);
            const staleVideoIds = tx
                .selectDistinct({ videoId: mediaSignal.video_id })
                .from(mediaSignal)
                .all()
                .map((row) => row.videoId)
                .filter((id) => !activeSet.has(id));
            if (staleVideoIds.length === 0) {
                return 0;
            }
            let deleted = 0;
            inChunks(staleVideoIds, SQLITE_MAX_BIND_PARAMS_CHUNK, (chunk) => {
                const result = tx
                    .delete(mediaSignal)
                    .where(inArray(mediaSignal.video_id, chunk))
                    .run();
                deleted += Number(result.changes);
            });
            return deleted;
        });
    }
}
