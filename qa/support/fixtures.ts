import { test as base, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
    parseStoredProviderKeys,
    parseStoredProviderProfiles,
    type PersistedCloudAiProvider,
} from '../../src/common/utils/cloud-ai-providers';
import {
    assertFileProtocolEntry,
    buildCleanElectronEnv,
    buildElectronLaunchArgs,
    createIsolatedUserDataDir,
    finalizeTestSessions,
    isSecretValuePersisted,
    passOnboardingGate,
    readJsonConfig,
    readJsonConfigValue,
    startManagedSession,
    type BaseAppSession,
    type ManagedSessionHandle,
} from './electron-session';

/** 仓库根目录（本文件在 `qa/support/` 下）；`electron .` 会读取 package.json 的 main（.vite/build/main.cjs）。 */
const projectRoot = path.resolve(__dirname, '..', '..');

/** 开发态配置文件：`electron .` 启动时 electron-store 文件名带 .dev 后缀（判定见 runtimeEnv）。 */
const CONFIG_FILE_NAME = 'config.dev.json';
const LOGS_SUBDIR = 'logs-dev';

/**
 * 启动超时（毫秒）。
 *
 * Playwright 默认 30 秒。但 `qa/README.md` 第 7 节记录过「启动偶发停顿几十秒到几分钟」
 * 的环境级问题（显示器切换器会让 Chromium 迟迟不 fork GPU 进程、不建 profile）。
 */
const LAUNCH_TIMEOUT_MS = 120_000;

/** 首窗口必须加载本地生产 bundle 的超时（毫秒）。 */
const ENTRY_TIMEOUT_MS = 15_000;

/** 一次应用会话：Electron 进程 + 已越过启动引导的主窗口。 */
export type AppSession = BaseAppSession;

/** 启动选项。 */
export interface LaunchAppOptions {
    /** 是否由 fixture 越过引导；默认 true。测引导本身时传 false。 */
    skipOnboarding?: boolean;
}

/**
 * 读取 userData 中的开发态配置文件，用于断言设置是否真正落盘。
 *
 * 注意 electron-store 默认按点号访问嵌套属性，文件里是嵌套结构：
 * appearance.theme 实际存为 {"appearance":{"theme":"dark"}}。
 *
 * @param userDataDir 用例独占的 userData 目录。
 * @returns 解析后的配置对象。
 */
export function readConfig(userDataDir: string): Record<string, unknown> {
    return readJsonConfig(userDataDir, CONFIG_FILE_NAME);
}

/**
 * 按点号路径读取配置值。
 *
 * @param userDataDir 用例独占的 userData 目录。
 * @param key 形如 appearance.theme 的点号路径。
 * @returns 对应值；路径不存在时为 undefined。
 */
export function readConfigValue(userDataDir: string, key: string): unknown {
    return readJsonConfigValue(userDataDir, CONFIG_FILE_NAME, key);
}

/**
 * 判断凭据类设置是否已经持久化。
 *
 * 凭据在 `safeStorage` 可用时以 `dp-enc:` 密文落盘（macOS / Windows 默认可用，
 * Linux 取决于有没有系统密钥环），不可用时才是明文。
 *
 * @param userDataDir 用例独占的 userData 目录。
 * @param key 形如 proxy.url 的点号路径。
 * @param plaintext 期望的明文值。
 * @returns 已写入（明文或密文）时为 true。
 */
export function isSecretPersisted(userDataDir: string, key: string, plaintext: string): boolean {
    return isSecretValuePersisted(userDataDir, CONFIG_FILE_NAME, key, plaintext);
}

/** 读取 `models.openai.providers` 中指定服务商档案，未持久化或不存在时返回 undefined。 */
export function readProviderProfile(
    userDataDir: string,
    providerId = 'deepseek',
): PersistedCloudAiProvider | undefined {
    const raw = readConfigValue(userDataDir, 'models.openai.providers');
    if (typeof raw !== 'string') {
        return undefined;
    }
    return parseStoredProviderProfiles(raw)?.find((item) => item.id === providerId);
}

/**
 * 判断 `apiKeys.openAi.providerKeys` 中指定服务商的密钥是否已落盘
 * （加密环境断言密文前缀，无密钥环环境解析 JSON 比对对应键明文）。
 */
export function isProviderSecretPersisted(
    userDataDir: string,
    providerId: string,
    plaintext: string,
): boolean {
    const raw = readConfigValue(userDataDir, 'apiKeys.openAi.providerKeys');
    if (typeof raw !== 'string' || raw.length === 0) {
        return false;
    }
    if (raw.startsWith('dp-enc:')) {
        return true;
    }
    return parseStoredProviderKeys(raw)[providerId] === plaintext;
}

