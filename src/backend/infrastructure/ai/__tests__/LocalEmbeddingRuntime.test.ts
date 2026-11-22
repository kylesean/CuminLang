import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getPath: () => '/tmp/dashplayer-embedding-test-userdata',
        getVersion: () => '6.1.0',
    },
    ipcMain: undefined,
    ipcRenderer: undefined,
}));

import { LocalEmbeddingRuntime } from '@/backend/infrastructure/ai/LocalEmbeddingRuntime';
import {
    getLlamaExecutablePath,
    getLlamaRuntimeDir,
    llamaDependencyPrefixesFor,
} from '@/backend/infrastructure/ai/llamaRuntimeInstaller';
import { StorageDirectoryTarget } from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import {
    LOCAL_EMBEDDING_MODEL,
    LOCAL_EMBEDDING_MMPROJ,
    LLAMA_RUNTIME_VERSION,
} from '@/common/contracts/local-ai';

async function seedMockRuntime(modelsDir: string): Promise<string> {
    const runtimeDir = getLlamaRuntimeDir(modelsDir);
    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.writeFile(path.join(runtimeDir, '.complete'), `${LLAMA_RUNTIME_VERSION}\n`);
    await fs.writeFile(getLlamaExecutablePath(runtimeDir), 'stub-llama-server');
    for (const prefix of llamaDependencyPrefixesFor()) {
        const suffix = process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
        await fs.writeFile(path.join(runtimeDir, `${prefix}${suffix}`), 'stub-lib');
    }
    return runtimeDir;
}

