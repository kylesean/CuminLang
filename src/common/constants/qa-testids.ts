/**
 * 产品与 e2e 共用的稳定定位标识。
 *
 * 只放「结构性容器/导航/无自然可访问名称的关键控件」；
 * 按钮、tab、dialog 仍应优先用 role + accessible name。
 * 产品侧与 qa/ 共用同一份常量，改名会在 tsc 阶段直接失败。
 */

/** 主导航条目。 */
export const NAV_TESTIDS = {
    home: 'nav-home',
    player: 'nav-player',
    reader: 'nav-reader',
    vocabulary: 'nav-vocabulary',
    settings: 'nav-settings',
} as const;

/** 应用外壳与引导视图。 */
export const APP_SHELL_TESTIDS = {
    root: 'app-root',
    onboardingView: 'onboarding-view',
    titleBarHeader: 'title-bar-header',
    titleBarMinimizeIcon: 'title-bar-minimize-icon',
    titleBarBack: 'title-bar-back',
    titleBarForward: 'title-bar-forward',
} as const;

/** 设置中心左侧导航容器。 */
export const SETTINGS_SIDEBAR_TESTID = 'settings-sidebar';

/** 设置中心左侧栏目导航。 */
export const SETTINGS_NAV_TESTIDS = {
    shortcut: 'settings-nav-shortcut',
    appearance: 'settings-nav-appearance',
    resources: 'settings-nav-resources',
    storage: 'settings-nav-storage',
    proxy: 'settings-nav-proxy',
    mobile: 'settings-nav-mobile',
    import: 'settings-nav-import',
    about: 'settings-nav-about',
} as const;

/** 设置中心栏目键。 */
export type SettingsSectionKey = keyof typeof SETTINGS_NAV_TESTIDS;

/** 设置行容器标识。 */
export const SETTING_ROW_TESTIDS = {
    subtitleTranslation: 'setting-row-subtitle-translation',
    dictionary: 'setting-row-dictionary',
    sentenceLearning: 'setting-row-sentence-learning',
    transcription: 'setting-row-transcription',
    apiFormat: 'setting-row-api-format',
    language: 'setting-row-language',
} as const;

/** 设置行键。 */
export type SettingRowKey = keyof typeof SETTING_ROW_TESTIDS;

/** 设置页内稳定元素标识。 */
export const SETTING_ITEM_TESTIDS = {
    shortcutRow: 'shortcut-row',
    mobileAccessUrl: 'mobile-access-url',
    providerPresetEndpoint: 'provider-preset-endpoint',
    providerPresetFormat: 'provider-preset-format',
} as const;

/** 厂商预设卡片 testid 构造器。 */
export const providerPresetCardTestId = (presetId: string): string => `provider-preset-${presetId}`;

/** 云端模型列表行 testid 构造器。 */
export const modelRowTestId = (model: string): string => `model-row-${model}`;

/** 首页观看历史卡片 testid 前缀与构造器。 */
export const WATCH_HISTORY_CARD_TESTID_PREFIX = 'watch-history-card-';
export const watchHistoryCardTestId = (videoId: string): string => `${WATCH_HISTORY_CARD_TESTID_PREFIX}${videoId}`;

/** 播放器界面核心结构标识。 */
export const PLAYER_UI_TESTIDS = {
    mainSubtitleScroller: 'main-subtitle-scroller',
    mainSubtitleContent: 'main-subtitle-content',
    playbackSplitHandleInner: 'playback-split-handle-inner',
    playbackSplitHandleOuter: 'playback-split-handle-outer',
    podcastModeButton: 'player-control-podcast-mode-button',
    podcastSentenceCounter: 'podcast-sentence-counter',
    podcastSentenceProgress: 'podcast-sentence-progress',
    podcastBlindToggle: 'podcast-blind-toggle',
    podcastTranscriptToggle: 'podcast-transcript-toggle',
} as const;

/** 字幕/讲稿词汇注释状态测试标识。 */
export const VOCAB_ANNOTATION_TESTIDS = {
    learning: 'vocab-annotation-learning',
    familiar: 'vocab-annotation-familiar',
} as const;
