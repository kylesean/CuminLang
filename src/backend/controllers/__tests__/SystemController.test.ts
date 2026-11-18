import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
    getVersion: vi.fn(() => '0.1.0'),
    relaunch: vi.fn(),
    quit: vi.fn(),
    writeText: vi.fn(),
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/tmp/picked'] })),
    openPath: vi.fn(async () => ''),
    openExternal: vi.fn(async () => undefined),
    getMediaAccessStatus: vi.fn(() => 'not-determined' as string),
    askForMediaAccess: vi.fn(async () => true),
}));

vi.mock('electron', () => ({
    app: {
        isPackaged: true,
        getPath: () => '/tmp/cuminlang-system-controller-test',
        getVersion: electronMocks.getVersion,
        relaunch: electronMocks.relaunch,
        quit: electronMocks.quit,
    },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    clipboard: { writeText: electronMocks.writeText },
    dialog: { showOpenDialog: electronMocks.showOpenDialog },
    shell: {
        openPath: electronMocks.openPath,
        openExternal: electronMocks.openExternal,
    },
    systemPreferences: {
        getMediaAccessStatus: electronMocks.getMediaAccessStatus,
        askForMediaAccess: electronMocks.askForMediaAccess,
    },
}));

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    resolveTraceId: (traceId?: string) => traceId ?? 'system-controller-test-trace',
    runWithTrace: async (_traceId: unknown, fn: () => unknown) => fn(),
}));

vi.mock('@/backend/ioc/inversify.config', () => ({
    default: { get: vi.fn() },
}));

vi.mock('@/backend/utils/systemInfo', () => ({
    readSystemInfo: vi.fn(async () => ({
        totalMemoryGb: 16,
        cpuCount: 8,
        gpuAcceleration: 'vulkan',
    })),
}));

vi.mock('@/backend/utils/runtimeEnv', () => ({
    isDevelopmentMode: vi.fn(() => false),
}));

import SystemController from '../SystemController';
import {
    getRouteRegistrations,
    resetRouteRegistry,
    type RouteHandler,
    setRouteTransport,
} from '@/backend/controllers/ipc/routeRegistry';
import type WindowPort from '@/backend/services/gateways/window/WindowPort';
import type SystemService from '@/backend/services/SystemService';
import type { WindowState } from '@/common/types/Types';
import { RESET_DB_RESYNC_FLAG } from '@/common/constants/resetDb';

function createMocks() {
    const windowPort: WindowPort = {
        setWindowButtonsVisible: vi.fn(),
        changeWindowSize: vi.fn(),
        windowState: vi.fn<() => WindowState>(() => 'home'),
    };
    const systemService = {
        resetDatabase: vi.fn(async () => undefined),
        prepareFolderForOpen: vi.fn(async ({ path: target }: { path: string }) => target),
        checkUpdate: vi.fn(async (version: string) => ({
            hasUpdate: false,
            currentVersion: version,
            latestVersion: version,
        })),
        getSystemConfig: vi.fn(async () => 'stored-value'),
        setSystemConfig: vi.fn(async () => undefined),
        resolveCacheDirectory: vi.fn(async () => '/tmp/cuminlang-cache'),
        resolveLogsDirectory: vi.fn(async () => '/tmp/cuminlang-logs'),
    } as unknown as SystemService;
    const controller = new SystemController(windowPort, systemService);
    return { controller, windowPort, systemService };
}

