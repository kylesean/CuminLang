/**
 * 启动迁移失败的进程内状态。
 *
 * 由 runStartupMigrations 在迁移抛错时写入，供恢复路由（migration-failure/*）
 * 读取并展示给用户；不持久化——重启后由「是否再次失败」重新决定。
 */
export interface MigrationFailureInfo {
    /** 失败阶段：目前固定为 'drizzle'（数据库 schema 初始化/迁移）。 */
    phase: 'drizzle';
    /** 原始错误信息，供用户复制反馈。 */
    errorMessage: string;
}

let failure: MigrationFailureInfo | null = null;

/** 记录本次启动的迁移失败信息（进程内，不持久化）。 */
export const setMigrationFailure = (info: MigrationFailureInfo): void => {
    failure = info;
};

/** 读取本次启动的迁移失败信息；迁移全部成功时为 null。 */
export const getMigrationFailure = (): MigrationFailureInfo | null => failure;
