import React from 'react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { BrandLogo } from '@/frontend/components/shared/BrandLogo';

/**
 * 顶层启动门控与整页切换兜底态：
 * 使用品牌标识搭配 Astryx Spinner 与状态说明，取代过去孤立小图标带来的大面积空白感。
 */
export const StartupLoading: React.FC = () => {
    const { t } = useI18nTranslation('common');
    const label = t('loading');

    return (
        <Center height="fill" className="w-full h-full px-6">
            <Card variant="muted" padding={6} className="w-full max-w-xs">
                <VStack gap={4} hAlign="center" width="100%" role="status" aria-label={label}>
                    <BrandLogo variant="lockup" size="lg" decorative />
                    <HStack gap={2} vAlign="center">
                        <Spinner size="lg" />
                        <Text size="sm" color="secondary">
                            {label}
                        </Text>
                    </HStack>
                </VStack>
            </Card>
        </Center>
    );
};

/**
 * 工作区内容区（AppShell 右侧主画布）路由懒加载骨架：
 * 保持左侧主导航常驻稳定，右侧用 Astryx 错峰骨架贴合真实页头与内容卡片节奏。
 */
export const WorkspaceContentSkeleton: React.FC = () => {
    const { t } = useI18nTranslation('common');

    return (
        <div
            role="status"
            aria-label={t('loading')}
            className="h-full w-full overflow-hidden p-6"
            data-testid="workspace-loading-skeleton"
        >
            <VStack gap={6} width="100%" maxWidth={960} className="mx-auto">
                <VStack gap={2} width="100%">
                    <Skeleton height={24} width={180} radius={2} index={0} />
                    <Skeleton height={14} width={300} radius={2} index={1} />
                </VStack>
                <Card variant="transparent" padding={4} width="100%">
                    <VStack gap={4} width="100%">
                        {[0, 1, 2].map((row) => (
                            <HStack key={row} hAlign="between" vAlign="center" width="100%" gap={4}>
                                <VStack gap={1.5} className="flex-1 min-w-0">
                                    <Skeleton height={16} width="45%" radius={2} index={row + 2} />
                                    <Skeleton height={12} width="70%" radius={2} index={row + 3} />
                                </VStack>
                                <Skeleton height={32} width={108} radius={2} index={row + 2} />
                            </HStack>
                        ))}
                    </VStack>
                </Card>
            </VStack>
        </div>
    );
};

/**
 * 播放器路由懒加载骨架：
 * 还原「左侧视频画布 + 控制条 / 右侧分句文稿流」双栏结构，切换进入播放页时不闪烁空白。
 */
export const PlayerLoadingSkeleton: React.FC = () => {
    const { t } = useI18nTranslation('common');

    return (
        <div
            role="status"
            aria-label={t('loading')}
            className="h-full w-full flex overflow-hidden bg-body"
            data-testid="player-loading-skeleton"
        >
            <div className="flex-1 min-w-0 flex flex-col justify-between p-4 gap-4">
                <div className="flex-1 min-h-0 flex items-center justify-center">
                    <div className="w-full max-w-4xl">
                        <AspectRatio ratio={16 / 9}>
                            <Skeleton radius={3} index={0} />
                        </AspectRatio>
                    </div>
                </div>
                <Card variant="muted" padding={2} width="100%">
                    <HStack hAlign="between" vAlign="center" gap={3} width="100%">
                        <HStack gap={2} vAlign="center">
                            <Skeleton height={28} width={28} radius="rounded" index={1} />
                            <Skeleton height={14} width={96} radius={2} index={2} />
                        </HStack>
                        <Skeleton height={8} width="45%" radius="rounded" index={2} />
                        <HStack gap={2} vAlign="center">
                            <Skeleton height={28} width={64} radius={2} index={3} />
                            <Skeleton height={28} width={28} radius={2} index={3} />
                        </HStack>
                    </HStack>
                </Card>
            </div>

            <div className="hidden lg:flex w-[380px] shrink-0 flex-col border-l border-border/50 bg-surface/60 p-4 gap-3">
                <HStack hAlign="between" vAlign="center" width="100%">
                    <Skeleton height={24} width={112} radius={2} index={0} />
                    <HStack gap={1.5}>
                        <Skeleton height={24} width={24} radius={2} index={1} />
                        <Skeleton height={24} width={24} radius={2} index={1} />
                    </HStack>
                </HStack>
                <VStack gap={3} width="100%" className="flex-1 min-h-0 overflow-hidden pt-1">
                    {[0, 1, 2, 3, 4, 5].map((item) => (
                        <Card key={item} variant="transparent" padding={3} width="100%">
                            <VStack gap={2} width="100%">
                                <Skeleton height={10} width={52} radius={1} index={item} />
                                <Skeleton height={14} width="92%" radius={2} index={item} />
                                <Skeleton height={12} width="68%" radius={2} index={item + 1} />
                            </VStack>
                        </Card>
                    ))}
                </VStack>
            </div>
        </div>
    );
};

