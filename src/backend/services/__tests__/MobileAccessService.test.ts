import { beforeEach, describe, expect, it, vi } from 'vitest';

let nextStartHook: (() => Promise<void>) | null = null;

const serverInstances: Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    setToken: ReturnType<typeof vi.fn>;
    tokenHistory: string[];
}> = [];

vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>();
    return {
        ...actual,
        default: { ...actual, existsSync: vi.fn().mockReturnValue(true) },
        existsSync: vi.fn().mockReturnValue(true),
    };
});

vi.mock('@/backend/infrastructure/logger', () => ({
    getMainLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/backend/utils/runtimeEnv', () => ({
    getRuntimeResourcePath: () => '/virtual/resources/mobile',
    isDevelopmentMode: () => true,
}));

vi.mock('@/backend/infrastructure/mobile/MobileWebServer', () => ({
    ClientRequestError: class ClientRequestError extends Error {
        public readonly status: number;
        constructor(message: string, status = 400) {
            super(message);
            this.status = status;
        }
    },
    default: class MockMobileWebServer {
        public start = vi.fn(() => (nextStartHook ? nextStartHook() : Promise.resolve()));
        public stop = vi.fn().mockResolvedValue(undefined);
        public tokenHistory: string[];
        public setToken = vi.fn((t: string) => {
            this.tokenHistory.push(t);
        });
        constructor(options: { token: string }) {
            this.tokenHistory = [options.token];
            serverInstances.push(this);
        }
    },
}));

import { MobileAccessServiceImpl } from '@/backend/services/MobileAccessService';
import type { SettingsStore } from '@/backend/services/gateways/SettingsStore';
import type WatchHistoryService from '@/backend/services/WatchHistoryService';
import type SubtitleService from '@/backend/services/SubtitleService';
import type TranslateService from '@/backend/services/TranslateService';
import type MediaService from '@/backend/services/MediaService';
import type SubtitleTranslationService from '@/backend/services/subtitle-translation/SubtitleTranslationService';

describe('MobileAccessService 生命周期串行化', () => {
    let settingsMap: Map<string, string>;
    let service: MobileAccessServiceImpl;

    beforeEach(() => {
        serverInstances.length = 0;
        settingsMap = new Map([
            ['mobileAccess.enabled', 'true'],
            ['mobileAccess.port', '27182'],
            ['mobileAccess.token', 'initial_token_at_least_32_characters_long'],
        ]);
        const settingsStore = {
            get: vi.fn((k: string) => settingsMap.get(k)),
            set: vi.fn((k: string, v: string) => {
                settingsMap.set(k, v);
                return true;
            }),
        } as unknown as SettingsStore;

        service = new MobileAccessServiceImpl(
            settingsStore,
            {} as WatchHistoryService,
            {} as SubtitleService,
            {} as TranslateService,
            {} as MediaService,
            {} as SubtitleTranslationService,
        );
    });

    it('start 期间调用 shutdown 必须停掉服务并避免孤儿监听', async () => {
        let releaseStart!: () => void;
        nextStartHook = () => new Promise<void>((resolve) => {
            releaseStart = resolve;
        });

        const startPromise = service.startFromSettings();
        await vi.waitFor(() => expect(serverInstances).toHaveLength(1));

        // start 尚未结束时触发 shutdown：disposed / lifecycleQueue 必须保证停掉该实例并保持 stopped
        const shutdownPromise = service.shutdown();
        nextStartHook = null;
        releaseStart();

        await Promise.all([startPromise, shutdownPromise]);

        expect(serverInstances[0].stop).toHaveBeenCalledTimes(1);
        expect(service.getDetail().running).toBe(false);
    });

    it('start 尚未落座前调用 regenerateToken，启动完成后应同步最新令牌', async () => {
        const startPromise = service.startFromSettings();
        const newToken = service.regenerateToken();
        await startPromise;

        const instance = serverInstances[0];
        expect(instance.tokenHistory[instance.tokenHistory.length - 1]).toBe(newToken);
    });

    it('默认仅绑定 127.0.0.1，显式切换为 lan 时绑定全部网卡并支持热切换', async () => {
        await service.startFromSettings();
        expect(serverInstances).toHaveLength(1);
        expect(serverInstances[0].start).toHaveBeenCalledWith(27182, '127.0.0.1');
        expect(service.getDetail().bindScope).toBe('loopback');
        expect(service.getDetail().lanUrls).toEqual([
            'http://127.0.0.1:27182/?t=initial_token_at_least_32_characters_long',
        ]);

        await service.saveSettings({ enabled: true, port: 27182, bindScope: 'lan' });
        expect(serverInstances).toHaveLength(2);
        expect(serverInstances[0].stop).toHaveBeenCalledTimes(1);
        expect(serverInstances[1].start).toHaveBeenCalledWith(27182, undefined);
        expect(service.getDetail().bindScope).toBe('lan');
        expect(settingsMap.get('mobileAccess.bindScope')).toBe('lan');
    });

    it('观看记录或视频文件不存在时 getWatchDetail / resolveVideoFile / getThumbnail 均应抛出 404 ClientRequestError', async () => {
        const notFoundService = new MobileAccessServiceImpl(
            {
                get: vi.fn((k: string) => settingsMap.get(k)),
                set: vi.fn(() => true),
            } as unknown as SettingsStore,
            {
                basicDetail: vi.fn().mockResolvedValue(null),
                videoPath: vi.fn().mockRejectedValue(new Error('观看记录不存在：missing-id')),
            } as unknown as WatchHistoryService,
            {} as SubtitleService,
            {} as TranslateService,
            {} as MediaService,
            {} as SubtitleTranslationService,
        );

        const dataSource = (notFoundService as unknown as {
            createDataSource: () => {
                getWatchDetail: (id: string) => Promise<unknown>;
                resolveVideoFile: (id: string) => Promise<string>;
                getThumbnail: (id: string) => Promise<string>;
                saveProgress: (id: string, position: number) => Promise<void>;
            };
        }).createDataSource();

        await expect(dataSource.getWatchDetail('missing-id')).rejects.toMatchObject({ status: 404 });
        await expect(dataSource.resolveVideoFile('missing-id')).rejects.toMatchObject({ status: 404 });
        await expect(dataSource.getThumbnail('missing-id')).rejects.toMatchObject({ status: 404 });
        await expect(dataSource.saveProgress('missing-id', 12)).rejects.toMatchObject({ status: 404 });
    });
});
