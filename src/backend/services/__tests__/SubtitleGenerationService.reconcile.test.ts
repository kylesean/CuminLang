import { describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import path from 'node:path';
import type DpTaskService from '@/backend/services/DpTaskService';
import type FfmpegService from '@/backend/services/FfmpegService';
import type SubtitleAssetMigrationService from '@/backend/services/SubtitleAssetMigrationService';
import { SubtitleGenerationServiceImpl } from '@/backend/services/SubtitleGenerationService';
import type TranscriptionEngineSelector from '@/backend/services/TranscriptionEngineSelector';
import type WatchHistoryService from '@/backend/services/WatchHistoryService';
import type { SettingsStore } from '@/backend/services/gateways/SettingsStore';
import type SpeechRecognitionGateway from '@/backend/services/gateways/media/SpeechRecognitionGateway';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type FileSystemGateway from '@/backend/services/gateways/storage/FileSystemGateway';
import type StorageDirectoryProvider from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import type LocalModelService from '@/backend/services/models/LocalModelService';
import type { SubtitleResolution } from '@/common/contracts/subtitle-resolution';

const VIDEO_PATH = '/media/talk.mp4';
const AUTHOR_SRT_PATH = '/media/talk.en.srt';
const LOCAL_SRT_PATH = '/media/talk.local.srt';
const EDITED_SRT_PATH = '/media/talk.edited.srt';

const AUTHOR_SRT_CONTENT = [
    '1',
    '00:00:00,500 --> 00:00:03,800',
    'Thank you, President Jahanian.',
    '',
].join('\n');

function createHarness(options?: {
    files?: Record<string, string>;
    autoRefineSetting?: string;
    modelReady?: boolean;
    activeSubtitlePath?: string;
}) {
    const files = new Map<string, string>(Object.entries(options?.files ?? {}));
    const finishedResolvers: Array<() => void> = [];
    const onAllFinished = new Promise<void>((resolve) => {
        finishedResolvers.push(resolve);
    });

    const dpTaskService = {
        create: vi.fn(async () => 42),
        registerTask: vi.fn(),
        checkCancel: vi.fn(),
        process: vi.fn(),
        update: vi.fn(),
        cancel: vi.fn(),
        finish: vi.fn(() => {
            finishedResolvers.forEach((resolve) => resolve());
        }),
        fail: vi.fn(() => {
            finishedResolvers.forEach((resolve) => resolve());
        }),
    } as unknown as DpTaskService;

    const watchHistoryService = {
        videoPath: vi.fn(async () => VIDEO_PATH),
        playerSubtitle: vi.fn(async (): Promise<SubtitleResolution> => ({
            subtitlePath: options?.activeSubtitlePath ?? AUTHOR_SRT_PATH,
            mismatchSuspected: false,
        })),
        attachSrt: vi.fn(async () => undefined),
    } as unknown as WatchHistoryService;

    const ffmpegService = {
        duration: vi.fn(async () => 10),
        createRecognitionWavChunks: vi.fn(async () => ['/tmp/chunk0.wav']),
    } as unknown as FfmpegService;

    const speechGateway: SpeechRecognitionGateway = {
        transcribe: vi.fn(async () => ({
            text: 'Thank you President Johanyan.',
            tokens: [
                { text: ' Thank', start: 0.4 },
                { text: ' you', start: 0.7 },
                { text: ' President', start: 1.0 },
                { text: ' Johanyan.', start: 1.6 },
            ],
        })),
        cancelActive: vi.fn(),
    };

    const engineSelector = {
        currentEngine: vi.fn(() => 'parakeet' as const),
        select: vi.fn(() => speechGateway),
    } as unknown as TranscriptionEngineSelector;

    const storageDirectoryProvider = {
        provideDirectory: vi.fn(async () => '/tmp/app'),
    } as unknown as StorageDirectoryProvider;

    const fileSystemGateway = {
        fileExists: vi.fn(async (target: string) => files.has(path.normalize(target))),
        readTextFile: vi.fn(async (target: string) => {
            const content = files.get(path.normalize(target));
            if (content === undefined) {
                throw new Error(`Missing file: ${target}`);
            }
            return content;
        }),
        writeTextFile: vi.fn(async (target: string, content: string) => {
            files.set(path.normalize(target), content);
        }),
        listFileNames: vi.fn(async (dir: string) => {
            const prefix = `${path.normalize(dir)}/`;
            return Array.from(files.keys())
                .filter((filePath) => filePath.startsWith(prefix))
                .map((filePath) => filePath.slice(prefix.length));
        }),
        removeDirectoryIfExists: vi.fn(async () => undefined),
    } as unknown as FileSystemGateway;

    const migrateTrackAssets = vi.fn(async () => ({
        savedSentencesMoved: 1,
        studyNotesMoved: 0,
        practiceRecordsMoved: 0,
    }));
    const assetMigrationService = { migrateTrackAssets } as unknown as SubtitleAssetMigrationService;

    const fireAndForget = vi.fn();
    const rendererGateway = { fireAndForget, call: vi.fn() } as unknown as RendererGateway;

    const settingsStore = {
        get: vi.fn((key: string) => (
            key === 'subtitle.autoRefineWithLocalAsr'
                ? (options?.autoRefineSetting ?? 'true')
                : ''
        )),
    } as unknown as SettingsStore;

    const parakeetModelService = {
        getStatus: vi.fn(async () => ({ ready: options?.modelReady ?? true })),
    } as unknown as LocalModelService;

    const whisperCppModelService = {
        getStatus: vi.fn(async () => ({ ready: false })),
    } as unknown as LocalModelService;

    const service = new SubtitleGenerationServiceImpl(
        dpTaskService,
        watchHistoryService,
        ffmpegService,
        engineSelector,
        storageDirectoryProvider,
        fileSystemGateway,
        assetMigrationService,
        rendererGateway,
        settingsStore,
        parakeetModelService,
        whisperCppModelService,
    );

    return {
        service,
        files,
        onAllFinished,
        dpTaskService,
        watchHistoryService,
        migrateTrackAssets,
        fireAndForget,
        speechGateway,
    };
}

describe('SubtitleGenerationService reconciliation & auto-refine', () => {
    it('重生成时执行音文对账、保留高精度人名并迁移学习资产到 .local.srt', async () => {
        const harness = createHarness({
            files: { [AUTHOR_SRT_PATH]: AUTHOR_SRT_CONTENT },
            activeSubtitlePath: AUTHOR_SRT_PATH,
        });

        await harness.service.start('video-1', { regenerate: true });
        await harness.onAllFinished;

        expect(harness.dpTaskService.fail).not.toHaveBeenCalled();
        const writtenLocalSrt = harness.files.get(LOCAL_SRT_PATH);
        expect(writtenLocalSrt).toBeDefined();
        expect(writtenLocalSrt).toContain('Jahanian');
        expect(harness.migrateTrackAssets).toHaveBeenCalledWith(expect.objectContaining({
            oldSentences: expect.arrayContaining([
                expect.objectContaining({ contentEn: 'Thank you, President Jahanian.' }),
            ]),
            newSentences: expect.arrayContaining([
                expect.objectContaining({ contentEn: expect.stringContaining('Jahanian') }),
            ]),
        }));
        expect(harness.watchHistoryService.attachSrt).toHaveBeenCalledWith(VIDEO_PATH, LOCAL_SRT_PATH);
        expect(harness.fireAndForget).not.toHaveBeenCalled();
    });

    it.each< {
        name: string;
        autoRefineSetting: string;
        modelReady: boolean;
        files: Record<string, string>;
        resolution: SubtitleResolution;
    } >([
        {
            name: '关闭后台自动精修设置时跳过',
            autoRefineSetting: 'false',
            modelReady: true,
            files: { [AUTHOR_SRT_PATH]: AUTHOR_SRT_CONTENT },
            resolution: { subtitlePath: AUTHOR_SRT_PATH, mismatchSuspected: false, origin: 'author' as const },
        },
        {
            name: '当前激活轨已为 L3 人工编辑轨时跳过',
            autoRefineSetting: 'true',
            modelReady: true,
            files: { [AUTHOR_SRT_PATH]: AUTHOR_SRT_CONTENT, [EDITED_SRT_PATH]: AUTHOR_SRT_CONTENT },
            resolution: { subtitlePath: EDITED_SRT_PATH, mismatchSuspected: false, origin: 'user_edited' as const },
        },
        {
            name: '即使当前激活轨为 L1，只要同目录存在 .edited.srt 也绝不触发',
            autoRefineSetting: 'true',
            modelReady: true,
            files: { [AUTHOR_SRT_PATH]: AUTHOR_SRT_CONTENT, [EDITED_SRT_PATH]: AUTHOR_SRT_CONTENT },
            resolution: { subtitlePath: AUTHOR_SRT_PATH, mismatchSuspected: false, origin: 'author' as const },
        },
        {
            name: '同目录已存在 .local.srt 时跳过',
            autoRefineSetting: 'true',
            modelReady: true,
            files: { [AUTHOR_SRT_PATH]: AUTHOR_SRT_CONTENT, [LOCAL_SRT_PATH]: AUTHOR_SRT_CONTENT },
            resolution: { subtitlePath: AUTHOR_SRT_PATH, mismatchSuspected: false, origin: 'author' as const },
        },
        {
            name: '本地识别模型尚未下载就绪时跳过',
            autoRefineSetting: 'true',
            modelReady: false,
            files: { [AUTHOR_SRT_PATH]: AUTHOR_SRT_CONTENT },
            resolution: { subtitlePath: AUTHOR_SRT_PATH, mismatchSuspected: false, origin: 'author' as const },
        },
    ])('scheduleAutoRefine 守护条件：$name', async ({ autoRefineSetting, modelReady, files, resolution }) => {
        const harness = createHarness({ autoRefineSetting, modelReady, files });

        await harness.service.scheduleAutoRefine('video-1', resolution);

        expect(harness.dpTaskService.create).not.toHaveBeenCalled();
        expect(harness.speechGateway.transcribe).not.toHaveBeenCalled();
    });

    it('仅含外部字幕且本地模型就绪时，后台静默生成 .local.srt 并推送热切换事件且会话内只触发一次', async () => {
        const harness = createHarness({
            autoRefineSetting: 'true',
            modelReady: true,
            files: { [AUTHOR_SRT_PATH]: AUTHOR_SRT_CONTENT },
            activeSubtitlePath: AUTHOR_SRT_PATH,
        });

        await harness.service.scheduleAutoRefine('video-1', {
            subtitlePath: AUTHOR_SRT_PATH,
            mismatchSuspected: false,
            origin: 'auto_asr',
        });
        await harness.onAllFinished;

        // 同一视频在同一会话中第二次调度必须幂等跳过
        await harness.service.scheduleAutoRefine('video-1', {
            subtitlePath: AUTHOR_SRT_PATH,
            mismatchSuspected: false,
            origin: 'auto_asr',
        });

        expect(harness.dpTaskService.fail).not.toHaveBeenCalled();
        expect(harness.dpTaskService.create).toHaveBeenCalledTimes(1);
        expect(harness.files.has(LOCAL_SRT_PATH)).toBe(true);
        expect(harness.fireAndForget).toHaveBeenCalledWith('subtitle/track-refined', {
            videoId: 'video-1',
            subtitlePath: LOCAL_SRT_PATH,
        });
    });
});
