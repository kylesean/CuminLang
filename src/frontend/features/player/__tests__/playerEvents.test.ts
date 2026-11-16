import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetPlayerSubtitle,
    toastSuccess,
} = vi.hoisted(() => ({
    mockGetPlayerSubtitle: vi.fn(),
    toastSuccess: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
    toast: { success: toastSuccess, error: vi.fn() },
}));

vi.mock('@/frontend/log/simple-logger', () => ({
    getRendererLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/frontend/features/player/playerApi', () => ({
    playerApi: {
        getPlayerSubtitle: mockGetPlayerSubtitle,
    },
}));

vi.mock('@/frontend/i18n', () => ({
    default: {
        t: (key: string) => key,
    },
}));

import type { RendererApiDefinitions } from '@/common/api/renderer-api-def';
import type { SubtitleResolution } from '@/common/contracts/subtitle-resolution';
import { registerPlayerRendererApis } from '@/frontend/features/player/playerEvents';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';

type HandlerMap = {
    [K in keyof RendererApiDefinitions]?: (params: RendererApiDefinitions[K]['params']) => Promise<void> | void;
};

describe('playerEvents subtitle/track-refined', () => {
    let handlers: HandlerMap;

    beforeEach(() => {
        vi.clearAllMocks();
        handlers = {};
        usePlaybackSession.getState().clear();
        registerPlayerRendererApis(((channel, handler) => {
            handlers[channel] = handler as HandlerMap[typeof channel];
        }) as Parameters<typeof registerPlayerRendererApis>[0]);
    });

    it('忽略非当前播放视频的精修完成通知', async () => {
        usePlaybackSession.setState({
            videoId: 'video-active',
            subtitlePath: '/media/active.en.srt',
            subtitleReloadToken: 1,
        });

        await handlers['subtitle/track-refined']?.({
            videoId: 'video-other',
            subtitlePath: '/media/other.local.srt',
        });

        expect(mockGetPlayerSubtitle).not.toHaveBeenCalled();
        expect(usePlaybackSession.getState().subtitlePath).toBe('/media/active.en.srt');
        expect(usePlaybackSession.getState().subtitleReloadToken).toBe(1);
    });

    it('当前正在播放同一视频时，热更新字幕分辨率并触发无缝重载', async () => {
        usePlaybackSession.setState({
            videoId: 'video-1',
            subtitlePath: '/media/talk.en.srt',
            subtitleOrigin: 'auto_asr',
            subtitleReloadToken: 2,
        });

        const refinedResolution: SubtitleResolution = {
            subtitlePath: '/media/talk.local.srt',
            mismatchSuspected: false,
            origin: 'local_asr',
            tracks: [
                {
                    path: '/media/talk.local.srt',
                    fileName: 'talk.local.srt',
                    origin: 'local_asr',
                    active: true,
                },
                {
                    path: '/media/talk.en.srt',
                    fileName: 'talk.en.srt',
                    origin: 'auto_asr',
                    active: false,
                },
            ],
        };
        mockGetPlayerSubtitle.mockResolvedValue(refinedResolution);

        await handlers['subtitle/track-refined']?.({
            videoId: 'video-1',
            subtitlePath: '/media/talk.local.srt',
        });

        expect(mockGetPlayerSubtitle).toHaveBeenCalledWith('video-1');
        const session = usePlaybackSession.getState();
        expect(session.subtitlePath).toBe('/media/talk.local.srt');
        expect(session.subtitleOrigin).toBe('local_asr');
        expect(session.subtitleReloadToken).toBe(3);
        expect(toastSuccess).toHaveBeenCalledWith('player:subtitleOrigin.autoRefinedDone');
    });
});
