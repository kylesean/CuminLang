/**
 * 字幕 ASR 生成的显式状态推导与合法转移约束。
 *
 * 此前 3 个视图组件各自用三元表达式拼接 `cancelling / taskId / starting` 推算阶段，
 * 且 `starting` 阶段（`register` 尚未返回 `taskId`）点取消会被静默丢弃。
 * 收敛到本模块后：
 * - 单一真相函数 {@link deriveSubtitleGenerationState} 供 Store 与所有 UI 复用；
 * - 合法转移约束明确表达：允许在 `starting` 期记录取消意图，并在拿到 `taskId` 后立即下发取消。
 */
export type SubtitleGenerationPhase = 'idle' | 'starting' | 'running' | 'cancelling';

export interface SubtitleGenerationMapsSnapshot {
    taskIdsByVideo: Record<string, number>;
    startingVideos: Record<string, boolean>;
    cancellingVideos: Record<string, boolean>;
}

export interface VideoSubtitleGenerationState {
    phase: SubtitleGenerationPhase;
    taskId: number | undefined;
    running: boolean;
}

/**
 * 根据 Store 映射精确推导指定视频的字幕生成阶段。
 *
 * @param snapshot Store 当前三个按视频 ID 索引的记录表。
 * @param videoId 视频 ID；为空时固定返回 `'idle'`。
 * @returns 归一化后的阶段、关联任务 ID 与是否处于活跃态。
 */
export function deriveSubtitleGenerationState(
    snapshot: SubtitleGenerationMapsSnapshot,
    videoId: string | null | undefined,
): VideoSubtitleGenerationState {
    if (!videoId) {
        return { phase: 'idle', taskId: undefined, running: false };
    }
    const taskId = snapshot.taskIdsByVideo[videoId];
    const starting = Boolean(snapshot.startingVideos[videoId]);
    const cancelling = Boolean(snapshot.cancellingVideos[videoId]);

    if (cancelling) {
        return { phase: 'cancelling', taskId, running: true };
    }
    if (taskId !== undefined) {
        return { phase: 'running', taskId, running: true };
    }
    if (starting) {
        return { phase: 'starting', taskId: undefined, running: true };
    }
    return { phase: 'idle', taskId: undefined, running: false };
}

/**
 * 判断该阶段是否允许发起新一轮字幕生成。
 */
export function canStartSubtitleGeneration(phase: SubtitleGenerationPhase): boolean {
    return phase === 'idle';
}

/**
 * 判断该阶段是否允许发起取消（包括任务注册仍在途的 `starting` 窗口期）。
 */
export function canCancelSubtitleGeneration(phase: SubtitleGenerationPhase): boolean {
    return phase === 'starting' || phase === 'running';
}
