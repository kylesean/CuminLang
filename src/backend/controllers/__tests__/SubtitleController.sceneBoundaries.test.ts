import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcLogger, containerGet, rendererError } = vi.hoisted(() => ({
    ipcLogger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    containerGet: vi.fn(),
    rendererError: vi.fn(),
}));

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getPath: () => '/tmp/dashplayer-subtitle-controller-userdata',
        getVersion: () => '6.1.0',
    },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    ipcRenderer: undefined,
}));

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ipcLogger,
    resolveTraceId: (traceId?: string) => traceId ?? 'subtitle-controller-test-trace',
    runWithTrace: (_traceId: unknown, fn: () => unknown) => fn(),
}));

vi.mock('@/backend/ioc/inversify.config', () => ({ default: { get: containerGet } }));

import SubtitleController from '@/backend/controllers/SubtitleController';
import {
    resetRouteRegistry,
    setRouteTransport,
    type RouteHandler,
} from '@/backend/controllers/ipc/routeRegistry';
import type SceneIndexService from '@/backend/services/SceneIndexService';
import type { SceneBoundary, SceneSentence } from '@/common/learning/sceneSegmentation';

const sentences: SceneSentence[] = [
    { fileHash: 'hash-1', index: 0, start: 0, end: 2, text: 'The ocean covers most of the planet.' },
    { fileHash: 'hash-1', index: 1, start: 10, end: 12, text: 'She bought a red bicycle.' },
];

describe('SubtitleController subtitle/scene-boundaries IPC 契约', () => {
    let captured: Map<string, RouteHandler>;
    let getBoundaries: ReturnType<typeof vi.fn<SceneIndexService['getBoundaries']>>;

    beforeEach(() => {
        vi.clearAllMocks();
        resetRouteRegistry();
        captured = new Map();
        setRouteTransport((path, handler) => captured.set(path, handler));
        containerGet.mockReturnValue({ error: rendererError });

        getBoundaries = vi.fn<SceneIndexService['getBoundaries']>().mockResolvedValue([]);
        const controller = new SubtitleController(
            {} as never,
            {} as never,
            { getBoundaries, invalidate: vi.fn(async () => 0) } as unknown as SceneIndexService,
        );
        controller.registerRoutes();
    });

    it('少于 2 句时在 IPC schema 边界直接拒绝，不进入 SceneIndexService', async () => {
        const handler = captured.get('subtitle/scene-boundaries')!;

        await expect(handler({}, { sentences: [sentences[0]] })).rejects.toThrow('IPC 请求参数校验失败');
        expect(getBoundaries).not.toHaveBeenCalled();
        expect(rendererError).toHaveBeenCalledTimes(1);
    });

    it('拒绝契约外未声明字段，防止未知参数静默渗入', async () => {
        const handler = captured.get('subtitle/scene-boundaries')!;

        await expect(handler({}, { sentences, extraFlag: true })).rejects.toThrow(/未声明字段.*extraFlag/);
        expect(getBoundaries).not.toHaveBeenCalled();
    });

    it('合法字幕句列表与可选 videoPath 通过校验后转交 SceneIndexService 返回边界', async () => {
        const boundaries: SceneBoundary[] = [{
            sentenceIndex: 1,
            atSec: 10,
            kinds: ['time-gap'],
            confidence: 0.9,
        }];
        getBoundaries.mockResolvedValueOnce(boundaries);
        const handler = captured.get('subtitle/scene-boundaries')!;

        const result = await handler({}, { sentences, videoPath: '/video/a.mp4' });

        expect(result).toEqual(boundaries);
        expect(getBoundaries).toHaveBeenCalledWith(sentences, '/video/a.mp4');
        expect(rendererError).not.toHaveBeenCalled();
    });
});
