/**
 * `PlayerEngine` 卡顿自愈重建与 `seekTime` 之间的显式状态机。
 *
 * 此前 `handleStall()` 写入 `pendingRecoveryRef` 并递增 `recoveryKey` 触发 `<video>` 重挂载，
 * 而重挂载也会触发依赖 `[..., recoveryKey]` 的 `seekTime` effect；若两个 effect 共用
 * 可变 Ref 且未绑定触发重建时的 `seekToken`，同一 `seekTime` 引用下的重跑或并发恢复
 * 容易误清空恢复目标或与新 seek 竞争。
 */
export type StallRecoveryState<TSeek = unknown> =
    | { phase: 'observing' }
    | {
        phase: 'remounting';
        /** 等待重挂载后恢复的播放位置（秒）。 */
        targetTime: number;
        /** 触发重建那一刻的 seekTime 引用，用于区分“同次重建重跑”与“新用户 seek”。 */
        seekTokenAtStart: TSeek;
    };

export const INITIAL_STALL_RECOVERY_STATE: StallRecoveryState<never> = { phase: 'observing' };

/** 进入元素重挂载恢复阶段。 */
export function beginStallRemount<TSeek>(
    targetTime: number,
    seekTokenAtStart: TSeek,
): StallRecoveryState<TSeek> {
    return {
        phase: 'remounting',
        targetTime,
        seekTokenAtStart,
    };
}

/**
 * 在 seek effect 中协调用户新 seek 与在途卡顿恢复：
 * 只有当 `nextSeekToken` 真正变化（用户发起了新一轮 seek）时才作废在途恢复；
 * 仅因 `recoveryKey` 变化引起的同一 `seekTime` 重跑不得误杀本次恢复目标。
 */
export function reconcileRecoveryOnSeek<TSeek>(
    state: StallRecoveryState<TSeek>,
    nextSeekToken: TSeek,
): StallRecoveryState<TSeek> {
    if (state.phase !== 'remounting') {
        return state;
    }
    if (Object.is(state.seekTokenAtStart, nextSeekToken)) {
        return state;
    }
    return { phase: 'observing' };
}

/**
 * `canplay` 就绪时一次性消费待恢复时间点，并原子复位回 `'observing'`。
 */
export function consumeStallRecovery<TSeek>(
    state: StallRecoveryState<TSeek>,
): { targetTime: number | null; nextState: StallRecoveryState<TSeek> } {
    if (state.phase !== 'remounting') {
        return { targetTime: null, nextState: state };
    }
    return {
        targetTime: state.targetTime,
        nextState: { phase: 'observing' },
    };
}
