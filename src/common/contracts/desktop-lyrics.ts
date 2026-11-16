/** 桌面整句浮窗可向主播放器下发的控制指令。 */
export const DESKTOP_LYRICS_COMMANDS = [
    'toggle-play',
    'prev-sentence',
    'next-sentence',
    'toggle-single-repeat',
    'focus-main',
] as const;

export type DesktopLyricsCommandType = (typeof DESKTOP_LYRICS_COMMANDS)[number];

/** 主播放器同步到桌面浮窗的当前句与播放状态快照。 */
export interface DesktopLyricsSnapshot {
    /** 当前是否已加载媒体文件。 */
    hasMedia: boolean;
    /** 当前是否正在播放。 */
    playing: boolean;
    /** 是否开启单句循环。 */
    singleRepeat: boolean;
    /** 当前媒体标题（文件名）。 */
    videoTitle: string;
    /** 当前句英文原文。 */
    text: string;
    /** 当前句中文译文（优先 AI/外挂译文，回退字幕自带译文）。 */
    translation: string;
    /** 当前句唯一键，用于同步高亮与去重。 */
    sentenceKey: string | null;
}

/** 桌面浮窗本身的开关与鼠标穿透状态。 */
export interface DesktopLyricsWindowState {
    /** 桌面浮窗是否处于开启显示状态。 */
    open: boolean;
    /** 是否锁定鼠标事件穿透（开启后不遮挡桌面其他窗口点击）。 */
    locked: boolean;
}

/** 查询或广播给渲染端的完整桌面浮窗状态载荷。 */
export interface DesktopLyricsStatePayload {
    windowState: DesktopLyricsWindowState;
    snapshot: DesktopLyricsSnapshot;
}

/** 生成空的播放状态快照。 */
export function createEmptyDesktopLyricsSnapshot(): DesktopLyricsSnapshot {
    return {
        hasMedia: false,
        playing: false,
        singleRepeat: false,
        videoTitle: '',
        text: '',
        translation: '',
        sentenceKey: null,
    };
}
