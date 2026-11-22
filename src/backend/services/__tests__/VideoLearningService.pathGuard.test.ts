import { describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

import { VideoLearningServiceImpl } from '@/backend/services/VideoLearningService';
import MediaPathRegistry from '@/backend/services/MediaPathRegistry';
import type CacheService from '@/backend/services/CacheService';
import type FfmpegService from '@/backend/services/FfmpegService';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type FileSystemGateway from '@/backend/services/gateways/storage/FileSystemGateway';
import type StorageDirectoryProvider from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import { StorageDirectoryTarget } from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import type { ClipOssService } from '@/backend/services/OssService';
import type SubtitleService from '@/backend/services/SubtitleService';
import type { SubtitleVocabularyAnalysisService } from '@/backend/services/SubtitleVocabularyAnalysisService';
import type VideoLearningClipRepository from '@/backend/services/repositories/VideoLearningClipRepository';
import type VideoLearningClipWordRepository from '@/backend/services/repositories/VideoLearningClipWordRepository';
import type { WordMatchService } from '@/backend/services/WordMatchService';

describe('VideoLearningService 媒体路径守卫', () => {
    it('autoClip 与 detectClipStatus 拒绝库外未授权路径与协议前缀', async () => {
        const cacheGet = vi.fn(() => null);
        const ffmpegTrim = vi.fn();
        const registry = new MediaPathRegistry();
        const storageProvider = {
            provideDirectory: vi.fn(async (target: StorageDirectoryTarget) =>
                target === StorageDirectoryTarget.LIBRARY_ROOT ? '/library' : '/library/temp'),
            ensurePathAccessPermissionIfExists: vi.fn(async () => undefined),
        } as unknown as StorageDirectoryProvider;

        const service = new VideoLearningServiceImpl(
            {} as unknown as ClipOssService,
            { get: cacheGet } as unknown as CacheService,
            storageProvider,
            {} as unknown as FileSystemGateway,
            { trimVideo: ffmpegTrim } as unknown as FfmpegService,
            { send: vi.fn() } as unknown as RendererGateway,
            {} as unknown as WordMatchService,
            {} as unknown as SubtitleService,
            {} as unknown as VideoLearningClipRepository,
            {} as unknown as VideoLearningClipWordRepository,
            {} as unknown as SubtitleVocabularyAnalysisService,
            registry,
        );

        await expect(service.autoClip('/outside/secret.mp4', 'srt-key')).rejects.toThrow('媒体路径未授权');
        await expect(service.autoClip('http://example.com/a.mp4', 'srt-key')).rejects.toThrow('媒体路径未授权');
        await expect(service.detectClipStatus('/outside/secret.mp4', 'srt-key')).rejects.toThrow('媒体路径未授权');
        expect(cacheGet).not.toHaveBeenCalled();
        expect(ffmpegTrim).not.toHaveBeenCalled();
    });
});
