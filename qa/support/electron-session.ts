import {
    _electron as electron,
    type ElectronApplication,
    type Page,
    type TestInfo,
} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CURRENT_ONBOARDING_VERSION } from '../../src/common/constants/onboarding';
import { ONBOARDING_COMPLETED_VERSION_KEY } from '../../src/common/constants/systemConfigKeys';
import { NAV_TESTIDS } from '../../src/common/constants/qa-testids';
import { redactConfigSnapshot } from '../../src/common/settings/redactConfigSnapshot';
import {
    installProcessObserver,
    isFatalProcessGone,
    observePage,
    takeProcessGone,
    type PageObservation,
    type ProcessGoneRecord,
} from './observation';

/** 一次应用会话：Electron 进程 + 主窗口。 */
export interface BaseAppSession {
    /** Electron 进程句柄；重启场景可提前 close 后再建立新会话。 */
    app: ElectronApplication;
    /** 主窗口页面。 */
    page: Page;
    /** 关闭应用进程；重复调用无副作用，关闭前会自动采集运行期观测证据。 */
    close: () => Promise<void>;
    /** 页面级错误观测。 */
    pageObservation: PageObservation;
    /** 取走主进程记录的进程退出事件。 */
    takeProcessGone: () => Promise<ProcessGoneRecord[]>;
    /** 主进程 stderr 尾部（最多 20KB）。 */
    stderrTail: () => string;
}

/** 单次会话关闭前采到的运行期观测快照。 */
export interface SessionEvidence {
    sessionIndex: number;
    pageErrors: string[];
    consoleErrors: string[];
    processGone: ProcessGoneRecord[];
    stderr: string;
}

/** 构造隔离 userData 目录。 */
export async function createIsolatedUserDataDir(
    prefix: string,
    configFileName: string,
): Promise<string> {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
    await fs.promises.writeFile(
        path.join(dir, configFileName),
        JSON.stringify({
            i18n: { language: 'zh-CN' },
            storage: { path: path.join(dir, 'library') },
        }),
        'utf8',
    );
    return dir;
}

/** 读取 JSON 配置文件。 */
export function readJsonConfig(userDataDir: string, configFileName: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(userDataDir, configFileName), 'utf8')) as Record<string, unknown>;
}

/** 按点号路径读取配置值。 */
export function readJsonConfigValue(
    userDataDir: string,
    configFileName: string,
    key: string,
): unknown {
    return key.split('.').reduce<unknown>((node, segment) => {
        if (node === null || typeof node !== 'object') {
            return undefined;
        }
        return (node as Record<string, unknown>)[segment];
    }, readJsonConfig(userDataDir, configFileName));
}

/** 判断凭据类设置是否已持久化（兼容明文与 safeStorage 密文）。 */
export function isSecretValuePersisted(
    userDataDir: string,
    configFileName: string,
    key: string,
    plaintext: string,
): boolean {
    const raw = readJsonConfigValue(userDataDir, configFileName, key);
    if (typeof raw !== 'string' || raw.length === 0) {
        return false;
    }
    return raw === plaintext || raw.startsWith('dp-enc:');
}

/** 构造清理后的 Electron 子进程环境变量。 */
export function buildCleanElectronEnv(extraEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined || key === 'ELECTRON_RUN_AS_NODE' || key === 'NODE_OPTIONS') {
            continue;
        }
        env[key] = value;
    }
    if (extraEnv) {
        Object.assign(env, extraEnv);
    }
    return env;
}

/** 构造标准 Electron 启动参数（含 userDataDir 隔离、GPU 规避与可选 sandbox）。 */
export function buildElectronLaunchArgs(userDataDir: string, leadingArgs: string[] = []): string[] {
    const args = [...leadingArgs, `--user-data-dir=${userDataDir}`];
    if (process.env.QA_DISABLE_GPU !== '0') {
        args.push('--disable-gpu');
    }
    if (process.env.QA_ELECTRON_NO_SANDBOX === '1') {
        args.push('--no-sandbox');
    }
    return args;
}