/**
 * 首页观看历史首屏加载骨架：对齐顶部快捷操作条与三列最近观看卡片网格。
 */
export const HomeLoadingSkeleton: React.FC = () => {
    const { t } = useI18nTranslation('common');

    return (
        <VStack gap={6} width="100%" role="status" aria-label={t('loading')} data-testid="home-loading-skeleton">
            <Card variant="default" padding={3} width="100%">
                <HStack vAlign="center" hAlign="between" gap={4} width="100%">
                    <Skeleton height={18} width={112} radius={2} index={0} />
                    <HStack vAlign="center" gap={3}>
                        <Skeleton height={32} width={132} radius={2} index={1} />
                        <Skeleton height={32} width={132} radius={2} index={2} />
                        <Skeleton height={32} width={132} radius={2} index={3} />
                    </HStack>
                </HStack>
            </Card>

            <VStack gap={3} width="100%">
                <HStack vAlign="center" hAlign="between" width="100%">
                    <Skeleton height={20} width={128} radius={2} index={0} />
                    <Skeleton height={28} width={104} radius={2} index={1} />
                </HStack>
                <Grid columns={{ minWidth: 240, max: 4 }} gap={5}>
                    {[0, 1, 2].map((card) => (
                        <Card key={card} variant="transparent" padding={2} width="100%">
                            <VStack gap={2} width="100%">
                                <AspectRatio ratio={16 / 9}>
                                    <Skeleton radius={2} index={card} />
                                </AspectRatio>
                                <VStack gap={1.5} width="100%">
                                    <Skeleton height={14} width="88%" radius={2} index={card + 1} />
                                    <Skeleton height={12} width="54%" radius={2} index={card + 2} />
                                </VStack>
                            </VStack>
                        </Card>
                    ))}
                </Grid>
            </VStack>

            <VStack gap={2} width="100%">
                <Skeleton height={16} width={108} radius={2} index={0} />
                {[0, 1, 2].map((row) => (
                    <Card key={row} variant="transparent" padding={2} width="100%">
                        <HStack vAlign="center" hAlign="between" gap={3} width="100%">
                            <HStack vAlign="center" gap={3} className="flex-1 min-w-0">
                                <Skeleton height={36} width={64} radius={1} index={row + 1} />
                                <VStack gap={1.5} className="flex-1 min-w-0">
                                    <Skeleton height={14} width="52%" radius={2} index={row + 1} />
                                    <Skeleton height={10} width="28%" radius={1} index={row + 2} />
                                </VStack>
                            </HStack>
                            <Skeleton height={24} width={56} radius={2} index={row + 2} />
                        </HStack>
                    </Card>
                ))}
            </VStack>
        </VStack>
    );
};

/**
 * 语境工坊左侧资产列表首屏加载骨架。
 */
export const ContextStudioListSkeleton: React.FC<{ ariaLabel: string }> = ({ ariaLabel }) => (
    <div
        role="status"
        aria-label={ariaLabel}
        className="p-2 flex flex-col gap-1.5"
        data-testid="context-studio-loading-skeleton"
    >
        {[0, 1, 2, 3, 4, 5].map((item) => (
            <Card key={item} variant="transparent" padding={2} width="100%">
                <VStack gap={1.5} width="100%">
                    <HStack hAlign="between" vAlign="center" width="100%">
                        <Skeleton height={14} width="46%" radius={2} index={item} />
                        <Skeleton height={14} width={44} radius="rounded" index={item} />
                    </HStack>
                    <Skeleton height={12} width="82%" radius={2} index={item + 1} />
                </VStack>
            </Card>
        ))}
    </div>
);
