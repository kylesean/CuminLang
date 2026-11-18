import { useTranslation as useI18nTranslation } from 'react-i18next';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Captions } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import useDpTaskCenter from '@/frontend/app/stores/dpTaskStore';
import {
    canCancelSubtitleGeneration,
    deriveSubtitleGenerationState,
} from '@/frontend/features/player/lib/subtitle-generation-phase';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { useSubtitleGenerationStore } from '@/frontend/features/player/subtitleGenerationStore';
import { formatDpTaskProgress } from '@/frontend/i18n/dpTaskProgress';

/**
 * 无字幕视频的字幕生成入口。
 *
 * 仅在播放页 ``没有可用字幕`` 时渲染：点击后用本地 ASR 生成 SRT，
 * 任务生命周期由 `useSubtitleGenerationStore` 按 videoId 托管；切换视频后返回仍可恢复进度与取消控制。
 */
export default function SubtitleGenerationPanel() {
    const { t } = useI18nTranslation('player');
    const videoId = usePlaybackSession((s) => s.videoId);
    const { phase, taskId, running } = useSubtitleGenerationStore(
        useShallow((s) => deriveSubtitleGenerationState(s, videoId)),
    );
    const startGeneration = useSubtitleGenerationStore((s) => s.start);
    const cancelGeneration = useSubtitleGenerationStore((s) => s.cancel);
    const task = useDpTaskCenter((s) => (taskId !== undefined ? s.tasks.get(taskId) : undefined));
    const cancelling = phase === 'cancelling';
    const progress = formatDpTaskProgress(task);

    const formatFailed = (message: string) => t('subtitleGeneration.failed', { message });

    const start = async (): Promise<void> => {
        if (!videoId || running) {
            return;
        }
        await startGeneration(videoId, {
            done: t('subtitleGeneration.done'),
            formatFailed,
        });
    };

    /**
     * 请求取消当前任务；终态仍以任务中心推送的 CANCELLED 为准。
     */
    const cancel = async (): Promise<void> => {
        if (!videoId || !canCancelSubtitleGeneration(phase)) {
            return;
        }
        await cancelGeneration(videoId, formatFailed);
    };

    return (
        <VStack
            align="center"
            justify="center"
            gap={3}
            padding={6}
            width="100%"
            height="100%"
            data-testid="subtitle-generation-panel"
            data-state={phase}
            aria-busy={phase === 'starting' || phase === 'cancelling'}
        >
            <Captions className="h-10 w-10 text-secondary" />
            <Text type="supporting" color="secondary">{t('subtitleGeneration.title')}</Text>
            <Text type="supporting" color="secondary" role="status" aria-live="polite">
                {running ? (progress ?? t('subtitleGeneration.running')) : t('subtitleGeneration.description')}
            </Text>
            <HStack gap={2}>
                {running ? (
                    <Button
                        variant="secondary"
                        label={t('subtitleGeneration.cancel')}
                        isLoading={cancelling}
                        isDisabled={!canCancelSubtitleGeneration(phase)}
                        onClick={() => void cancel()}
                    />
                ) : (
                    <Button
                        variant="primary"
                        label={t('subtitleGeneration.start')}
                        isDisabled={!videoId}
                        onClick={() => void start()}
                    />
                )}
            </HStack>
        </VStack>
    );
}
