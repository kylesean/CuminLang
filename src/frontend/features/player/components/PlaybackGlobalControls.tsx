import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { Tooltip } from '@astryxdesign/core/Tooltip';

import { cn } from '@/frontend/lib/utils';
import { usePlayer } from '@/frontend/features/player/playerStore';
import useSetting from '@/frontend/features/settings/settingsStore';
import { formatShortcut } from '@/frontend/features/player/components/formatShortcut';

/**
 * 深色控制条上按钮的 hover 外观。
 *
 * 视频控制条的底色恒为深色（black/60 上叠白字），与应用主题无关，因此不能按 `dark:` 主题分支取反色：
 * 浅色主题下会退化成「背景加暗 + 文字转黑」，在黑底上等于没有 hover 反馈。
 * 本条上的按钮一律取这一份；宿主是亮色时才另给一套（见 learning-toolbar/toolbarStyles）。
 */
export const DARK_BAR_BUTTON_HOVER = 'hover:bg-media-fg/15 hover:text-media-fg';

/** 控制条上带文字的模式按钮：与纯图标按钮同高、同圆角。 */
export const MEDIA_BAR_TEXT_BUTTON = 'flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium leading-none transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current';

/** 控制条上的开启态：统一中性白，不引入第二种语义色。 */
export const MEDIA_BAR_ACTIVE = 'bg-media-fg/20 text-media-fg ring-1 ring-media-fg/25';

/** 控制条按钮分组：模式、学习、播放工具各成一组。 */
export const MEDIA_BAR_GROUP = 'flex shrink-0 items-center gap-1 xl:gap-2';

/** 控制条分组之间的细分隔线。 */
export const MEDIA_BAR_DIVIDER = 'mx-0.5 h-5 w-px shrink-0 bg-media-fg/15';

/**
 * 图标按钮在不同宿主控制条上的样式。
 */
const NAV_ICON_TONE = {
    media: cn(
        'w-7 h-7 flex items-center justify-center rounded-lg text-media-fg/80 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current',
        DARK_BAR_BUTTON_HOVER
    ),
    theme: 'w-7 h-7 flex items-center justify-center rounded-lg text-secondary hover:bg-muted hover:text-primary transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
} as const;

const PLAY_BUTTON_TONE = {
    media: 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-media-fg/10 hover:bg-media-fg/20 text-media-fg/95 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current',
    theme: 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 hover:bg-primary/15 text-primary active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
} as const;

/**
 * 播放导航控件：上一句 / 播放暂停 / 下一句。
 *
 * 普通视图、全屏视图与播客控制条共用；播放状态与指令直接读播放器 store，
 * 不自带文案，因此各控制条的落点与宽度一致。
 *
 * @param tone `media` 用于视频深色银幕控制条；`theme` 用于跟随应用主题的播客控制条。
 * @returns 播放导航控件。
 */
export function PlaybackNavControls({ tone = 'media' }: { tone?: 'media' | 'theme' } = {}) {
    const { t } = useI18nTranslation('player');
    const playing = usePlayer((s) => s.playing);
    const prevShortcut = useSetting((s) => s.setting('shortcut.previousSentence'));
    const nextShortcut = useSetting((s) => s.setting('shortcut.nextSentence'));
    const playPauseShortcut = useSetting((s) => s.setting('shortcut.playPause'));
    const iconButtonClass = NAV_ICON_TONE[tone];
    const playButtonClass = PLAY_BUTTON_TONE[tone];

    return (
        <div className="flex items-center gap-1 shrink-0">
            <Tooltip content={`${t('controlBar.prevSentence')}${formatShortcut(prevShortcut)}`} placement="above">
                <button
                    type="button"
                    onClick={() => { void usePlayer.getState().prevSentence(); }}
                    aria-label={t('controlBar.prevSentence')}
                    className={iconButtonClass}
                >
                    <SkipBack className="w-3.5 h-3.5" />
                </button>
            </Tooltip>

            <Tooltip content={`${playing ? t('controlBar.pause') : t('controlBar.play')}${formatShortcut(playPauseShortcut)}`} placement="above">
                <button
                    type="button"
                    onClick={() => usePlayer.getState().togglePlay()}
                    aria-label={playing ? t('controlBar.pause') : t('controlBar.play')}
                    className={playButtonClass}
                >
                    {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
            </Tooltip>

            <Tooltip content={`${t('controlBar.nextSentence')}${formatShortcut(nextShortcut)}`} placement="above">
                <button
                    type="button"
                    onClick={() => { void usePlayer.getState().nextSentence(); }}
                    aria-label={t('controlBar.nextSentence')}
                    className={iconButtonClass}
                >
                    <SkipForward className="w-3.5 h-3.5" />
                </button>
            </Tooltip>
        </div>
    );
}
