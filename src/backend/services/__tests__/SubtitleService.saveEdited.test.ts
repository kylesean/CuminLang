import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import type CacheService from '@/backend/services/CacheService';
import type MediaPathRegistry from '@/backend/services/MediaPathRegistry';
import type SrtTimeAdjustService from '@/backend/services/SrtTimeAdjustService';
import type SubtitleAssetMigrationService from '@/backend/services/SubtitleAssetMigrationService';
import { SubtitleServiceImpl } from '@/backend/services/SubtitleService';
import type { SubtitleVocabularyAnalysisService } from '@/backend/services/SubtitleVocabularyAnalysisService';
import type FileSystemGateway from '@/backend/services/gateways/storage/FileSystemGateway';
import type StorageDirectoryProvider from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import { ObjUtil } from '@/backend/utils/ObjUtil';

function createHarness(initialFiles: Record<string, string>) {
    const files = new Map<string, string>(
        Object.entries(initialFiles).map(([k, v]) => [path.normalize(k), v]),
    );
    const cache = new Map<string, unknown>();

    const srtTimeAdjustService = {
        getByHash: vi.fn(async () => []),
    } as unknown as SrtTimeAdjustService;

    const cacheService = {
        get: vi.fn((ns: string, key: string) => cache.get(`${ns}:${key}`) ?? null),
        set: vi.fn((ns: string, key: string, val: unknown) => {
            cache.set(`${ns}:${key}`, val);
        }),
    } as unknown as CacheService;

    const vocabularyAnalysisService = {
        analyze: vi.fn(),
        cancelActive: vi.fn(),
        invalidate: vi.fn(),
    } as unknown as SubtitleVocabularyAnalysisService;

    const storageDirectoryProvider = {
        ensurePathAccessPermissionIfExists: vi.fn(async () => undefined),
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
    } as unknown as FileSystemGateway;

    const mediaPathRegistry = {
        allowFile: vi.fn(),
    } as unknown as MediaPathRegistry;

    const migrateTrackAssets = vi.fn(async () => ({
        savedSentencesMoved: 1,
        studyNotesMoved: 1,
        practiceRecordsMoved: 0,
    }));
    const assetMigrationService = { migrateTrackAssets } as unknown as SubtitleAssetMigrationService;

    const service = new SubtitleServiceImpl(
        srtTimeAdjustService,
        cacheService,
        vocabularyAnalysisService,
        storageDirectoryProvider,
        fileSystemGateway,
        mediaPathRegistry,
        assetMigrationService,
    );

    return { service, files, migrateTrackAssets };
}

describe('SubtitleService.saveEditedTrack', () => {
    const originalL1 = [
        '1',
        '00:00:01,000 --> 00:00:03,000',
        'Hello world today.',
        '',
    ].join('\n');

    it('writes L3 .edited.srt preserving exact lines, migrates learning assets, and tokenizes words', async () => {
        const videoPath = '/media/talk.mp4';
        const sourcePath = '/media/talk.en.srt';
        const editedPath = '/media/talk.edited.srt';
        const harness = createHarness({ [sourcePath]: originalL1 });

        const saved = await harness.service.saveEditedTrack({
            videoPath,
            sourceSubtitlePath: sourcePath,
            oldFileHash: ObjUtil.hash(originalL1),
            lines: [
                { start: 1, end: 2, contentEn: 'Hello', contentZh: '你好' },
                { start: 2, end: 3, contentEn: 'world today.' },
            ],
        });

        expect(saved.filePath).toBe(path.normalize(editedPath));
        expect(saved.sentences.map((s) => s.text)).toEqual(['Hello', 'world today.']);
        expect(saved.sentences[0].struct.blocks.length).toBeGreaterThan(0);

        const persistedContent = harness.files.get(path.normalize(editedPath))!;
        expect(persistedContent).toContain('Hello');
        expect(persistedContent).toContain('world today.');

        expect(harness.migrateTrackAssets).toHaveBeenCalledWith(expect.objectContaining({
            oldFileHash: ObjUtil.hash(originalL1),
            newFileHash: saved.fileHash,
            oldSentences: [expect.objectContaining({ contentEn: 'Hello world today.' })],
            newSentences: [
                expect.objectContaining({ contentEn: 'Hello' }),
                expect.objectContaining({ contentEn: 'world today.' }),
            ],
        }));
    });

    it('snapshots previous .edited.srt before overwriting so repeated edits still migrate assets cleanly', async () => {
        const editedPath = '/media/talk.edited.srt';
        const v1Content = [
            '1',
            '00:00:01,000 --> 00:00:03,000',
            'First edited sentence.',
            '',
        ].join('\n');
        const harness = createHarness({ [editedPath]: v1Content });

        const saved = await harness.service.saveEditedTrack({
            videoPath: '/media/talk.mp4',
            sourceSubtitlePath: editedPath,
            lines: [
                { start: 1, end: 3, contentEn: 'Second edited sentence.' },
            ],
        });

        expect(saved.fileHash).not.toBe(ObjUtil.hash(v1Content));
        expect(harness.migrateTrackAssets).toHaveBeenCalledWith(expect.objectContaining({
            oldFileHash: ObjUtil.hash(v1Content),
            newFileHash: saved.fileHash,
            oldSentences: [expect.objectContaining({ contentEn: 'First edited sentence.' })],
            newSentences: [expect.objectContaining({ contentEn: 'Second edited sentence.' })],
        }));
    });
});
