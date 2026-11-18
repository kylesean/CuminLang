import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
    assertFileProtocolEntry,
    buildCleanElectronEnv,
    buildElectronLaunchArgs,
    createIsolatedUserDataDir,
    finalizeTestSessions,
    passOnboardingGate,
    readJsonConfigValue,
    startManagedSession,
    type BaseAppSession,
    type ManagedSessionHandle,
} from './electron-session';
import { readPackagedApp } from './packaged-app';

/** 打包态配置文件：app.isPackaged=true 时没有 .dev 后缀。 */
const CONFIG_FILE_NAME = 'config.json';
const LOGS_SUBDIR = 'logs';
const LAUNCH_TIMEOUT_MS = 120_000;
const ENTRY_TIMEOUT_MS = 15_000;

/** 打包应用会话。 */
export type PackagedSession = BaseAppSession;

/** 读取打包态配置值（用于断言真实写盘，而非预置假文件）。 */
export function readPackagedConfigValue(userDataDir: string, key: string): unknown {
    return readJsonConfigValue(userDataDir, CONFIG_FILE_NAME, key);
}

/**
 * 启动打包应用。
 *
 * @param userDataDir 隔离的 userData 目录。
 * @returns 打包应用会话句柄。
 */
async function launchManagedPackagedSession(
    sessionIndex: number,
    userDataDir: string,
): Promise<ManagedSessionHandle> {
    const packaged = readPackagedApp();
    return startManagedSession(sessionIndex, {
        launchOptions: {
            executablePath: packaged.executablePath,
            args: buildElectronLaunchArgs(userDataDir),
            // 故意注入 NODE_ENV=development：打包应用仍必须走 data/、logs/、config.json
            env: buildCleanElectronEnv({ NODE_ENV: 'development' }),
            timeout: LAUNCH_TIMEOUT_MS,
        },
        describeLaunchFailure: (error) =>
            new Error(
                `打包应用启动失败或超时（${packaged.executablePath}）。`
                + '确认使用 QA 打包配置（EnableNodeCliInspectArguments=true），且产物与当前平台匹配。',
                { cause: error },
            ),
        afterFirstWindow: async (page: Page) => {
            await assertFileProtocolEntry(
                page,
                ENTRY_TIMEOUT_MS,
                (currentUrl) => `打包应用没有加载本地 file: 入口，当前 URL：${currentUrl}`,
            );

            // app.isPackaged=true 时数据库落在 data/，配置落在 config.json；
            // 若 NODE_ENV 仍能解锁 dev 环境，这两个断言会直接指出污染路径。
            await expect.poll(
                () => fs.existsSync(path.join(userDataDir, 'data', 'dp_db.sqlite3')),
                { timeout: 15_000 },
            ).toBe(true);
            if (fs.existsSync(path.join(userDataDir, 'data-dev'))) {
                throw new Error('打包应用创建了 data-dev：NODE_ENV 仍在影响运行环境判定');
            }
            if (fs.existsSync(path.join(userDataDir, 'config.dev.json'))) {
                throw new Error('打包应用创建了 config.dev.json：NODE_ENV 仍在影响运行环境判定');
            }

            await passOnboardingGate(page);
        },
    });
}

/** 启动一次打包应用会话。 */
export async function launchPackagedSession(userDataDir: string): Promise<PackagedSession> {
    const handle = await launchManagedPackagedSession(1, userDataDir);
    return handle.session;
}

type Fixtures = {
    userDataDir: string;
    session: PackagedSession;
};

export const test = base.extend<Fixtures>({
    userDataDir: async ({}, use) => {
        const dir = await createIsolatedUserDataDir('cuminlang-packaged-e2e-', CONFIG_FILE_NAME);
        await use(dir);
        await fs.promises.rm(dir, { recursive: true, force: true });
    },
    session: async ({ userDataDir }, use, testInfo) => {
        const handle = await launchManagedPackagedSession(1, userDataDir);
        let useError: unknown = null;
        try {
            await use(handle.session);
        } catch (error) {
            useError = error;
        }

        await finalizeTestSessions({
            handles: [handle],
            testInfo,
            userDataDir,
            logsSubdir: LOGS_SUBDIR,
            configFileName: CONFIG_FILE_NAME,
            useError,
            warningPrefix: '[qa] 打包冒烟出现非致命错误/进程退出：',
        });
    },
});
