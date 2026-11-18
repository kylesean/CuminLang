/**
 * 移动端播放页句末播放模式：互斥单值，消除 `repeatOn` 与 `autoPauseOn` 并存的非法状态。
 */
export type MobileSentenceEndMode = 'off' | 'repeat' | 'auto-pause';

/**
 * 切换移动端句末模式：请求当前已开启的模式则关闭，请求另一模式则互斥切换。
 */
export function toggleMobileSentenceEndMode(
    current: MobileSentenceEndMode,
    requested: 'repeat' | 'auto-pause',
): MobileSentenceEndMode {
    return current === requested ? 'off' : requested;
}