describe('SystemController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetRouteRegistry();
    });

    it('info 与 appVersion 返回平台与版本信息', async () => {
        const { controller } = createMocks();
        const info = await controller.info();
        expect(info).toMatchObject({
            totalMemoryGb: 16,
            cpuCount: 8,
            gpuAcceleration: 'vulkan',
            devMode: false,
        });
        expect(await controller.appVersion()).toBe('0.1.0');
    });

    it('pathInfo 拆分文件名、父目录与扩展名', async () => {
        const { controller } = createMocks();
        const parsed = await controller.pathInfo('/media/lesson/intro.mp4');
        expect(parsed).toEqual({
            baseName: 'intro.mp4',
            dirName: '/media/lesson',
            extName: '.mp4',
        });
    });

    it('selectFile 剥离扩展名前导点号后调起文件选择器', async () => {
        const { controller } = createMocks();
        const result = await controller.selectFile(['.mp4', ' ', 'srt']);
        expect(result).toEqual(['/tmp/picked']);
        expect(electronMocks.showOpenDialog).toHaveBeenCalledWith({
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Files', extensions: ['mp4', 'srt'] }],
        });
    });

    it.each([
        { input: {}, expectedProps: ['openDirectory'], expectedDefault: undefined },
        {
            input: { defaultPath: '/media', createDirectory: true },
            expectedProps: ['openDirectory', 'createDirectory'],
            expectedDefault: '/media',
        },
    ])('selectFolder 根据参数构建目录选择器配置', async ({ input, expectedProps, expectedDefault }) => {
        const { controller } = createMocks();
        await controller.selectFolder(input);
        expect(electronMocks.showOpenDialog).toHaveBeenCalledWith({
            properties: expectedProps,
            ...(expectedDefault ? { defaultPath: expectedDefault } : {}),
        });
    });

    it('openFolder、openCacheDir 与 openLogsDir 打开目标目录并在系统返回错误时抛错', async () => {
        const { controller, systemService } = createMocks();

        await controller.openFolder({ path: '/tmp/folder', createDirectory: true });
        expect(systemService.prepareFolderForOpen).toHaveBeenCalledWith({
            path: '/tmp/folder',
            createDirectory: true,
        });
        expect(electronMocks.openPath).toHaveBeenCalledWith('/tmp/folder');

        await controller.openCacheDir();
        expect(electronMocks.openPath).toHaveBeenCalledWith('/tmp/cuminlang-cache');

        await controller.openLogsDir();
        expect(electronMocks.openPath).toHaveBeenCalledWith('/tmp/cuminlang-logs');

        electronMocks.openPath.mockResolvedValueOnce('ENOENT');
        await expect(controller.openLogsDir()).rejects.toThrow('打开日志目录失败：ENOENT');

        electronMocks.openPath.mockResolvedValueOnce('EACCES');
        await expect(controller.openFolder({ path: '/tmp/denied' })).rejects.toThrow('打开文件夹失败：EACCES');
    });

    it('checkUpdate、openUrl、resetDb 与系统配置读写透传对应能力', async () => {
        const { controller, systemService, windowPort } = createMocks();

        expect(await controller.checkUpdate({ mode: 'toast' })).toEqual({
            hasUpdate: false,
            currentVersion: '0.1.0',
            latestVersion: '0.1.0',
        });
        expect(systemService.checkUpdate).toHaveBeenCalledWith('0.1.0', { mode: 'toast' });

        await controller.openUrl('https://github.com/kylesean/CuminLang');
        expect(electronMocks.openExternal).toHaveBeenCalledWith('https://github.com/kylesean/CuminLang');

        await controller.setWindowButtonsVisible(true);
        await controller.changeWindowSize('player');
        expect(await controller.windowState()).toBe('home');
        expect(windowPort.setWindowButtonsVisible).toHaveBeenCalledWith(true);
        expect(windowPort.changeWindowSize).toHaveBeenCalledWith('player');

        expect(await controller.getSystemConfig('appearance.theme')).toBe('stored-value');
        await controller.setSystemConfig({ key: 'appearance.theme', value: 'dark' });
        expect(systemService.setSystemConfig).toHaveBeenCalledWith('appearance.theme', 'dark');

        await controller.resetDb();
        expect(systemService.resetDatabase).toHaveBeenCalledTimes(1);
        expect(electronMocks.relaunch).toHaveBeenCalledWith({
            args: expect.arrayContaining([RESET_DB_RESYNC_FLAG]),
        });
        expect(electronMocks.quit).toHaveBeenCalledTimes(1);
    });

    it('registerRoutes 注册 system/open-folder/logs 与剪贴板等全部系统路由', async () => {
        const captured = new Map<string, RouteHandler>();
        setRouteTransport((routePath, handler) => {
            captured.set(routePath, handler);
        });

        const { controller } = createMocks();
        controller.registerRoutes();
        const registrations = getRouteRegistrations();

        expect(registrations.has('system/open-folder/logs')).toBe(true);
        await captured.get('system/open-folder/logs')!(null, undefined);
        expect(electronMocks.openPath).toHaveBeenCalledWith('/tmp/cuminlang-logs');

        await captured.get('system/clipboard/write')!(null, 'copied text');
        expect(electronMocks.writeText).toHaveBeenCalledWith('copied text');

        await expect(captured.get('system/open-url')!(null, 'https://github.com/kylesean/CuminLang')).resolves.toBeUndefined();
        await expect(captured.get('system/open-url')!(null, 'http://127.0.0.1:27182/?t=abc')).resolves.toBeUndefined();
        await expect(captured.get('system/open-url')!(null, 'http://example.com/phish')).rejects.toThrow('参数校验失败');
    });
});