/** 通过应用自身 IPC 写入引导完成标记并刷新进入主界面。 */
export async function passOnboardingGate(page: Page): Promise<void> {
    await page.waitForFunction(() => Boolean((window as { electron?: unknown }).electron));
    await page.evaluate(async (params: { key: string; value: string }) => {
        const handler = (window as unknown as {
            electron: { call: (path: string, param: unknown) => Promise<unknown> };
        }).electron;
        await handler.call('system/config/set', params);
    }, { key: ONBOARDING_COMPLETED_VERSION_KEY, value: CURRENT_ONBOARDING_VERSION });
    await page.reload();
    await page.getByTestId(NAV_TESTIDS.settings).waitFor();
}

/** 断言首窗口加载本地 `file:` 入口。 */
export async function assertFileProtocolEntry(
    page: Page,
    timeoutMs: number,
    buildError: (currentUrl: string) => string,
): Promise<void> {
    try {
        await page.waitForURL((url) => url.protocol === 'file:', { timeout: timeoutMs });
    } catch {
        throw new Error(buildError(page.url()));
    }
}

/**
 * 读取主进程结构化日志目录下最新日志的尾部（最多 20KB），供失败留证排查。
 * 必须在 `userDataDir` 被删除前调用。
 */
export function readMainLogsTail(userDataDir: string, logsSubdir: string): string {
    const logsDir = path.join(userDataDir, logsSubdir);
    if (!fs.existsSync(logsDir)) {
        return '';
    }
    try {
        const entries = fs.readdirSync(logsDir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => {
                const fullPath = path.join(logsDir, entry.name);
                return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
            })
            .sort((a, b) => a.mtimeMs - b.mtimeMs);
        if (entries.length === 0) {
            return '';
        }
        const latest = entries[entries.length - 1];
        const content = fs.readFileSync(latest.fullPath, 'utf8');
        return content.slice(-20_000);
    } catch {
        return '';
    }
}

/** 读取配置快照用于失败留证（脱敏全部 SECRET_SETTING_KEYS 明文）。 */
export function readRedactedConfigSnapshot(userDataDir: string, configFileName: string): unknown {
    try {
        return redactConfigSnapshot(readJsonConfig(userDataDir, configFileName));
    } catch {
        return null;
    }
}

/** Electron 进程启动参数。 */
export interface LaunchObservedCoreParams {
    launchOptions: Parameters<typeof electron.launch>[0];
    describeLaunchFailure: (error: unknown) => Error;
    afterFirstWindow: (page: Page) => Promise<void>;
}

/** 会话控制句柄（供 fixture 统一回收并校验运行期证据）。 */
export interface ManagedSessionHandle {
    session: BaseAppSession;
    snapshotAndClose: () => Promise<SessionEvidence>;
}

/**
 * 启动一次带运行期观测的 Electron 会话。
 * 无论通过 `session.close()` 提前关闭（重启场景）还是 fixture 结束收尾，都会在进程退出前采走观测数据。
 */
