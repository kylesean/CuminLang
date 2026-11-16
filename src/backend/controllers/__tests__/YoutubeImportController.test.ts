import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcLogger, containerGet } = vi.hoisted(() => ({
    ipcLogger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    containerGet: vi.fn(),
}));

vi.mock('electron', () => ({
    app: { isPackaged: true, getPath: () => '/tmp/cuminlang-yt-controller-test' },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ipcLogger,
    resolveTraceId: (traceId?: string) => traceId ?? 'yt-controller-test-trace',
    runWithTrace: (_traceId: unknown, fn: () => unknown) => fn(),
}));

vi.mock('@/backend/ioc/inversify.config', () => ({ default: { get: containerGet } }));

import { YoutubeImportController } from '@/backend/controllers/YoutubeImportController';
import {
    resetRouteRegistry,
    setRouteTransport,
    type RouteHandler,
} from '@/backend/controllers/ipc/routeRegistry';
import type YoutubeImportService from '@/backend/services/YoutubeImportService';

describe('YoutubeImportController 错误传播边界', () => {
    let captured: Map<string, RouteHandler>;
    const rendererError = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        resetRouteRegistry();
        captured = new Map();
        setRouteTransport((path, handler) => captured.set(path, handler));
        containerGet.mockReturnValue({ error: rendererError });
    });

    it.each([
        ['youtube-import/start', { url: 'https://www.youtube.com/watch?v=FZh_0uRgrg4' }],
        ['youtube-import/cancel', { taskId: 2 }],
        ['youtube-import/setting-detail', undefined],
        ['youtube-import/setting-save', { enabled: true, cookieBrowser: 'chrome', cookiesFilePath: '' }],
    ] as const)('%s 失败时只向调用方抛错，不再重复通过 RendererEvents.error 弹第二个全局框', async (routePath, payload) => {
        const importService = {
            start: vi.fn().mockRejectedValue(new Error('该视频正在导入中（任务 #2），请等待完成后重试')),
            cancel: vi.fn().mockRejectedValue(new Error('取消失败')),
            getSettingDetail: vi.fn().mockRejectedValue(new Error('读取设置失败')),
            saveSetting: vi.fn().mockRejectedValue(new Error('保存设置失败')),
        } as unknown as YoutubeImportService;

        const controller = new YoutubeImportController(importService);
        controller.registerRoutes();

        const handler = captured.get(routePath);
        expect(handler).toBeDefined();

        await expect(handler!({}, payload)).rejects.toThrow();
        expect(rendererError).not.toHaveBeenCalled();
    });
});
