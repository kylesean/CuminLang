import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import MultiFileModelService, { type MultiFileModelSpec } from '@/backend/services/models/MultiFileModelService';
import FileSystemGatewayImpl from '@/backend/infrastructure/storage/FileSystemGatewayImpl';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type StorageDirectoryProvider from '@/backend/services/gateways/storage/StorageDirectoryProvider';

class TestMultiFileModelService extends MultiFileModelService {
    constructor(
        spec: MultiFileModelSpec,
        rendererGateway: RendererGateway,
        storageDirectoryProvider: StorageDirectoryProvider,
        fileSystemGateway: FileSystemGatewayImpl,
    ) {
        super(spec, rendererGateway, storageDirectoryProvider, fileSystemGateway);
    }
}

const makeSpec = (): MultiFileModelSpec => ({
    modelDirectoryName: 'test-model',
    files: [{ fileName: 'weights.bin', urls: ['https://example.invalid/weights.bin'], reportProgress: true }],
    progressEventName: 'settings/sense-voice-model-download-progress',
    modelDisplayName: '测试模型',
    primaryDownloadUrls: ['https://example.invalid/weights.bin'],
    primaryFileName: 'weights.bin',
});

describe('MultiFileModelService 下载并发与流错误处理', () => {
    let tempDir: string | null = null;

    afterEach(async () => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    const setupService = async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cl-multifile-'));
        const gateway = new FileSystemGatewayImpl();
        const provider = {
            provideDirectory: async () => tempDir!,
            ensurePathAccessPermissionIfExists: async () => undefined,
        } as unknown as StorageDirectoryProvider;
        const rendererGateway = { fireAndForget: vi.fn(), call: vi.fn() } as unknown as RendererGateway;
        return {
            tempDir,
            service: new TestMultiFileModelService(makeSpec(), rendererGateway, provider, gateway),
        };
    };

    it('并发调用 download() 只会发起一次下载并共享同一任务', async () => {
        const { service } = await setupService();
        let releaseFetch!: () => void;
        const gate = new Promise<void>((resolve) => {
            releaseFetch = resolve;
        });
        const fetchMock = vi.fn(async () => {
            await gate;
            return new Response(Buffer.from('ok-model-bytes'), {
                status: 200,
                headers: { 'content-length': '14' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const p1 = service.download();
        const p2 = service.download();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        releaseFetch();

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1.success).toBe(true);
        expect(r2.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('下载进行期间调用 deleteModel() 会中止下载并等待收尾后再清理目录，不残留安装文件', async () => {
        const { tempDir: root, service } = await setupService();
        let streamAborted = false;
        let finishStream!: () => void;

        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2, 3]));
                    init?.signal?.addEventListener('abort', () => {
                        streamAborted = true;
                        finishStream = () => controller.error(new Error('aborted'));
                    }, { once: true });
                },
            });
            return new Response(body, { status: 200, headers: { 'content-length': '10' } });
        });
        vi.stubGlobal('fetch', fetchMock);

        const downloadPromise = service.download();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        const deletePromise = service.deleteModel();
        await vi.waitFor(() => expect(streamAborted).toBe(true));
        finishStream();

        const [downloadResult, deleteResult] = await Promise.all([downloadPromise, deletePromise]);
        expect(downloadResult.success).toBe(false);
        expect(deleteResult.success).toBe(true);
        await expect(fs.access(path.join(root, 'test-model'))).rejects.toThrow();
    });

    it('写入流发生错误时受控返回失败结果而不抛出未捕获进程异常', async () => {
        const { tempDir: root, service } = await setupService();
        // 把目标文件占位成同名目录，迫使 fs.createWriteStream 触发 EISDIR error 事件
        await fs.mkdir(path.join(root, 'test-model.downloading', 'weights.bin'), { recursive: true });

        const fetchMock = vi.fn(async () => new Response(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2, 3, 4]));
                    controller.close();
                },
            }),
            { status: 200, headers: { 'content-length': '4' } },
        ));
        vi.stubGlobal('fetch', fetchMock);

        const result = await service.download();
        expect(result.success).toBe(false);
    });

    it('getStatus 检查尚未完成时调用 deleteModel() 也能立即中止而不继续发起下载', async () => {
        const { service } = await setupService();
        let resolveFileExists!: (exists: boolean) => void;
        vi.spyOn(FileSystemGatewayImpl.prototype, 'fileExists').mockImplementationOnce(
            () => new Promise<boolean>((resolve) => {
                resolveFileExists = resolve;
            }),
        );
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const downloadPromise = service.download();
        await vi.waitFor(() => expect(resolveFileExists).toBeTypeOf('function'));

        const deletePromise = service.deleteModel();
        resolveFileExists(false);

        const [downloadResult, deleteResult] = await Promise.all([downloadPromise, deletePromise]);
        expect(downloadResult.success).toBe(false);
        expect(deleteResult.success).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('cancelDownload() 后旧任务收尾前立即再次 download() 会等待清理并成功重下，同时 getStatus 上报真实进度', async () => {
        const { service } = await setupService();
        let finishFirstStream!: () => void;
        let firstCall = true;
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            if (firstCall) {
                firstCall = false;
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new Uint8Array(5));
                        init?.signal?.addEventListener('abort', () => {
                            finishFirstStream = () => controller.error(new Error('aborted'));
                        }, { once: true });
                    },
                });
                return new Response(body, { status: 200, headers: { 'content-length': '10' } });
            }
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2, 3, 4]));
                    controller.close();
                },
            });
            return new Response(body, { status: 200, headers: { 'content-length': '4' } });
        });
        vi.stubGlobal('fetch', fetchMock);

        const firstDownload = service.download();
        await vi.waitFor(async () => {
            const st = await service.getStatus();
            expect(st.downloading).toBe(true);
            expect(st.percent).toBeGreaterThan(0);
        });

        await expect(service.cancelDownload()).resolves.toEqual({ cancelled: true });
        await vi.waitFor(() => expect(finishFirstStream).toBeTypeOf('function'));

        const retryDownload = service.download();
        finishFirstStream();

        const [firstResult, retryResult] = await Promise.all([firstDownload, retryDownload]);
        expect(firstResult.success).toBe(false);
        expect(retryResult.success).toBe(true);
    });
});
