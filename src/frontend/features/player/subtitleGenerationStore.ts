import { toast } from 'react-hot-toast';
import { create } from 'zustand';
import { type DpTask, DpTaskState, isTerminalDpTaskState } from '@/common/contracts/dp-task';
import useDpTaskCenter from '@/frontend/app/stores/dpTaskStore';
import {
    deriveSubtitleGenerationState,
    type SubtitleGenerationMapsSnapshot,
} from '@/frontend/features/player/lib/subtitle-generation-phase';
import { usePlaybackSession } from '@/frontend/features/player/playbackSessionStore';
import { playerApi } from '@/frontend/features/player/playerApi';

export type SubtitleGenerationMessages = {
    done: string;
    formatFailed: (message: string) => string;
};

export type SubtitleGenerationStartOptions = {
    /** 是否以 `.local.srt` 独立轨重生成（不覆盖原有外挂或平台字幕）。 */
    regenerate?: boolean;
    /** 任务成功完成后的附加回调（供精读文稿等非播放器页面自动热刷新文档）。 */
    onDone?: (videoId: string) => void;
};

type SubtitleGenerationState = {
    taskIdsByVideo: Record<string, number>;
    startingVideos: Record<string, boolean>;
    cancellingVideos: Record<string, boolean>;
    start: (
        videoId: string,
        messages: SubtitleGenerationMessages,
        options?: SubtitleGenerationStartOptions,
    ) => Promise<void>;
    cancel: (videoId: string, formatFailed: (message: string) => string) => Promise<void>;
};

const clearVideoEntry = (
    state: SubtitleGenerationState,
    videoId: string,
): Partial<SubtitleGenerationState> => {
    const nextTasks = { ...state.taskIdsByVideo };
    const nextStarting = { ...state.startingVideos };
    const nextCancelling = { ...state.cancellingVideos };
    delete nextTasks[videoId];
    delete nextStarting[videoId];
    delete nextCancelling[videoId];
    return {
        taskIdsByVideo: nextTasks,
        startingVideos: nextStarting,
        cancellingVideos: nextCancelling,
    };
};

/**
 * 按视频 ID 维度追踪字幕生成后台任务：
 * 切走再切回同一视频可恢复进度与取消入口；旧视频任务完成时绝不篡改当前已切换到的新视频会话。
 */
export const useSubtitleGenerationStore = create<SubtitleGenerationState>((set, get) => ({
    taskIdsByVideo: {},
    startingVideos: {},
    cancellingVideos: {},

    start: async (videoId, messages, options) => {
        if (!videoId) return;
        const { phase } = deriveSubtitleGenerationState(get(), videoId);
        if (phase !== 'idle') {
            return;
        }

        set((state) => ({
            startingVideos: { ...state.startingVideos, [videoId]: true },
        }));

        try {
            const id = await useDpTaskCenter.getState().register(
                () => (options?.regenerate
                    ? playerApi.startSubtitleGeneration(videoId, { regenerate: true })
                    : playerApi.startSubtitleGeneration(videoId)),
                {
                    onFinish: (task: DpTask) => {
                        set((state) => clearVideoEntry(state, videoId));

                        if (task.status === DpTaskState.DONE) {
                            toast.success(messages.done);
                            options?.onDone?.(videoId);
                            // 只有用户仍停留在该视频上时才解析路径并重载字幕；切去别的视频绝不能覆盖新会话。
                            if (usePlaybackSession.getState().videoId !== videoId) {
                                return;
                            }
                            void (async () => {
                                try {
                                    const resolution = await playerApi.getPlayerSubtitle(videoId);
                                    if (usePlaybackSession.getState().videoId !== videoId) {
                                        return;
                                    }
                                    const session = usePlaybackSession.getState();
                                    if (typeof session.updateSubtitleResolution === 'function') {
                                        session.updateSubtitleResolution(resolution);
                                    } else if (resolution.subtitlePath) {
                                        session.updateFile(resolution.subtitlePath);
                                    }
                                    session.reloadSubtitles();
                                } catch (error) {
                                    toast.error(messages.formatFailed(
                                        error instanceof Error ? error.message : String(error),
                                    ));
                                }
                            })();
                            return;
                        }

                        if (task.status === DpTaskState.FAILED) {
                            toast.error(messages.formatFailed(String(task.result ?? '')));
                        }
                    },
                },
            );

            // 若任务在 register 返回前已秒级进入终态，不要再把已结束的 taskId 写回活跃映射。
            const latestTask = useDpTaskCenter.getState().tasks.get(id);
            if (latestTask && latestTask !== 'init' && isTerminalDpTaskState(latestTask.status)) {
                set((state) => clearVideoEntry(state, videoId));
                return;
            }

            const cancelPendingDuringStart = Boolean(get().cancellingVideos[videoId]);
            set((state) => {
                const nextStarting = { ...state.startingVideos };
                delete nextStarting[videoId];
                return {
                    startingVideos: nextStarting,
                    taskIdsByVideo: { ...state.taskIdsByVideo, [videoId]: id },
                };
            });

            // 若用户在 `starting` 窗口期内就点击了取消，拿到 taskId 后立刻补发取消请求。
            if (cancelPendingDuringStart) {
                try {
                    await playerApi.cancelSubtitleGeneration(id);
                } catch (error) {
                    toast.error(messages.formatFailed(
                        error instanceof Error ? error.message : String(error),
                    ));
                } finally {
                    set((state) => {
                        if (!(videoId in state.cancellingVideos)) {
                            return state;
                        }
                        const next = { ...state.cancellingVideos };
                        delete next[videoId];
                        return { cancellingVideos: next };
                    });
                }
            }
        } catch (error) {
            set((state) => clearVideoEntry(state, videoId));
            toast.error(messages.formatFailed(
                error instanceof Error ? error.message : String(error),
            ));
        }
    },

    cancel: async (videoId, formatFailed) => {
        if (!videoId) return;
        const current: SubtitleGenerationMapsSnapshot = get();
        const { phase, taskId } = deriveSubtitleGenerationState(current, videoId);
        if (phase === 'idle' || phase === 'cancelling') {
            return;
        }
        set((state) => ({
            cancellingVideos: { ...state.cancellingVideos, [videoId]: true },
        }));
        if (taskId === undefined) {
            // 尚在 `starting` 期：由 start() 拿到 taskId 后消费并下发真实取消。
            return;
        }
        try {
            await playerApi.cancelSubtitleGeneration(taskId);
        } catch (error) {
            toast.error(formatFailed(
                error instanceof Error ? error.message : String(error),
            ));
        } finally {
            // 取消请求已收尾（无论成败）即清掉取消中标记。成功路径此前依赖任务随后的
            // FINISH 广播收尾，终态通知一旦丢失，取消按钮会永久停留在"取消中"。
            set((state) => {
                if (!(videoId in state.cancellingVideos)) {
                    return state;
                }
                const next = { ...state.cancellingVideos };
                delete next[videoId];
                return { cancellingVideos: next };
            });
        }
    },
}));
