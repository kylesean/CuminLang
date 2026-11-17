import { useCallback, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import type { SubtitleTrackOrigin } from '@/common/contracts/subtitle-resolution';
import useDpTaskCenter from '@/frontend/app/stores/dpTaskStore';
import { syncSubtitleTrackMutation } from '@/frontend/features/player/lib/syncSubtitleTrackMutation';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { playerApi } from '@/frontend/features/player/playerApi';
import { useSubtitleGenerationStore } from '@/frontend/features/player/subtitleGenerationStore';

const ORIGIN_KEY_MAP: Record<SubtitleTrackOrigin, string> = {
    user_edited: 'subtitleOrigin.userEdited',
    local_asr: 'subtitleOrigin.localAsr',
    author: 'subtitleOrigin.author',
    auto_asr: 'subtitleOrigin.autoAsr',
    external: 'subtitleOrigin.external',
};

/**
 * 封装当前播放视频的字幕轨道诊断、切换、本地重新识别与放弃修订还原基线动作，
 * 供文稿顶部提示条与播放设置弹层共用，避免多处重复状态协调。
 */
export function useSubtitleTrackActions() {
    const { t } = useI18nTranslation('player');
    const [switchingTrack, setSwitchingTrack] = useState(false);
    const [discardingEdited, setDiscardingEdited] = useState(false);

    const videoId = usePlaybackSession((s) => s.videoId);
    const videoPath = usePlaybackSession((s) => s.videoPath);
    const subtitlePath = usePlaybackSession((s) => s.subtitlePath);
    const subtitleOrigin = usePlaybackSession((s) => s.subtitleOrigin);
    const subtitleQualityIssue = usePlaybackSession((s) => s.subtitleQualityIssue);
    const subtitleTracks = usePlaybackSession((s) => s.subtitleTracks);
    const srtHash = usePlaybackSession((s) => s.srtHash);
    const originHintDismissed = usePlaybackSession((s) =>
        Boolean(s.videoId && s.dismissedOriginHintVideos[s.videoId]),
    );

    const taskId = useSubtitleGenerationStore((s) => (videoId ? s.taskIdsByVideo[videoId] : undefined));
    const starting = useSubtitleGenerationStore((s) => (videoId ? Boolean(s.startingVideos[videoId]) : false));
    const cancelling = useSubtitleGenerationStore((s) => (videoId ? Boolean(s.cancellingVideos[videoId]) : false));
    const task = useDpTaskCenter((s) => (taskId !== undefined ? s.tasks.get(taskId) : undefined));

    const generationPhase = cancelling
        ? 'cancelling'
        : taskId !== undefined
            ? 'running'
            : starting
                ? 'starting'
                : 'idle';
    const isGenerating = generationPhase !== 'idle';
    const generationProgress = task && task !== 'init' ? task.progress ?? null : null;

    const localAsrTrack = useMemo(
        () => subtitleTracks.find((track) => track.origin === 'local_asr' && !track.active) ?? null,
        [subtitleTracks],
    );

    const editedTrack = useMemo(
        () => subtitleTracks.find((track) => track.origin === 'user_edited') ?? null,
        [subtitleTracks],
    );

    // buildSubtitleTrackOptions 已按 local_asr > author > external > auto_asr 排好序，
    // 这里直接取第一条非人工编辑轨作为还原基线。
    const baselineTrack = useMemo(
        () => subtitleTracks.find((track) => track.origin !== 'user_edited') ?? null,
        [subtitleTracks],
    );

    const originLabel = useCallback(
        (origin: SubtitleTrackOrigin) => t(ORIGIN_KEY_MAP[origin]),
        [t],
    );

    const switchTrack = useCallback(async (targetPath: string) => {
        if (!videoId || !videoPath || !targetPath || targetPath === subtitlePath || switchingTrack) {
            return;
        }
        setSwitchingTrack(true);
        try {
            await playerApi.attachSubtitleTrack(videoPath, targetPath);
            const resolution = await playerApi.getPlayerSubtitle(videoId);
            if (usePlaybackSession.getState().videoId !== videoId) {
                return;
            }
            usePlaybackSession.getState().updateSubtitleResolution(resolution);
            toast.success(t('subtitleOrigin.trackSwitched'));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(t('subtitleOrigin.trackSwitchFailed', { message }));
        } finally {
            setSwitchingTrack(false);
        }
    }, [subtitlePath, switchingTrack, t, videoId, videoPath]);

    const regenerateLocalSubtitle = useCallback(async () => {
        if (!videoId || isGenerating) {
            return;
        }
        await useSubtitleGenerationStore.getState().start(
            videoId,
            {
                done: t('subtitleGeneration.done'),
                formatFailed: (message) => t('subtitleGeneration.failed', { message }),
            },
            { regenerate: true },
        );
    }, [isGenerating, t, videoId]);

    const cancelGeneration = useCallback(async () => {
        if (!videoId || taskId === undefined || cancelling) {
            return;
        }
        await useSubtitleGenerationStore.getState().cancel(
            videoId,
            (message) => t('subtitleGeneration.failed', { message }),
        );
    }, [cancelling, t, taskId, videoId]);

    const dismissOriginHint = useCallback(() => {
        if (!videoId) return;
        usePlaybackSession.getState().dismissSubtitleOriginHint(videoId);
    }, [videoId]);

    const discardEditedTrack = useCallback(async () => {
        if (!videoId || !editedTrack || !baselineTrack || discardingEdited || isGenerating) {
            return false;
        }
        setDiscardingEdited(true);
        try {
            const response = await playerApi.discardEditedSubtitle({
                videoId,
                ...(videoPath ? { videoPath } : {}),
                editedSubtitlePath: editedTrack.path,
                targetSubtitlePath: baselineTrack.path,
                ...(srtHash && subtitleOrigin === 'user_edited' ? { currentFileHash: srtHash } : {}),
            });
            if (usePlaybackSession.getState().videoId !== videoId) {
                return false;
            }
            syncSubtitleTrackMutation(videoId, response);
            toast.success(
                baselineTrack.origin === 'local_asr'
                    ? t('subtitleOrigin.restoredToLocal')
                    : t('subtitleOrigin.restoredToBaseline'),
            );
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(t('subtitleOrigin.restoreFailed', { message }));
            return false;
        } finally {
            setDiscardingEdited(false);
        }
    }, [baselineTrack, discardingEdited, editedTrack, isGenerating, srtHash, subtitleOrigin, t, videoId, videoPath]);

    return {
        videoId,
        subtitlePath,
        subtitleOrigin,
        subtitleQualityIssue,
        subtitleTracks,
        originHintDismissed,
        localAsrTrack,
        editedTrack,
        baselineTrack,
        isGenerating,
        generationPhase,
        generationProgress,
        cancelling,
        taskId,
        switchingTrack,
        discardingEdited,
        originLabel,
        switchTrack,
        regenerateLocalSubtitle,
        cancelGeneration,
        dismissOriginHint,
        discardEditedTrack,
    };
}