export async function startManagedSession(
    sessionIndex: number,
    params: LaunchObservedCoreParams,
): Promise<ManagedSessionHandle> {
    let app: ElectronApplication;
    try {
        app = await electron.launch(params.launchOptions);
    } catch (error) {
        throw params.describeLaunchFailure(error);
    }

    await installProcessObserver(app);
    let stderr = '';
    app.process().stderr?.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-20_000);
    });

    let pageObservation: PageObservation = {
        takePageErrors: () => [],
        takeConsoleErrors: () => [],
    };
    let closed = false;
    let capturedEvidence: SessionEvidence | null = null;

    const snapshotEvidence = async (): Promise<SessionEvidence> => {
        if (capturedEvidence) {
            return capturedEvidence;
        }
        const pageErrors = pageObservation.takePageErrors();
        const consoleErrors = pageObservation.takeConsoleErrors();
        const processGone = await takeProcessGone(app);
        capturedEvidence = {
            sessionIndex,
            pageErrors,
            consoleErrors,
            processGone,
            stderr,
        };
        return capturedEvidence;
    };

    const close = async (): Promise<void> => {
        if (closed) {
            return;
        }
        closed = true;
        try {
            await snapshotEvidence();
        } finally {
            await app.close();
        }
    };

    try {
        const page = await app.firstWindow();
        pageObservation = observePage(page);
        await params.afterFirstWindow(page);
        const session: BaseAppSession = {
            app,
            page,
            close,
            pageObservation,
            takeProcessGone: () => takeProcessGone(app),
            stderrTail: () => stderr,
        };
        return {
            session,
            snapshotAndClose: async () => {
                await close();
                return snapshotEvidence();
            },
        };
    } catch (error) {
        await close();
        throw error;
    }
}

/**
 * 统一收尾一次测试中打开过的全部会话：先确保所有会话已采样并关闭，
 * 失败或观测到致命故障时附加含主进程日志的 `runtime-evidence.json`。
 */
export async function finalizeTestSessions(options: {
    handles: ManagedSessionHandle[];
    testInfo: TestInfo;
    userDataDir: string;
    logsSubdir: string;
    configFileName: string;
    useError: unknown;
    warningPrefix: string;
}): Promise<void> {
    const { handles, testInfo, userDataDir, logsSubdir, configFileName, useError, warningPrefix } = options;
    let observationError: Error | null = null;

    try {
        const sessionEvidences: SessionEvidence[] = [];
        for (const handle of handles) {
            sessionEvidences.push(await handle.snapshotAndClose());
        }

        const passed = testInfo.status === testInfo.expectedStatus && !useError;
        const pageErrors = sessionEvidences.flatMap((item) => item.pageErrors);
        const consoleErrors = sessionEvidences.flatMap((item) => item.consoleErrors);
        const processGone = sessionEvidences.flatMap((item) => item.processGone);
        const fatalProcessGone = processGone.filter(isFatalProcessGone);

        const failures = [
            ...pageErrors.map((message) => `渲染层未捕获异常：${message}`),
            ...fatalProcessGone.map((record) => `渲染进程异常退出：${JSON.stringify(record)}`),
        ];

        if (!passed || failures.length > 0) {
            const evidence = {
                sessions: sessionEvidences,
                mainLogsTail: readMainLogsTail(userDataDir, logsSubdir),
                configSnapshot: readRedactedConfigSnapshot(userDataDir, configFileName),
            };
            const evidencePath = testInfo.outputPath('runtime-evidence.json');
            await fs.promises.mkdir(path.dirname(evidencePath), { recursive: true });
            await fs.promises.writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
            await testInfo.attach('runtime-evidence.json', {
                path: evidencePath,
                contentType: 'application/json',
            });
        }

        if (passed && failures.length > 0) {
            observationError = new Error(`用例通过但运行期观测到故障：\n${failures.join('\n')}`);
        }
        if (passed && (consoleErrors.length > 0 || processGone.length > 0)) {
            const processSummary = processGone
                .map((record) => `${record.processType ?? record.event}:${record.reason}:${record.exitCode ?? '-'}`)
                .join(', ');
            console.warn(
                `${warningPrefix}`
                + `${consoleErrors.length} 条 console.error，${processGone.length} 条进程退出`
                + `${processSummary ? `（${processSummary}）` : ''}；`
                + '非致命事件不单独 attach，失败时统一写入 runtime-evidence.json。',
            );
        }
    } catch (error) {
        for (const handle of handles) {
            await handle.session.close().catch(() => undefined);
        }
        observationError = error instanceof Error ? error : new Error(String(error));
    }

    if (useError) {
        throw useError;
    }
    if (observationError) {
        throw observationError;
    }
}
