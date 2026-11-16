import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateWatchHistory = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/frontend/log/simple-logger', () => ({
    getRendererLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/frontend/features/file-browser/fileBrowserApi', () => ({
    fileBrowserApi: {
        createWatchHistory: (...args: unknown[]) => mockCreateWatchHistory(...args),
    },
}));

vi.mock('@/frontend/lib/swr-util', () => ({
    SWR_KEY: { PLAYER_P: 'PLAYER_P', WATCH_PROJECT_DETAIL: 'WATCH_PROJECT_DETAIL' },
    swrMutate: vi.fn().mockResolvedValue(undefined),
    swrApiMutate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-hot-toast', () => ({
    default: { error: (...args: unknown[]) => mockToastError(...args) },
    toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

import { FolderSelectAction } from '@/frontend/features/file-browser/components/FolderSelector';

describe('FolderSelectAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('目录内没有可播放媒体导致 createWatchHistory 返回空数组时，不触发跳转并提示用户', async () => {
        mockCreateWatchHistory.mockResolvedValue([]);
        const onSelected = vi.fn();

        await FolderSelectAction.defaultAction2(onSelected)('/tmp/empty-folder');

        expect(onSelected).not.toHaveBeenCalled();
        expect(mockToastError).toHaveBeenCalledTimes(1);
    });
});