/**
 * 确认应用确实把状态写进了本轮用例的临时目录。
 *
 * @param userDataDir 用例独占的 userData 目录。
 */
async function assertUserDataIsolated(userDataDir: string): Promise<void> {
    const databaseFile = path.join(userDataDir, 'data-dev', 'dp_db.sqlite3');
    if (!fs.existsSync(databaseFile)) {
        throw new Error(`应用未在隔离目录内建库，userData 可能没有切到 ${userDataDir}`);
    }
}

/**
 * 把 Playwright 的启动失败翻译成可归因的错误。
 *
 * @param error 原始错误。
 * @returns 带排查提示的错误。
 */
function describeLaunchFailure(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    let hint: string;
    if (/bad option|unknown option|not allowed in NODE_OPTIONS|invalid value/i.test(message)) {
        hint = 'Electron 把 Chromium 参数当成了 Node 参数：检查 ELECTRON_RUN_AS_NODE/NODE_OPTIONS，'
            + 'fixture 已主动清理；若手工启动，先 unset 这两个变量。';
    } else if (/Process failed to launch|spawn .* ENOENT|ENOENT/i.test(message)) {
        hint = 'Electron 二进制不可执行或路径不存在：确认 node_modules/electron 已安装完成。';
    } else if (/timeout|timed out/i.test(message)) {
        hint = '启动超时。若日志卡在 "Debugger listening" 之后，先按 qa/README.md 第 7 节排查'
            + '显示器切换器/GPU 进程停顿，不要先怀疑用例。';
    } else {
        hint = '检查 Electron 版本、显示环境与 qa/README.md 第 7 节的已知环境问题。';
    }
    return new Error(`Electron 启动失败或超时（上限 ${LAUNCH_TIMEOUT_MS / 1000} 秒）。${hint}\n${message}`, {
        cause: error,
    });
}

async function launchManagedSession(
    sessionIndex: number,
    userDataDir: string,
    options: LaunchAppOptions = {},
): Promise<ManagedSessionHandle> {
    return startManagedSession(sessionIndex, {
        launchOptions: {
            args: buildElectronLaunchArgs(userDataDir, ['.']),
            cwd: projectRoot,
            env: buildCleanElectronEnv(),
            timeout: LAUNCH_TIMEOUT_MS,
        },
        describeLaunchFailure,
        afterFirstWindow: async (page: Page) => {
            await assertFileProtocolEntry(
                page,
                ENTRY_TIMEOUT_MS,
                (currentUrl) =>
                    `应用没有加载本地生产 bundle，当前 URL：${currentUrl}。`
                    + '这说明 `.vite` 是开发态构建或 dev server 冒充了应用入口；'
                    + '请删除 `.vite` 后重跑，globalSetup 会重新生成带清单的生产构建。',
            );
            await assertUserDataIsolated(userDataDir);
            if (options.skipOnboarding !== false) {
                await passOnboardingGate(page);
            }
        },
    });
}

type Fixtures = {
    /** 用例独占的 userData 目录，测试结束后自动删除。 */
    userDataDir: string;
    /** 在本用例内启动受观测的应用会话（支持多轮重启，统一收集故障与日志）。 */
    openSession: (options?: LaunchAppOptions) => Promise<AppSession>;
    /** 已启动并处于主界面的应用会话。 */
    session: AppSession;
};

export const test = base.extend<Fixtures>({
    userDataDir: async ({}, use) => {
        const dir = await createIsolatedUserDataDir('cuminlang-e2e-', CONFIG_FILE_NAME);
        await use(dir);
        await fs.promises.rm(dir, { recursive: true, force: true });
    },
    openSession: async ({ userDataDir }, use, testInfo) => {
        const handles: ManagedSessionHandle[] = [];
        const open = async (options: LaunchAppOptions = {}): Promise<AppSession> => {
            const handle = await launchManagedSession(handles.length + 1, userDataDir, options);
            handles.push(handle);
            return handle.session;
        };

        let useError: unknown = null;
        try {
            await use(open);
        } catch (error) {
            useError = error;
        }

        await finalizeTestSessions({
            handles,
            testInfo,
            userDataDir,
            logsSubdir: LOGS_SUBDIR,
            configFileName: CONFIG_FILE_NAME,
            useError,
            warningPrefix: '[qa] 运行期出现非致命错误/进程退出（未影响断言）：',
        });
    },
    session: async ({ openSession }, use) => {
        const session = await openSession();
        await use(session);
    },
});
