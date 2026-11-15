import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { SubtitleServiceImpl } from '@/backend/services/SubtitleService';
import type SrtTimeAdjustService from '@/backend/services/SrtTimeAdjustService';
import type CacheService from '@/backend/services/CacheService';
import type { SubtitleVocabularyAnalysisService } from '@/backend/services/SubtitleVocabularyAnalysisService';
import type StorageDirectoryProvider from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import type FileSystemGateway from '@/backend/services/gateways/storage/FileSystemGateway';
import type MediaPathRegistry from '@/backend/services/MediaPathRegistry';

const SAMPLE_SRT = [
    '1',
    '00:00:01,000 --> 00:00:03,000',
    'Running fast helps you stay sharp.',
    '',
    '2',
    '00:00:04,500 --> 00:00:06,000',
    'They have already arrived.',
    '',
].join('\n');

function createMemoryCache(): CacheService {
    const store = new Map<string, unknown>();
    return {
        get: vi.fn((prefix: string, key: string) => store.get(`${prefix}:${key}`) ?? null),
        set: vi.fn((prefix: string, key: string, value: unknown) => {
            store.set(`${prefix}:${key}`, value);
        }),
        delete: vi.fn((prefix: string, key: string) => store.delete(`${prefix}:${key}`)),
        clear: vi.fn(() => store.clear()),
    } as unknown as CacheService;
}

function createServiceHarness(files: Record<string, string>, dirListings: Record<string, string[]> = {}) {
    const cacheService = createMemoryCache();
    const srtTimeAdjustService = {
        getByHash: vi.fn().mockResolvedValue([]),
    } as unknown as SrtTimeAdjustService;
    const vocabularyAnalysisService = {
        cancelActive: vi.fn(),
        analyze: vi.fn().mockResolvedValue({
            lineMatches: [[
                {
                    lemma: 'run',
                    surface: 'Running',
                    databaseWord: { word: 'run', status: 'learning' },
                },
            ]],
        }),
        invalidate: vi.fn(),
    } as unknown as SubtitleVocabularyAnalysisService;
    const storageDirectoryProvider = {
        ensurePathAccessPermissionIfExists: vi.fn().mockResolvedValue(undefined),
    } as unknown as StorageDirectoryProvider;
    const fileSystemGateway = {
        fileExists: vi.fn(async (targetPath: string) => targetPath in files),
        readTextFile: vi.fn(async (targetPath: string) => files[targetPath]),
        listFileNames: vi.fn(async (dirPath: string) => dirListings[dirPath] ?? []),
    } as unknown as FileSystemGateway;
    const mediaPathRegistry = {
        allowFile: vi.fn(),
    } as unknown as MediaPathRegistry;

    const service = new SubtitleServiceImpl(
        srtTimeAdjustService,
        cacheService,
        vocabularyAnalysisService,
        storageDirectoryProvider,
        fileSystemGateway,
        mediaPathRegistry,
    );

    return {
        service,
        cacheService,
        srtTimeAdjustService,
        vocabularyAnalysisService,
        fileSystemGateway,
        mediaPathRegistry,
    };
}

