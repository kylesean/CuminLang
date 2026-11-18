import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SWRConfig } from 'swr';
import FolderPage from '@/frontend/features/file-browser/FolderPage';
import HomePage from '@/frontend/features/file-browser/HomePage';
import { fileBrowserApi } from '@/frontend/features/file-browser/fileBrowserApi';
import type WatchHistoryVO from '@/common/types/WatchHistoryVO';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/frontend/i18n', () => ({
    default: { t: (key: string) => key },
}));

vi.mock('@/frontend/components/layout/TitleBar/TitleBar', () => ({
    default: () => <div data-testid="mock-title-bar" />,
}));

vi.mock('@/frontend/components/layout/SideBar', () => ({
    default: () => <div data-testid="mock-sidebar" />,
}));

vi.mock('@/frontend/features/content-compass/ContentCompassSection', () => ({
    default: () => <div data-testid="mock-compass" />,
}));

vi.mock('@/frontend/features/youtube-import/YoutubeImportButton', () => ({
    default: () => <div data-testid="mock-yt-btn" />,
}));

vi.mock('@/frontend/features/youtube-import/YoutubeImportHero', () => ({
    default: () => <div data-testid="mock-yt-hero" />,
}));

vi.mock('@/frontend/features/file-browser/components/FolderSelector', () => ({
    default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    FolderSelectAction: { defaultAction2: () => vi.fn() },
}));

vi.mock('@/frontend/features/file-browser/components/FileSelector', () => ({
    default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    FileAction: { playerAction2: () => vi.fn() },
}));

vi.mock('@/frontend/hooks/useInView', () => ({
    default: () => false,
}));

vi.mock('@/frontend/features/file-browser/fileBrowserApi', () => ({
    fileBrowserApi: {
        changeWindowSize: vi.fn().mockResolvedValue(undefined),
        listBasicWatchHistory: vi.fn(),
        listWatchHistory: vi.fn(),
        listWatchHistoryByPath: vi.fn(),
        deleteWatchHistoryGroup: vi.fn().mockResolvedValue(undefined),
        getThumbnail: vi.fn().mockResolvedValue(''),
        openFolder: vi.fn().mockResolvedValue(undefined),
    },
}));

const FOLDER_PATH = '/videos/YouTube';

const makeVideo = (id: string, fileName: string, overrides: Partial<WatchHistoryVO> = {}): WatchHistoryVO => ({
    id,
    fileName,
    basePath: FOLDER_PATH,
    current_position: 0,
    duration: 100,
    isFolder: false,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
} as unknown as WatchHistoryVO);

const renderFolderPage = () => render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
        <MemoryRouter initialEntries={[`/folder/${encodeURIComponent(FOLDER_PATH)}`]}>
            <Routes>
                <Route path="/folder/:folderPath" element={<FolderPage />} />
            </Routes>
        </MemoryRouter>
    </SWRConfig>,
);

describe('FolderPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('列出目录下的全部视频，而不是只展示聚合卡片代表的那个', async () => {
        const videos = [
            makeVideo('a', 'alpha.mp4'),
            makeVideo('b', 'bravo.mp4'),
            makeVideo('c', 'charlie.mp4'),
        ];
        vi.mocked(fileBrowserApi.listWatchHistoryByPath).mockResolvedValue(videos);

        renderFolderPage();

        await waitFor(() => {
            expect(screen.getByTestId('watch-history-card-a')).toBeDefined();
        });
        expect(screen.getByTestId('watch-history-card-b')).toBeDefined();
        expect(screen.getByTestId('watch-history-card-c')).toBeDefined();
        // 路径经过 encodeURIComponent 编码后仍要原样传给后端
        expect(fileBrowserApi.listWatchHistoryByPath).toHaveBeenCalledWith(FOLDER_PATH);
    });

    it('目录为空时展示空态而不是报错', async () => {
        vi.mocked(fileBrowserApi.listWatchHistoryByPath).mockResolvedValue([]);

        renderFolderPage();

        await waitFor(() => {
            expect(screen.getByText('emptyFolder')).toBeDefined();
        });
    });
});

describe('HomePage 文件夹卡片跳转', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('点击聚合文件夹卡片进入列表页，而不是直接播放代表视频', async () => {
        const folderCard = makeVideo('folder-1', 'YouTube', {
            basePath: FOLDER_PATH,
            isFolder: true,
            displayFileName: 'YouTube',
        });
        vi.mocked(fileBrowserApi.listBasicWatchHistory).mockResolvedValue([folderCard]);
        vi.mocked(fileBrowserApi.listWatchHistory).mockResolvedValue([folderCard]);

        render(
            <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/']}>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/folder/:folderPath" element={<div data-testid="folder-page" />} />
                    </Routes>
                </MemoryRouter>
            </SWRConfig>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('watch-history-card-folder-1')).toBeDefined();
        });
        screen.getByTestId('watch-history-card-folder-1').click();

        await waitFor(() => {
            expect(screen.getByTestId('folder-page')).toBeDefined();
        });
        // 进列表页不应切换播放器窗口尺寸
        expect(fileBrowserApi.changeWindowSize).not.toHaveBeenCalledWith('player');
    });
});
