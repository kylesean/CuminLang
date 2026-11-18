/**
 * 播放器时间驱动（`onTimeUpdate`）的显式互斥仲裁器。
 *
 * 此前 `tailPreview`、`clipStopBound`、`seekInFlight`、`onPlaySeekTime`、`transientPlan`
 * 在 `onTimeUpdate` 中靠散落的顺序 `if` 瀑布隐式抢占控制权。
 * 抽成单一纯函数决策器后，优先级与互斥语义完全自解释且可被纯单测钉死。
 */
export type PlaybackInterventionStage =
    /** 句末微调后的 1 秒尾部预览（倒计时结束即回到句首）。 */
    | 'tail-preview'
    /** 练习工坊（跟读/精听）托管的受控起停试听区间。 */
    | 'practice-clip'
    /** seek 尚未落地或自动暂停待续播，当前 playbackTime 不可用于句末判定。 */
    | 'seeking'
    /** 单句循环 / 影子留白 / 连播等瞬态句内计划。 */
    | 'transient-plan'
    /** 常规播放 + 全局句末模式（自动暂停 / 单句循环 / 影子跟读 / 正常回写）。 */
    | 'sentence-end'
    /** 尚未加载字幕或无时间驱动职责。 */
    | 'idle';

export interface PlaybackInterventionSnapshot {
    tailPreviewActive: boolean;
    hasClipStopBound: boolean;
    hasSrtTender: boolean;
    seekInFlight: boolean;
    onPlaySeekTime: number | null;
    hasTransientPlan: boolean;
}

/**
 * 按唯一优先级推导当前时间步应由哪个子系统接管：
 * `tail-preview` > `practice-clip` > `seeking` > `transient-plan` > `sentence-end` > `idle`。
 */
export function resolvePlaybackIntervention(
    snapshot: PlaybackInterventionSnapshot,
): PlaybackInterventionStage {
    if (snapshot.tailPreviewActive) {
        return 'tail-preview';
    }
    if (snapshot.hasClipStopBound) {
        return 'practice-clip';
    }
    if (!snapshot.hasSrtTender) {
        return 'idle';
    }
    if (snapshot.seekInFlight || snapshot.onPlaySeekTime !== null) {
        return 'seeking';
    }
    if (snapshot.hasTransientPlan) {
        return 'transient-plan';
    }
    return 'sentence-end';
}