describe('SubtitleServiceImpl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parseSrt 解析字幕、应用时间轴微调，并在命中内存缓存时避免重复读盘分词', async () => {
        const subPath = '/media/demo/lesson.srt';
        const harness = createServiceHarness({ [subPath]: SAMPLE_SRT });

        vi.mocked(harness.srtTimeAdjustService.getByHash).mockImplementationOnce(async (fileHash) => [
            { key: `${fileHash}-0`, start_at: 1.25, end_at: 3.1, file_hash: fileHash } as never,
        ]);

        const first = await harness.service.parseSrt(subPath);
        expect(first.filePath).toBe(subPath);
        expect(first.sentences).toHaveLength(2);
        expect(first.sentences[0].text).toBe('Running fast helps you stay sharp.');
        expect(first.sentences[0].adjustedStart).toBe(1.25);
        expect(first.sentences[0].adjustedEnd).toBe(3.1);
        expect(harness.mediaPathRegistry.allowFile).toHaveBeenCalledWith(subPath);

        // 第二次命中同一 fileHash 的缓存时，仍重新读取最新时间微调，而不重复执行断句缓存构建
        vi.mocked(harness.srtTimeAdjustService.getByHash).mockResolvedValueOnce([]);
        const second = await harness.service.parseSrt(subPath);
        expect(second.fileHash).toBe(first.fileHash);
        expect(second.sentences[0].adjustedStart).toBeNull();
    });

    it('parseSrt 对非字幕扩展名路径拒绝读取，保护主进程读盘边界', async () => {
        const harness = createServiceHarness({ '/etc/passwd': 'root:x:0:0' });
        await expect(harness.service.parseSrt('/etc/passwd')).rejects.toThrow();
    });

    it('parseSrtForPlayback 自动从 ASR 轨道升级到同目录作者英文字幕，并在视频失效/缺失时返回 null', async () => {
        const asrPath = '/media/ep1/video.en-orig.srt';
        const authorPath = '/media/ep1/video.en.srt';
        const harness = createServiceHarness(
            { [asrPath]: SAMPLE_SRT, [authorPath]: SAMPLE_SRT },
            { '/media/ep1': ['video.en-orig.srt', 'video.en.srt'] },
        );

        // 未激活该视频的会话应被忽略
        expect(await harness.service.parseSrtForPlayback(asrPath, 'video-1', 'sess-1')).toBeNull();

        harness.service.activatePlaybackVideo('video-1');
        // 空路径或磁盘已删除的文件视为无字幕
        expect(await harness.service.parseSrtForPlayback(null, 'video-1', 'sess-1')).toBeNull();
        expect(await harness.service.parseSrtForPlayback('/media/ep1/missing.srt', 'video-1', 'sess-2')).toBeNull();

        const loaded = await harness.service.parseSrtForPlayback(asrPath, 'video-1', 'sess-3');
        expect(loaded?.filePath).toBe(authorPath);
    });

    it('matchVocabulary 在活跃会话返回命中 lemma，并在切换视频或取消时安全返回 cancelled=true', async () => {
        const subPath = '/media/demo/vocab.srt';
        const harness = createServiceHarness({ [subPath]: SAMPLE_SRT });

        harness.service.activatePlaybackVideo('video-1');
        const parsed = await harness.service.parseSrtForPlayback(subPath, 'video-1', 'sess-1');
        expect(parsed).not.toBeNull();

        const matched = await harness.service.matchVocabulary(parsed!.fileHash, 'video-1', 'sess-1');
        expect(matched).toMatchObject({
            videoId: 'video-1',
            playbackSessionId: 'sess-1',
            fileHash: parsed!.fileHash,
            vocabularyWords: ['run'],
            wordStates: { run: 'learning' },
            cancelled: false,
        });

        // 会话已被替代时返回 cancelled=true，而不是抛错打断播放
        const stale = await harness.service.matchVocabulary(parsed!.fileHash, 'video-1', 'sess-old');
        expect(stale).toMatchObject({
            cancelled: true,
            vocabularyWords: [],
            wordStates: {},
        });
    });

    it('parseStructs 按与字幕一致的分词器抽取英文单词与 lemma', () => {
        const harness = createServiceHarness({});
        const [struct] = harness.service.parseStructs(['Those dogs were running quickly.']);

        expect(struct.original).toBe('Those dogs were running quickly.');
        const words = struct.blocks.flatMap((b) => b.blockParts).filter((part) => part.isWord);
        expect(words.map((w) => w.content.toLowerCase())).toEqual(['those', 'dogs', 'were', 'running', 'quickly']);
        expect(words.find((w) => w.content === 'dogs')?.lemma).toBe('dog');
        expect(words.find((w) => w.content === 'running')?.lemma).toBe('run');
    });
});