describe('LocalEmbeddingRuntime', () => {
    let directory: string | null = null;

    afterEach(async () => {
        if (directory) {
            await fs.rm(directory, { recursive: true, force: true });
        }
        directory = null;
    });

    it('模型未安装时不启动进程，直接返回 null 供上层降级', async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dashplayer-embedding-'));
        const runtime = new LocalEmbeddingRuntime({
            provideDirectory: async () => directory!,
            ensurePathAccessible: async () => undefined,
        } as never);

        expect(await runtime.isReady()).toBe(false);
        expect(await runtime.embed(['hello world'])).toBeNull();
        await runtime.shutdown();
    });

    it('模型尺寸不符时视为未安装', async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dashplayer-embedding-'));
        const modelDir = path.join(directory, LOCAL_EMBEDDING_MODEL.id);
        await fs.mkdir(modelDir, { recursive: true });
        await fs.writeFile(path.join(modelDir, LOCAL_EMBEDDING_MODEL.file), 'truncated');
        const runtime = new LocalEmbeddingRuntime({
            provideDirectory: async (target: StorageDirectoryTarget) => {
                expect(target).toBe(StorageDirectoryTarget.MODELS);
                return directory!;
            },
            ensurePathAccessible: async () => undefined,
        } as never);

        expect(await runtime.isReady()).toBe(false);
        expect(await runtime.embed(['hello world'])).toBeNull();
    });

    it('空输入不触发任何推理', async () => {
        const runtime = new LocalEmbeddingRuntime({
            provideDirectory: async () => '/nonexistent',
            ensurePathAccessible: async () => undefined,
        } as never);

        expect(await runtime.embed([])).toEqual([]);
    });

    it('多模态投影未安装时图像向量返回 null，而不是零向量', async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dashplayer-embedding-'));
        const runtime = new LocalEmbeddingRuntime({
            provideDirectory: async () => directory!,
            ensurePathAccessible: async () => undefined,
        } as never);

        expect(await runtime.isMultimodalReady()).toBe(false);
        expect(await runtime.embedImages([{
            data: Buffer.from('fake'),
            mimeType: 'image/png',
        }])).toBeNull();
    });

    it('多模态投影尺寸不符时视为未安装', async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dashplayer-embedding-'));
        const mmprojDir = path.join(directory, LOCAL_EMBEDDING_MMPROJ.id);
        await fs.mkdir(mmprojDir, { recursive: true });
        await fs.writeFile(path.join(mmprojDir, LOCAL_EMBEDDING_MMPROJ.file), 'truncated');
        const runtime = new LocalEmbeddingRuntime({
            provideDirectory: async () => directory!,
            ensurePathAccessible: async () => undefined,
        } as never);

        expect(await runtime.isMultimodalReady()).toBe(false);
    });

    it('状态同时报告文本模型与多模态投影（缺失 llama-server 运行时视为未就绪）', async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dashplayer-embedding-'));
        const modelDir = path.join(directory, LOCAL_EMBEDDING_MODEL.id);
        const mmprojDir = path.join(directory, LOCAL_EMBEDDING_MMPROJ.id);
        await fs.mkdir(modelDir, { recursive: true });
        await fs.mkdir(mmprojDir, { recursive: true });
        await fs.writeFile(path.join(modelDir, LOCAL_EMBEDDING_MODEL.file), Buffer.alloc(LOCAL_EMBEDDING_MODEL.bytes));
        await fs.writeFile(path.join(mmprojDir, LOCAL_EMBEDDING_MMPROJ.file), Buffer.alloc(LOCAL_EMBEDDING_MMPROJ.bytes));
        const runtime = new LocalEmbeddingRuntime({
            provideDirectory: async () => directory!,
            ensurePathAccessible: async () => undefined,
        } as never);

        const withoutRuntime = await runtime.getStatus();
        expect(withoutRuntime.ready).toBe(false);
        expect(withoutRuntime.runtimeReady).toBe(false);
        expect(await runtime.embed(['hello'])).toBeNull();

        await seedMockRuntime(directory);
        const status = await runtime.getStatus();

        expect(status.ready).toBe(true);
        expect(status.runtimeReady).toBe(true);
        expect(status.multimodalReady).toBe(true);
        expect(status.bytes).toBe(LOCAL_EMBEDDING_MODEL.bytes);
        expect(status.multimodalBytes).toBe(LOCAL_EMBEDDING_MMPROJ.bytes);
        expect(status.activeTarget).toBeNull();
        expect(status.multimodalModelPath).toBe(path.join(mmprojDir, LOCAL_EMBEDDING_MMPROJ.file));
    });

    it('删除模型会同时移除文本模型、多模态投影与按需下载的 llama 运行时', async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dashplayer-embedding-'));
        const modelDir = path.join(directory, LOCAL_EMBEDDING_MODEL.id);
        const mmprojDir = path.join(directory, LOCAL_EMBEDDING_MMPROJ.id);
        await fs.mkdir(modelDir, { recursive: true });
        await fs.mkdir(mmprojDir, { recursive: true });
        await fs.writeFile(path.join(modelDir, LOCAL_EMBEDDING_MODEL.file), 'x');
        await fs.writeFile(path.join(mmprojDir, LOCAL_EMBEDDING_MMPROJ.file), 'y');
        const runtimeDir = await seedMockRuntime(directory);
        const runtime = new LocalEmbeddingRuntime({
            provideDirectory: async () => directory!,
            ensurePathAccessible: async () => undefined,
        } as never);

        const removed = await runtime.remove();

        expect(removed).toBe(2);
        expect(await runtime.isReady()).toBe(false);
        expect(await runtime.isMultimodalReady()).toBe(false);
        await expect(fs.stat(runtimeDir)).rejects.toThrow();
    });

    it('启动轮询健康检查期间若被 shutdown 叫停，必须终止已生成的子进程而不留孤儿进程', async () => {
        const runtime = new LocalEmbeddingRuntime({
            provideDirectory: async () => '/nonexistent',
            ensurePathAccessible: async () => undefined,
        } as never);

        const fakeChild = {
            pid: 99999,
            killed: false,
            kill: vi.fn(),
            once: vi.fn(),
        };
        const fakeExited = Promise.resolve();
        await (runtime as unknown as {
            terminateChildProcess: (child: unknown, exited: Promise<void>) => Promise<void>;
        }).terminateChildProcess(fakeChild, fakeExited);

        expect(fakeChild.kill).toHaveBeenCalledTimes(1);
    });
});
