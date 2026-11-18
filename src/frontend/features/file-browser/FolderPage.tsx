import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { ChevronLeft, FolderOpen, RotateCcw } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { HStack } from '@astryxdesign/core/HStack';
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { toast } from 'react-hot-toast';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import TitleBar from '@/frontend/components/layout/TitleBar/TitleBar';
import { TITLE_BAR_HEIGHT } from '@/frontend/components/layout/TitleBar/titleBarMetrics';
import SideBar from '@/frontend/components/layout/SideBar';
import PageHeader from '@/frontend/components/shared/common/PageHeader';
import useLayout from '@/frontend/app/stores/layoutStore';
import ProjectListItem from '@/frontend/features/file-browser/components/project-list-item';
import { fileBrowserApi } from '@/frontend/features/file-browser/fileBrowserApi';
import { HomeLoadingSkeleton } from '@/frontend/components/shared/LoadingStates';
import { getRendererLogger } from '@/frontend/log/simple-logger';
import { useReviewDockStore } from '@/frontend/features/player/components/learning-toolbar/reviewDockStore';
import { apiPath } from '@/frontend/lib/swr-util';

const logger = getRendererLogger('FolderPage');

/**
 * 媒体库文件夹页：展开「最近观看」里聚合的目录，列出该目录下的全部视频。
 *
 * 首页根列表会把同一目录的视频聚合成一张文件夹卡片（见 `WatchHistoryService.listItems`
 * 的根列表分支）；没有这个页面时，用户点开卡片只能播放代表视频，其余视频无从访问。
 *
 * @returns 文件夹列表页 JSX 元素。
 */
const FolderPage = () => {
    const { t: tc } = useI18nTranslation('common');
    const { folderPath: encodedFolderPath } = useParams<{ folderPath?: string }>();
    const navigate = useNavigate();
    const changeSideBar = useLayout((s) => s.changeSideBar);
    const sidebarCollapsed = useLayout((s) => s.sidebarCollapsed);
    const navigatingRef = React.useRef(false);

    const folderPath = React.useMemo(() => {
        if (!encodedFolderPath) return '';
        try {
            return decodeURIComponent(encodedFolderPath);
        } catch {
            return encodedFolderPath;
        }
    }, [encodedFolderPath]);

    const { data: videos, error, isLoading, mutate } = useSWR(
        folderPath ? [apiPath('watch-history/list'), folderPath] : null,
        () => fileBrowserApi.listWatchHistoryByPath(folderPath),
        { revalidateOnMount: true, dedupingInterval: 0 },
    );

    React.useEffect(() => {
        changeSideBar(true);
    }, [changeSideBar]);

    const openVideo = React.useCallback(async (videoId: string) => {
        if (navigatingRef.current) return;
        navigatingRef.current = true;
        try {
            await fileBrowserApi.changeWindowSize('player');
            navigate(`/player/${videoId}`);
        } catch (err) {
            const dockState = useReviewDockStore.getState();
            if (dockState.requestId > dockState.consumedId && dockState.scope?.videoId === videoId) {
                dockState.consume(dockState.requestId);
                dockState.clearScope();
            }
            logger.warn('failed to open player', {
                videoId,
                error: err instanceof Error ? err.message : String(err),
            });
            toast.error(err instanceof Error ? err.message : tc('openMediaFailed'));
        } finally {
            navigatingRef.current = false;
        }
    }, [navigate, tc]);

    const goBack = React.useCallback(() => {
        navigate('/');
    }, [navigate]);

    const folderName = React.useMemo(() => {
        if (!folderPath) return '';
        const trimmed = folderPath.replace(/[\\/]+$/, '');
        const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
        return index >= 0 ? trimmed.slice(index + 1) : trimmed;
    }, [folderPath]);

    const count = Array.isArray(videos) ? videos.length : 0;

    return (
        <Layout
            height="fill"
            header={
                <LayoutHeader height={TITLE_BAR_HEIGHT} padding={0} hasDivider={false}>
                    <TitleBar maximizable={false} className="w-full" />
                </LayoutHeader>
            }
            start={
                <LayoutPanel
                    width={sidebarCollapsed ? 56 : 208}
                    padding={0}
                    hasDivider={false}
                    className="h-full overflow-hidden transition-[width] duration-200"
                >
                    <SideBar compact={sidebarCollapsed} />
                </LayoutPanel>
            }
            content={
                <LayoutContent isScrollable padding={6}>
                    {isLoading ? (
                        <HomeLoadingSkeleton />
                    ) : error ? (
                        <Center height="100%" minHeight={420}>
                            <VStack gap={3} hAlign="center">
                                <Text type="body" color="secondary">
                                    {tc('watchHistoryLoadFailed')}
                                </Text>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                                    label={tc('retry')}
                                    onClick={() => { void mutate(); }}
                                />
                            </VStack>
                        </Center>
                    ) : (
                        <VStack gap={5} width="100%">
                            <HStack vAlign="center" gap={2} width="100%" className="min-w-0">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<ChevronLeft className="h-4 w-4" />}
                                    label={tc('backToLibrary')}
                                    onClick={goBack}
                                />
                            </HStack>
                            <PageHeader
                                title={folderName}
                                description={tc('videoCount', { count })}
                                rightSlot={(
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        icon={<FolderOpen className="h-3.5 w-3.5" />}
                                        label={tc('showInExplorer')}
                                        onClick={() => {
                                            void fileBrowserApi.openFolder(folderPath).catch((err) => {
                                                toast.error(err instanceof Error ? err.message : String(err));
                                            });
                                        }}
                                    />
                                )}
                            />

                            {Array.isArray(videos) && count === 0 ? (
                                <Center minHeight={280}>
                                    <Text type="body" color="secondary">{tc('emptyFolder')}</Text>
                                </Center>
                            ) : (
                                <VStack gap={1} width="100%">
                                    {(videos ?? []).map((video) => (
                                        <ProjectListItem
                                            key={video.id}
                                            video={video}
                                            onSelected={() => { void openVideo(video.id); }}
                                        />
                                    ))}
                                </VStack>
                            )}
                        </VStack>
                    )}
                </LayoutContent>
            }
        />
    );
};

export default FolderPage;
