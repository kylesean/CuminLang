import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import '@/frontend/i18n';

import FileSelector, { FileAction } from '../FileSelector';
import { fileBrowserApi } from '@/frontend/features/file-browser/fileBrowserApi';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';

vi.mock('react-hot-toast', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('@/frontend/features/file-browser/fileBrowserApi', () => ({
    fileBrowserApi: {
        selectFiles: vi.fn(),
        attachSubtitle: vi.fn(),
        createWatchHistory: vi.fn(),
        changeWindowSize: vi.fn(),
    },
}));

describe('FileSelector & FileAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        usePlaybackSession.getState().clear();
    });

    it('未打开视频时选择外挂字幕会提示先打开视频而不静默忽略', async () => {
        const navigate = vi.fn();
        await FileAction.playerAction2(navigate)(['/tmp/sub.srt']);

        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(fileBrowserApi.attachSubtitle).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('createWatchHistory 未返回有效 id 时提示打开失败且不跳转播放页', async () => {
        vi.mocked(fileBrowserApi.createWatchHistory).mockResolvedValueOnce([]);
        const navigate = vi.fn();

        await FileAction.playerAction2(navigate)(['/tmp/broken.mp4']);

        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(fileBrowserApi.changeWindowSize).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('点击打开文件发生异常时通过 toast.error 暴露错误', async () => {
        vi.mocked(fileBrowserApi.selectFiles).mockRejectedValueOnce(new Error('picker crashed'));
        render(<FileSelector onSelected={async () => undefined} />);

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('picker crashed');
        });
    });
});
