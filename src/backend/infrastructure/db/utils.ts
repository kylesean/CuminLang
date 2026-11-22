import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from './createDb';

/**
 * SQLite 绑定参数保守分片上限。
 *
 * SQLite 默认 `SQLITE_MAX_VARIABLE_NUMBER` 为 32766；按 500 分批为多列查询与
 * 事务内写入留足安全余量，避免长字幕或大词库触发 `too many SQL variables`。
 */
export const SQLITE_MAX_BIND_PARAMS_CHUNK = 500;

/**
 * 将数组按固定批大小切片并逐批执行回调。
 */
export const inChunks = <T>(
    items: readonly T[],
    size: number,
    fn: (chunk: T[]) => void,
): void => {
    const step = Math.max(1, size);
    for (let index = 0; index < items.length; index += step) {
        fn(items.slice(index, index + step));
    }
};

/**
 * 按分片执行查询并收集拼接结果。
 */
export const collectInChunks = <T, R>(
    items: readonly T[],
    size: number,
    fn: (chunk: T[]) => R[],
): R[] => {
    const results: R[] = [];
    inChunks(items, size, (chunk) => {
        results.push(...fn(chunk));
    });
    return results;
};

interface SqliteConnectionLike {
    exec: (sql: string) => unknown;
    inTransaction: boolean;
}

const txDepthStorage = new AsyncLocalStorage<{ sqlite: SqliteConnectionLike; depth: number }>();
const txMutexQueues = new WeakMap<object, Promise<void>>();
let savepointCounter = 0;

/**
 * 在单个 SQLite 连接上串行化执行跨仓储事务边界。
 *
 * - 外层调用获取连接级异步互斥锁后开启 `BEGIN IMMEDIATE`，保证同库跨表写链路原子提交；
 * - 同一异步上下文内的嵌套调用自动降级为 `SAVEPOINT`；
 * - 若调用方未传入真实 `better-sqlite3` 连接（例如纯 Mock 仓储单测），则直接执行回调。
 */
export const runInDbTransaction = async <T>(
    db: Db | undefined,
    fn: () => Promise<T>,
): Promise<T> => {
    const sqlite = (db as { $client?: SqliteConnectionLike } | undefined)?.$client;
    if (!sqlite || typeof sqlite.exec !== 'function') {
        return fn();
    }

    const activeScope = txDepthStorage.getStore();
    if (activeScope && activeScope.sqlite === sqlite) {
        const sp = `cl_sp_${++savepointCounter}`;
        sqlite.exec(`SAVEPOINT ${sp}`);
        try {
            const result = await txDepthStorage.run({ sqlite, depth: activeScope.depth + 1 }, fn);
            sqlite.exec(`RELEASE SAVEPOINT ${sp}`);
            return result;
        } catch (error) {
            try {
                sqlite.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
                sqlite.exec(`RELEASE SAVEPOINT ${sp}`);
            } catch {
                // 外层事务回滚时保留原始异常
            }
            throw error;
        }
    }

    const prev = txMutexQueues.get(sqlite) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
        release = resolve;
    });
    txMutexQueues.set(sqlite, next);
    await prev;

    let startedOuter = false;
    let savepointName: string | null = null;
    try {
        if (sqlite.inTransaction) {
            savepointName = `cl_sp_${++savepointCounter}`;
            sqlite.exec(`SAVEPOINT ${savepointName}`);
        } else {
            sqlite.exec('BEGIN IMMEDIATE');
            startedOuter = true;
        }
        const result = await txDepthStorage.run({ sqlite, depth: 1 }, fn);
        if (savepointName) {
            sqlite.exec(`RELEASE SAVEPOINT ${savepointName}`);
        } else if (startedOuter) {
            sqlite.exec('COMMIT');
        }
        return result;
    } catch (error) {
        try {
            if (savepointName) {
                sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                sqlite.exec(`RELEASE SAVEPOINT ${savepointName}`);
            } else if (startedOuter && sqlite.inTransaction) {
                sqlite.exec('ROLLBACK');
            }
        } catch {
            // 保留原始业务异常
        }
        throw error;
    } finally {
        if (txMutexQueues.get(sqlite) === next) {
            txMutexQueues.delete(sqlite);
        }
        release();
    }
};
