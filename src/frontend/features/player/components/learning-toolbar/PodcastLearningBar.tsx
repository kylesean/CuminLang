import { CirclePause, Repeat1 } from 'lucide-react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { Tooltip } from '@astryxdesign/core/Tooltip';

import { cn } from '@/frontend/lib/utils';
import { usePlayer } from '@/frontend/features/player/playerStore';
import useSetting from '@/frontend/features/settings/settingsStore';
import { formatShortcut } from '@/frontend/features/player/components/formatShortcut';
import PracticeModeButton from '@/frontend/features/player/components/srt-layout/PracticeModeButton';
import PlayerSettingsPopover from './PlayerSettingsPopover';
import { CONTROL_POPOVER_OFFSET_STACKED_BAR } from '@/frontend/features/player/components/ControlPopover';
import SubtitleTrackSegmented from './SubtitleTrackSegmented';
import {
    TOOLBAR_DIVIDER,
    TOOLBAR_ICON_BUTTON,
    TOOLBAR_TONE,
} from './toolbarStyles';

/**
 * 播客模式下的精简学习控制组（内嵌于底部播客控制条，不悬浮遮挡字幕流）。
 *
 * 保留听读时最常用的四类能力：轨道切换、单句循环、句末暂停、跟读与设置；
 * 与主字幕区学习台共用同一个组件原语与状态。
 */
export default function PodcastLearningBar({ className }: { className?: string }) {
    const { t } = useI18nTranslation('player');
    const singleRepeat = usePlayer((s) => s.singleRepeat);
    const autoPause = usePlayer((s) => s.autoPause);
    const repeatShortcut = useSetting((s) => s.setting('shortcut.repeatSingleSentence'));
    const autoPauseShortcut = useSetting((s) => s.setting('shortcut.autoPause'));

    const style = TOOLBAR_TONE.panel;

    return (
        <div
            role="group"
            aria-label={t('controlBar.groupLearning', { defaultValue: '学习动作' })}
            className={cn('inline-flex items-center gap-1', className)}
        >
            <SubtitleTrackSegmented tone="panel" />

            <span className={cn(TOOLBAR_DIVIDER, style.divider)} />

            <Tooltip
                content={`${t('controlBar.modeSingleRepeat')}${formatShortcut(repeatShortcut)}`}
                placement="above"
            >
                <button
                    type="button"
                    onClick={() => usePlayer.getState().setSingleRepeat(!singleRepeat)}
                    aria-pressed={singleRepeat}
                    aria-label={t('controlBar.modeSingleRepeat')}
                    className={cn(
                        TOOLBAR_ICON_BUTTON,
                        singleRepeat ? style.accent.amber : style.idle
                    )}
                >
                    <Repeat1 className="w-4 h-4 stroke-[2]" />
                </button>
            </Tooltip>

            <Tooltip
                content={`${t('controlBar.modeAutoPause')}${formatShortcut(autoPauseShortcut)}`}
                placement="above"
            >
                <button
                    type="button"
                    onClick={() => usePlayer.getState().setAutoPause(!autoPause)}
                    aria-pressed={autoPause}
                    aria-label={t('controlBar.modeAutoPause')}
                    className={cn(
                        TOOLBAR_ICON_BUTTON,
                        autoPause ? style.accent.emerald : style.idle
                    )}
                >
                    <CirclePause className="w-4 h-4 stroke-[2]" />
                </button>
            </Tooltip>

            <span className={cn(TOOLBAR_DIVIDER, style.divider)} />

            <PracticeModeButton variant="toolbar" />
            <PlayerSettingsPopover tone="panel" popoverOffset={CONTROL_POPOVER_OFFSET_STACKED_BAR} />
        </div>
    );
}
