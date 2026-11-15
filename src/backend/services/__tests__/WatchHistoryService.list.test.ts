import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';

import { createMemoryDb, type MemoryDb } from '@/test/database';
import { MemoryFileSystemGateway } from '@/test/memory-file-system-gateway';
import { WatchHistoryServiceImpl } from '@/backend/services/WatchHistoryService';
import WatchHistoryRepositoryImpl from '@/backend/infrastructure/db/repositories/WatchHistoryRepositoryImpl';
import WatchHistoryExtRepositoryImpl from '@/backend/infrastructure/db/repositories/WatchHistoryExtRepositoryImpl';
import { WatchHistoryProjectType } from '@/backend/services/repositories/WatchHistoryRepository';
import { StorageDirectoryTarget } from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import type StorageDirectoryProvider from '@/backend/services/gateways/storage/StorageDirectoryProvider';
import type MediaService from '@/backend/services/MediaService';
import type RendererGateway from '@/backend/services/gateways/renderer/RendererGateway';
import type SubtitleService from '@/backend/services/SubtitleService';
import type MediaPathRegistry from '@/backend/services/MediaPathRegistry';

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

const LIBRARY_ROOT = path.join('/', 'library');
const VIDEOS = path.join(LIBRARY_ROOT, 'videos');

const createProvider = (): StorageDirectoryProvider => ({
    provideDirectory: vi.fn(async (target: StorageDirectoryTarget) => {
        if (target === StorageDirectoryTarget.VIDEOS) return VIDEOS;
        if (target === StorageDirectoryTarget.LIBRARY_ROOT) return LIBRARY_ROOT;
        return path.join(LIBRARY_ROOT, String(target));
    }),
    ensurePathAccessPermissionIfExists: vi.fn(async () => undefined),
} as unknown as StorageDirectoryProvider);

describe('WatchHistoryService 批量读取与列表归并', () => {
    let memoryDb: MemoryDb;
    let gateway: MemoryFileSystemGateway;
    let watchHistoryRepo: WatchHistoryRepositoryImpl;
    let watchHistoryExtRepo: WatchHistoryExtRepositoryImpl;
    let service: WatchHistoryServiceImpl;

    beforeEach(async () => {
        memoryDb = createMemoryDb();
        gateway = new MemoryFileSystemGateway();
        watchHistoryRepo = new WatchHistoryRepositoryImpl(memoryDb.db);
        watchHistoryExtRepo = new WatchHistoryExtRepositoryImpl(memoryDb.db);

        const mediaService = {
            duration: vi.fn(async () => 120),
        } as unknown as MediaService;
        const rendererGateway = {
            send: vi.fn(),
        } as unknown as RendererGateway;
        const subtitleService = {} as unknown as SubtitleService;
        const mediaPathRegistry = {
            allowFile: vi.fn(),
            allowPaths: vi.fn(),
        } as unknown as MediaPathRegistry;

        service = new WatchHistoryServiceImpl(
            createProvider(),
            mediaService,
            rendererGateway,
            watchHistoryRepo,
            watchHistoryExtRepo,
            gateway,
            subtitleService,
            mediaPathRegistry,
        );
        await gateway.ensureDirectory(VIDEOS);
    });

    afterEach(() => {
        memoryDb.close();
    });

    it('根列表同时合并单文件、多文件夹最新代表项以及批量扩展字段', async () => {
        const folderA = path.join(LIBRARY_ROOT, 'series-a');
        const folderB = path.join(LIBRARY_ROOT, 'series-b');
        await gateway.ensureDirectory(folderA);
        await gateway.ensureDirectory(folderB);
        await gateway.writeTextFile(path.join(VIDEOS, 'solo.mp4'), 'v');
        await gateway.writeTextFile(path.join(folderA, 'ep1.mp4'), 'v');
        await gateway.writeTextFile(path.join(folderA, 'ep2.mp4'), 'v');
        await gateway.writeTextFile(path.join(folderB, 'ep1.mp4'), 'v');

        const solo = await watchHistoryRepo.insert({
            id: 'solo-id',
            base_path: VIDEOS,
            file_name: 'solo.mp4',
            project_type: WatchHistoryProjectType.FILE,
            current_position: 12,
            updated_at: '2026-01-01T10:00:00.000Z',
        });
        await watchHistoryRepo.insert({
            id: 'a-1',
            base_path: folderA,
            file_name: 'ep1.mp4',
            project_type: WatchHistoryProjectType.DIRECTORY,
            current_position: 0,
            updated_at: '2026-01-02T10:00:00.000Z',
        });
        const folderALatest = await watchHistoryRepo.insert({
            id: 'a-2',
            base_path: folderA,
            file_name: 'ep2.mp4',
            project_type: WatchHistoryProjectType.DIRECTORY,
            current_position: 45,
            updated_at: '2026-01-03T10:00:00.000Z',
        });
        await watchHistoryRepo.insert({
            id: 'b-1',
            base_path: folderB,
            file_name: 'ep1.mp4',
            project_type: WatchHistoryProjectType.DIRECTORY,
            current_position: 5,
            updated_at: '2026-01-04T10:00:00.000Z',
        });

        await watchHistoryExtRepo.upsert(solo.id, {
            podcast_mode_user_set: true,
            podcast_mode_manual: true,
        });
        await watchHistoryExtRepo.upsert(folderALatest.id, {
            podcast_mode_user_set: true,
            podcast_mode_manual: false,
        });

        const items = await service.listBasic('');

        expect(items.map((item) => item.id)).toEqual(['b-1', 'a-2', 'solo-id']);
        expect(items.find((item) => item.id === 'a-2')).toMatchObject({
            isFolder: true,
            displayFileName: 'series-a',
            podcastModeUserSet: true,
            podcastModeManual: false,
        });
        expect(items.find((item) => item.id === 'solo-id')).toMatchObject({
            isFolder: false,
            podcastModeUserSet: true,
            podcastModeManual: true,
        });
    });

    it('按文件夹列出时只返回该目录文件且附带扩展偏好', async () => {
        const folder = path.join(LIBRARY_ROOT, 'course');
        await gateway.ensureDirectory(folder);
        await gateway.writeTextFile(path.join(folder, 'b-lesson.mp4'), 'v');
        await gateway.writeTextFile(path.join(folder, 'a-lesson.mp4'), 'v');

        await watchHistoryRepo.insert({
            id: 'c-b',
            base_path: folder,
            file_name: 'b-lesson.mp4',
            project_type: WatchHistoryProjectType.DIRECTORY,
            current_position: 0,
            updated_at: '2026-01-01T10:00:00.000Z',
        });
        await watchHistoryRepo.insert({
            id: 'c-a',
            base_path: folder,
            file_name: 'a-lesson.mp4',
            project_type: WatchHistoryProjectType.DIRECTORY,
            current_position: 10,
            updated_at: '2026-01-02T10:00:00.000Z',
        });
        await watchHistoryExtRepo.upsert('c-a', {
            podcast_mode_user_set: true,
            podcast_mode_manual: true,
        });

        const items = await service.listBasic(folder);

        expect(items.map((item) => item.id)).toEqual(['c-a', 'c-b']);
        expect(items[0].podcastModeManual).toBe(true);
    });
});
