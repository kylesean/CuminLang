import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempRoots: string[] = [];
const mockAppStateRoot = { current: '' };

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/backend/infrastructure/system/AppStatePath', () => ({
    AppStateDirectoryType: { DICTIONARIES: 'dictionaries' },
    getAppStatePath: () => mockAppStateRoot.current,
}));

import EnglishDictionaryService, { WORDNET_BUILD_WORKER_SCRIPT } from '@/backend/services/EnglishDictionaryService';
import type DpTaskService from '@/backend/services/DpTaskService';

const buildMiniWordNetDb = async (dictDir: string, dbPath: string): Promise<void> => {
    const requireFromHere = createRequire(import.meta.url);
    const betterSqlitePath = requireFromHere.resolve('better-sqlite3');
    await new Promise<void>((resolve, reject) => {
        const worker = new Worker(WORDNET_BUILD_WORKER_SCRIPT, {
            eval: true,
            workerData: {
                dictDir,
                dbPath,
                dataFiles: [
                    { file: 'data.noun', pos: 'noun' },
                    { file: 'data.verb', pos: 'verb' },
                    { file: 'data.adj', pos: 'adj' },
                    { file: 'data.adv', pos: 'adv' },
                ],
                betterSqlitePath,
            },
        });
        worker.on('message', (msg: { type: string }) => {
            if (msg.type === 'done') resolve();
        });
        worker.on('error', reject);
    });
};

describe('EnglishDictionaryService', () => {
    afterEach(() => {
        while (tempRoots.length > 0) {
            const dir = tempRoots.pop()!;
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('正确解析十六进制 w_cnt 与反义词指针，且 lookup 词形还原回退后正常返回同义词与反义词', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-wordnet-test-'));
        tempRoots.push(root);
        mockAppStateRoot.current = root;

        const dictDir = path.join(root, 'dict');
        const installDir = path.join(root, 'oewn-english');
        fs.mkdirSync(dictDir, { recursive: true });
        fs.mkdirSync(installDir, { recursive: true });

        // 构造 0a (10 个词) 的名词 synset 与目标反义词 synset（索引 0a 对 01）
        const tenWords = [
            'w1', '0', 'w2', '0', 'w3', '0', 'w4', '0', 'w5', '0',
            'w6', '0', 'w7', '0', 'w8', '0', 'w9', '0', 'bright', '0',
        ].join(' ');
        // w_cnt=0a, p_cnt=001, ! 00000200 n 0a01 (第10词 bright <-> 对方第1词 dim)
        fs.writeFileSync(
            path.join(dictDir, 'data.noun'),
            [
                `00000100 04 n 0a ${tenWords} 001 ! 00000200 n 0a01 | full of light`,
                '00000200 04 n 01 dim 0 000 | lacking light',
            ].join('\n'),
            'utf8',
        );
        // 动词 synset：run / dash（同义），反义 walk，用于测 lookup('running') 词形还原回退
        fs.writeFileSync(
            path.join(dictDir, 'data.verb'),
            [
                '00000300 29 v 02 run 0 dash 0 001 ! 00000400 v 0101 | move fast on foot',
                '00000400 29 v 01 walk 0 000 | move at regular pace',
            ].join('\n'),
            'utf8',
        );
        fs.writeFileSync(path.join(dictDir, 'data.adj'), '', 'utf8');
        fs.writeFileSync(path.join(dictDir, 'data.adv'), '', 'utf8');

        const dbPath = path.join(installDir, 'english.sqlite');
        await buildMiniWordNetDb(dictDir, dbPath);
        fs.writeFileSync(path.join(installDir, '.complete'), 'ok', 'utf8');

        const service = new EnglishDictionaryService({} as unknown as DpTaskService);
        try {
            const brightSenses = service.lookup('bright');
            expect(brightSenses).not.toBeNull();
            expect(brightSenses?.[0]?.antonyms).toEqual(['dim']);

            const runningSenses = service.lookup('running');
            expect(runningSenses).not.toBeNull();
            expect(runningSenses?.[0]?.synonyms).toEqual(['dash']);
            expect(runningSenses?.[0]?.antonyms).toEqual(['walk']);
        } finally {
            service.remove();
        }
    });

    it('install 下载期间调用 remove() 会取消在途任务并等待收尾，不残留半成品目录', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-wordnet-cancel-'));
        tempRoots.push(root);
        mockAppStateRoot.current = root;

        let aborted = false;
        let rejectFetch!: (reason?: unknown) => void;
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
            init?.signal?.addEventListener('abort', () => {
                aborted = true;
                reject(init.signal?.reason ?? new Error('aborted'));
            }, { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);

        const dpTaskService = {
            create: vi.fn(async () => 42),
            registerTask: vi.fn(),
            process: vi.fn(),
            checkCancel: vi.fn(),
            finish: vi.fn(),
            fail: vi.fn(),
            update: vi.fn(),
            cancel: vi.fn(),
        } as unknown as DpTaskService;

        const service = new EnglishDictionaryService(dpTaskService);
        try {
            const taskId = await service.install();
            expect(taskId).toBe(42);
            await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

            const removePromise = Promise.resolve(service.remove());
            await vi.waitFor(() => expect(aborted).toBe(true));
            rejectFetch(new Error('aborted'));
            await removePromise;

            expect(dpTaskService.cancel).toHaveBeenCalledWith(42);
            expect(fs.existsSync(path.join(root, 'oewn-english'))).toBe(false);
            expect(service.status().downloading).toBe(false);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('dpTaskService.create 尚未返回时并发调用 install() 同步拒绝第二次请求', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-wordnet-race-'));
        tempRoots.push(root);
        mockAppStateRoot.current = root;

        let resolveCreate!: (id: number) => void;
        let rejectFetch!: (reason?: unknown) => void;
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);

        const dpTaskService = {
            create: vi.fn(() => new Promise<number>((resolve) => {
                resolveCreate = resolve;
            })),
            registerTask: vi.fn(),
            process: vi.fn(),
            checkCancel: vi.fn(),
            finish: vi.fn(),
            fail: vi.fn(),
            update: vi.fn(),
            cancel: vi.fn(),
        } as unknown as DpTaskService;

        const service = new EnglishDictionaryService(dpTaskService);
        try {
            const first = service.install();
            await vi.waitFor(() => expect(resolveCreate).toBeTypeOf('function'));
            await expect(service.install()).rejects.toThrow('英英释义包正在下载');

            resolveCreate(99);
            await expect(first).resolves.toBe(99);
            expect(dpTaskService.create).toHaveBeenCalledTimes(1);
            await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

            const removePromise = Promise.resolve(service.remove());
            rejectFetch?.(new Error('aborted'));
            await removePromise;
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
